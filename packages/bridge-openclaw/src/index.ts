/**
 * bridge-openclaw — connects to the OpenClaw gateway via WebSocket RPC and
 * relays messages into ClawChat.
 *
 * VERIFIED PROTOCOL (reverse-engineered from the OpenClaw SPA bundle):
 *   - WebSocket endpoint: ws://<host> (no /ws suffix — the gateway serves the WS at root)
 *   - Message format: { type:"req", id:"<uuid>", method:"<rpc>", params:{...} }
 *   - Response format: { type:"res", id:"<same>", result:{...} } | { type:"res", id, error:{...} }
 *   - Event format:   { type:"event", seq:N, ...data }
 *
 * NOTE: The gateway also serves an SPA UI. The HTTP path
 *   GET /v1/sessions/main/messages returns HTML (SPA catch-all — not a JSON API).
 *   All real data access goes through WebSocket RPC.
 *
 * Flow:
 *   1. Connect to gateway WS
 *   2. Authenticate with request("connect", {token})
 *   3. Poll request("chat.history", {sessionKey, limit}) periodically
 *   4. Stream new events via onEvent callback
 */

import dotenv from 'dotenv';
import WebSocket from 'ws';
import crypto from 'crypto';

dotenv.config();

const CLAWCHAT_URL = process.env.CLAWCHAT_URL ?? 'http://localhost:3001';
const OPENCLAW_WS = process.env.OPENCLAW_WS ?? 'ws://100.102.5.72:18789';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN ?? '698900e334ca63800944174b5d1617cd53f7dc0b4a211794';
const SESSION_KEY = process.env.OPENCLAW_SESSION ?? 'main';
const ACTIVITY_THREAD_TITLE = 'OpenClaw Activity';

// ─── OpenClaw RPC message shapes ───────────────────────────────────────────

interface RpcRequest {
  type: 'req';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface RpcResponse {
  type: 'res';
  id: string;
  result?: unknown;
  error?: { code?: string; message?: string };
}

interface RpcEvent {
  type: 'event';
  seq?: number;
  stream?: string;
  text?: string;
  role?: string;
  kind?: string;
  id?: string;
  [key: string]: unknown;
}

type RpcMessage = RpcRequest | RpcResponse | RpcEvent | { type: string; [key: string]: unknown };

// A chat message as returned by chat.history
interface OpenClawChatMessage {
  id?: string;
  role?: string;       // "user" | "assistant" | "system"
  content?: string;
  text?: string;
  kind?: string;
  stream?: string;
  createdAt?: string | number;
  timestamp?: string | number;
  [key: string]: unknown;
}

// ─── ClawChat REST helpers ─────────────────────────────────────────────────

async function findOrCreateActivityThread(): Promise<string> {
  const res = await fetch(`${CLAWCHAT_URL}/threads`);
  if (!res.ok) throw new Error(`GET /threads failed: ${res.status}`);
  const threads = (await res.json()) as Array<{ id: string; title: string }>;

  const existing = threads.find((t) => t.title === ACTIVITY_THREAD_TITLE);
  if (existing) return existing.id;

  const created = await fetch(`${CLAWCHAT_URL}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: ACTIVITY_THREAD_TITLE }),
  });
  if (!created.ok) throw new Error(`POST /threads failed: ${created.status}`);
  const thread = (await created.json()) as { id: string };
  return thread.id;
}

async function postMessage(
  threadId: string,
  content: string,
  role: string,
  displayType: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const body: Record<string, unknown> = { content, role, displayType };
  if (metadata) body.metadata = metadata;

  const res = await fetch(`${CLAWCHAT_URL}/threads/${threadId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`[bridge] POST message failed: ${res.status} ${await res.text()}`);
  }
}

// ─── Event translation ─────────────────────────────────────────────────────

interface Translated {
  content: string;
  role: string;
  displayType: string;
}

function translateChatMessage(msg: OpenClawChatMessage): Translated | null {
  const role = (msg.role ?? '').toLowerCase();
  const kind = (msg.kind ?? msg.stream ?? '').toLowerCase();
  const text = (msg.content ?? msg.text ?? '') as string;

  // Map OpenClaw roles to ClawChat roles/displayTypes
  if (role === 'assistant' || role === 'agent') {
    if (!text) return null;
    return { content: text, role: 'AGENT', displayType: 'VISIBLE' };
  }

  if (role === 'user') {
    if (!text) return null;
    return { content: text, role: 'USER', displayType: 'VISIBLE' };
  }

  if (role === 'system' || kind === 'system') {
    if (!text) return null;
    // Detect agent lifecycle events by content
    if (/agent.started|start(ing|ed)/i.test(text)) {
      return { content: `agent_started: OpenClaw`, role: 'SYSTEM', displayType: 'GHOST' };
    }
    if (/agent.complet|finish|done/i.test(text)) {
      return { content: `agent_completed: OpenClaw`, role: 'SYSTEM', displayType: 'GHOST' };
    }
    if (/agent.fail|error/i.test(text)) {
      return { content: `agent_failed: OpenClaw — ${text}`, role: 'SYSTEM', displayType: 'GHOST' };
    }
    return { content: text, role: 'SYSTEM', displayType: 'GHOST' };
  }

  // Streaming/tool events
  if (kind === 'stream' || kind === 'tool_use' || kind === 'tool_result') {
    if (!text) return null;
    return { content: `agent_progress: OpenClaw — ${text}`, role: 'SYSTEM', displayType: 'GHOST' };
  }

  // Fallback: if there's text, relay as agent message
  if (text) {
    return { content: text, role: 'AGENT', displayType: 'VISIBLE' };
  }

  return null;
}

// ─── WebSocket RPC client ──────────────────────────────────────────────────

let seenIds = new Set<string>();

class OpenClawRpcClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private closed = false;
  private lastSeq: number | null = null;
  private backoffMs = 800;
  private wsFailures = 0;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly onEvent: (event: RpcEvent) => void,
    private readonly onConnected: () => void,
  ) {}

  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
    this.flushPending(new Error('RPC client stopped'));
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.connected) throw new Error('gateway not connected');
    const id = crypto.randomUUID();
    const msg: RpcRequest = { type: 'req', id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(msg));
      // Timeout after 15s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`RPC timeout: ${method}`));
        }
      }, 15_000);
    });
  }

  private connect(): void {
    if (this.closed) return;

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.wsFailures = 0;
      this.backoffMs = 800;
      console.log('[bridge] OpenClaw WS connected — authenticating…');
      // Wait 750ms then send connect (matches SPA behavior)
      setTimeout(() => this.sendConnect(), 750);
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as RpcMessage;
        this.handleMessage(msg);
      } catch {
        console.warn('[bridge] Failed to parse WS message:', raw.toString().slice(0, 80));
      }
    });

    this.ws.on('error', (err) => {
      console.error('[bridge] OpenClaw WS error:', err.message);
    });

    this.ws.on('close', () => {
      this.flushPending(new Error('WebSocket closed'));
      if (this.closed) return;
      this.wsFailures++;
      const delay = Math.min(this.backoffMs * Math.pow(1.5, Math.min(this.wsFailures, 8)), 60_000);
      console.log(
        `[bridge] OpenClaw WS closed — reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.wsFailures})`,
      );
      setTimeout(() => this.connect(), delay);
    });
  }

  private async sendConnect(): Promise<void> {
    try {
      const result = await this.request('connect', { token: this.token });
      console.log('[bridge] Authenticated with OpenClaw gateway');
      this.onConnected();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      console.error('[bridge] OpenClaw auth failed:', (err as Error).message);
      // WS will close and reconnect automatically
    }
  }

  private handleMessage(msg: RpcMessage): void {
    if (msg.type === 'res') {
      const res = msg as RpcResponse;
      const pending = this.pending.get(res.id);
      if (pending) {
        this.pending.delete(res.id);
        if (res.error) {
          pending.reject(new Error(res.error.message ?? 'RPC error'));
        } else {
          pending.resolve(res.result);
        }
      }
      return;
    }

    if (msg.type === 'event') {
      const event = msg as RpcEvent;
      const seq = typeof event.seq === 'number' ? event.seq : null;
      if (seq !== null) {
        if (this.lastSeq !== null && seq > this.lastSeq + 1) {
          console.warn(`[bridge] Event gap: expected seq ${this.lastSeq + 1}, got ${seq}`);
        }
        this.lastSeq = seq;
      }
      this.onEvent(event);
    }
  }

  private flushPending(err: Error): void {
    for (const { reject } of this.pending.values()) {
      reject(err);
    }
    this.pending.clear();
  }
}

// ─── Chat history polling ──────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3_000;

async function pollChatHistory(
  client: OpenClawRpcClient,
  threadId: string,
): Promise<void> {
  if (!client.connected) return;

  let result: unknown;
  try {
    result = await client.request('chat.history', { sessionKey: SESSION_KEY, limit: 200 });
  } catch (err) {
    // Log at most once per 30 polls
    console.warn('[bridge] chat.history failed:', (err as Error).message);
    return;
  }

  const messages: OpenClawChatMessage[] = Array.isArray((result as Record<string, unknown>)?.messages)
    ? ((result as Record<string, unknown>).messages as OpenClawChatMessage[])
    : Array.isArray(result)
      ? (result as OpenClawChatMessage[])
      : [];

  for (const msg of messages) {
    const id = String(msg.id ?? '');
    if (id && seenIds.has(id)) continue;
    if (id) {
      seenIds.add(id);
      if (seenIds.size > 10_000) {
        seenIds = new Set(Array.from(seenIds).slice(-5_000));
      }
    } else {
      // No ID — skip to avoid duplicate relay on every poll
      continue;
    }

    const translated = translateChatMessage(msg);
    if (translated) {
      console.log(`[bridge] Relaying: [${translated.displayType}] ${translated.content.slice(0, 80)}`);
      await postMessage(
        threadId,
        translated.content,
        translated.role,
        translated.displayType,
        { source: 'openclaw', originalId: id || undefined },
      );
    }
  }
}

function handleRpcEvent(event: RpcEvent, threadId: string): void {
  const id = String(event.id ?? '');
  if (id && seenIds.has(id)) return;
  if (id) seenIds.add(id);

  const stream = (event.stream ?? '').toString();
  const text = (event.text ?? '') as string;

  // Only relay streaming chat text events
  if (stream.startsWith('stream:') && text) {
    postMessage(threadId, `agent_progress: OpenClaw — ${text}`, 'SYSTEM', 'GHOST').catch(console.error);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('[bridge] Starting OpenClaw bridge…');
  console.log(`[bridge] OpenClaw WS: ${OPENCLAW_WS}, session: ${SESSION_KEY}`);
  console.log(`[bridge] ClawChat server: ${CLAWCHAT_URL}`);
  console.log('[bridge] Protocol: WebSocket RPC (type:req/res/event)');

  // Find or create the activity thread in ClawChat
  let threadId: string;
  for (let attempt = 1; ; attempt++) {
    try {
      threadId = await findOrCreateActivityThread();
      console.log(`[bridge] Activity thread: ${threadId}`);
      break;
    } catch (err) {
      console.error(
        `[bridge] Failed to find/create thread (attempt ${attempt}):`,
        (err as Error).message,
      );
      if (attempt >= 10) {
        console.error('[bridge] Giving up after 10 attempts');
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 3_000 * attempt));
    }
  }

  // Create RPC client
  const client = new OpenClawRpcClient(
    OPENCLAW_WS,
    OPENCLAW_TOKEN,
    (event) => handleRpcEvent(event, threadId),
    () => {
      // After connect: start polling chat history
      const tick = async () => {
        if (!client.connected) return;
        await pollChatHistory(client, threadId).catch((err) => {
          console.error('[bridge] pollChatHistory error:', err.message);
        });
        setTimeout(tick, POLL_INTERVAL_MS);
      };
      setTimeout(tick, 0);
    },
  );

  client.start();
}

main().catch((err) => {
  console.error('[bridge] Fatal:', err);
  process.exit(1);
});
