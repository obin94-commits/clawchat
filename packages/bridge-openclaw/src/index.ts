/**
 * bridge-openclaw — Phase 3: Full bidirectional integration
 *
 * Changes from Phase 2:
 * - seenIds is now Map<threadId, Set<string>> (was a single shared Set — bug fix)
 * - All WS message handlers wrapped in try-catch
 * - Full bidirectional: ClawChat user messages → OpenClaw sessions
 * - Multi-agent routing: OPENCLAW_AGENTS JSON array OR single-agent env vars
 * - Sub-agent event forwarding (agent_started / agent_completed)
 * - Memory chip auto-creation from memory file write events
 * - Cost event passthrough (token usage → ClawChat cost_incurred)
 *
 * VERIFIED PROTOCOL (reverse-engineered from OpenClaw SPA bundle):
 *   - WebSocket endpoint: ws://<host>  (no /ws suffix)
 *   - RPC: { type:"req", id:"<uuid>", method:"<rpc>", params:{...} }
 *   - RES: { type:"res", id:"<same>", result:{...} } | { type:"res", id, error:{...} }
 *   - EVT: { type:"event", seq:N, ...data }
 *
 * Multi-agent config (env: OPENCLAW_AGENTS):
 *   JSON array of { name, url, token, sessionKey? }
 *   Falls back to OPENCLAW_WS / OPENCLAW_TOKEN / OPENCLAW_SESSION env vars.
 *
 * Thread routing:
 *   Threads are matched to agents by title prefix "[AgentName]" or containing "@agentname".
 *   Unmatched threads route to the first (default) agent.
 */

import dotenv from 'dotenv';
import WebSocket from 'ws';
import crypto from 'crypto';

dotenv.config();

const CLAWCHAT_URL = process.env.CLAWCHAT_URL ?? 'http://localhost:3001';
const ACTIVITY_THREAD_TITLE = 'OpenClaw Activity';
const POLL_INTERVAL_MS = 3_000;

// ─── Multi-agent config ─────────────────────────────────────────────────────

interface AgentConfig {
  name: string;
  url: string;       // ws:// or wss:// to OpenClaw gateway
  token: string;
  sessionKey?: string;
}

function loadAgentConfigs(): AgentConfig[] {
  const raw = process.env.OPENCLAW_AGENTS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AgentConfig[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[bridge] Loaded ${parsed.length} agent config(s) from OPENCLAW_AGENTS`);
        return parsed;
      }
    } catch (err) {
      console.warn('[bridge] Failed to parse OPENCLAW_AGENTS JSON:', (err as Error).message);
    }
  }
  // Single-agent fallback from individual env vars
  return [{
    name: process.env.OPENCLAW_NAME ?? 'openclaw',
    url: process.env.OPENCLAW_WS ?? 'ws://100.102.5.72:18789',
    token: process.env.OPENCLAW_TOKEN ?? '698900e334ca63800944174b5d1617cd53f7dc0b4a211794',
    sessionKey: process.env.OPENCLAW_SESSION ?? 'main',
  }];
}

const AGENT_CONFIGS = loadAgentConfigs();

// ─── OpenClaw RPC message shapes ────────────────────────────────────────────

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
  // Sub-agent fields
  label?: string;
  model?: string;
  subAgentId?: string;
  parentSessionKey?: string;
  // Tool fields
  tool?: string;
  path?: string;
  filePath?: string;
  // Cost/usage fields
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  [key: string]: unknown;
}

type RpcMessage = RpcRequest | RpcResponse | RpcEvent | { type: string; [key: string]: unknown };

interface OpenClawChatMessage {
  id?: string;
  role?: string;
  content?: string;
  text?: string;
  kind?: string;
  stream?: string;
  createdAt?: string | number;
  timestamp?: string | number;
  [key: string]: unknown;
}

// ─── ClawChat REST helpers ──────────────────────────────────────────────────

async function clawchatGet<T>(path: string): Promise<T> {
  const res = await fetch(`${CLAWCHAT_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function clawchatPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${CLAWCHAT_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

async function findOrCreateThread(title: string): Promise<string> {
  const threads = await clawchatGet<Array<{ id: string; title: string }>>('/threads');
  const existing = threads.find((t) => t.title === title);
  if (existing) return existing.id;
  const created = await clawchatPost<{ id: string }>('/threads', { title });
  return created.id;
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
  try {
    await clawchatPost(`/threads/${threadId}/messages`, body);
  } catch (err) {
    console.error(`[bridge] POST message failed:`, (err as Error).message);
  }
}

async function createMemoryChip(threadId: string, text: string, metadata?: Record<string, unknown>): Promise<void> {
  const body: Record<string, unknown> = { text };
  if (metadata) body.metadata = metadata;
  try {
    await clawchatPost(`/threads/${threadId}/memories`, body);
    console.log(`[bridge] Memory chip created in thread ${threadId}: ${text.slice(0, 60)}`);
  } catch (err) {
    console.error('[bridge] Failed to create memory chip:', (err as Error).message);
  }
}

async function postCostEntry(
  threadId: string,
  agentId: string,
  tokens: number,
  costUsd: number,
): Promise<void> {
  try {
    await clawchatPost(`/threads/${threadId}/cost`, { agentId, tokens, costUsd });
  } catch (err) {
    console.error('[bridge] Failed to post cost entry:', (err as Error).message);
  }
}

// ─── Event translation ──────────────────────────────────────────────────────

interface Translated {
  content: string;
  role: string;
  displayType: string;
}

function translateChatMessage(msg: OpenClawChatMessage): Translated | null {
  const role = (msg.role ?? '').toLowerCase();
  const kind = (msg.kind ?? msg.stream ?? '').toLowerCase();
  const text = (msg.content ?? msg.text ?? '') as string;

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
    if (/agent.started|start(ing|ed)/i.test(text))
      return { content: `agent_started: OpenClaw`, role: 'SYSTEM', displayType: 'GHOST' };
    if (/agent.complet|finish|done/i.test(text))
      return { content: `agent_completed: OpenClaw`, role: 'SYSTEM', displayType: 'GHOST' };
    if (/agent.fail|error/i.test(text))
      return { content: `agent_failed: OpenClaw — ${text}`, role: 'SYSTEM', displayType: 'GHOST' };
    return { content: text, role: 'SYSTEM', displayType: 'GHOST' };
  }
  if (kind === 'stream' || kind === 'tool_use' || kind === 'tool_result') {
    if (!text) return null;
    return { content: `agent_progress: OpenClaw — ${text}`, role: 'SYSTEM', displayType: 'GHOST' };
  }
  if (text) {
    return { content: text, role: 'AGENT', displayType: 'VISIBLE' };
  }
  return null;
}

// ─── WebSocket RPC client ───────────────────────────────────────────────────

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
      console.log('[rpc] OpenClaw WS connected — authenticating…');
      setTimeout(() => this.sendConnect(), 750);
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as RpcMessage;
        this.handleMessage(msg);
      } catch {
        console.warn('[rpc] Failed to parse WS message:', raw.toString().slice(0, 80));
      }
    });

    this.ws.on('error', (err) => {
      console.error('[rpc] OpenClaw WS error:', err.message);
    });

    this.ws.on('close', () => {
      this.flushPending(new Error('WebSocket closed'));
      if (this.closed) return;
      this.wsFailures++;
      const delay = Math.min(this.backoffMs * Math.pow(1.5, Math.min(this.wsFailures, 8)), 60_000);
      console.log(`[rpc] WS closed — reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.wsFailures})`);
      setTimeout(() => this.connect(), delay);
    });
  }

  private async sendConnect(): Promise<void> {
    try {
      await this.request('connect', {
        minProtocol: 3,
        maxProtocol: 3,
        client: { id: 'cli', version: '1.0.0', platform: 'node', mode: 'cli' },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        caps: [],
        commands: [],
        permissions: {},
        auth: { token: this.token },
        locale: 'en-US',
        userAgent: 'clawchat-bridge/1.0.0',
      });
      console.log('[rpc] Authenticated with OpenClaw gateway');
      this.onConnected();
    } catch (err) {
      console.error('[rpc] OpenClaw auth failed:', (err as Error).message);
    }
  }

  private handleMessage(msg: RpcMessage): void {
    try {
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
            console.warn(`[rpc] Event gap: expected seq ${this.lastSeq + 1}, got ${seq}`);
          }
          this.lastSeq = seq;
        }
        this.onEvent(event);
      }
    } catch (err) {
      console.error('[rpc] handleMessage error:', (err as Error).message);
    }
  }

  private flushPending(err: Error): void {
    for (const { reject } of this.pending.values()) {
      reject(err);
    }
    this.pending.clear();
  }
}

// ─── Bridge Agent — one per OpenClaw instance ───────────────────────────────

class OpenClawBridgeAgent {
  /** per-thread dedup: threadId → Set<messageId> */
  private seenIds = new Map<string, Set<string>>();

  /** bidirectional mapping: clawchat threadId ↔ sessionKey */
  private threadToSession = new Map<string, string>();
  private sessionToThread = new Map<string, string>();

  /** most-recently-seen message timestamp per thread, for polling user input */
  private lastUserMsgTime = new Map<string, number>();

  private rpcClient: OpenClawRpcClient;
  private defaultThreadId: string | null = null;

  constructor(
    private readonly config: AgentConfig,
    private readonly agentName: string,
  ) {
    this.rpcClient = new OpenClawRpcClient(
      config.url,
      config.token,
      (event) => this.handleRpcEvent(event),
      () => this.onConnected(),
    );
  }

  /** Register a ClawChat thread as handled by this agent */
  registerThread(threadId: string, sessionKey: string): void {
    this.threadToSession.set(threadId, sessionKey);
    this.sessionToThread.set(sessionKey, threadId);
    console.log(`[${this.agentName}] Thread ${threadId} → session '${sessionKey}'`);
  }

  setDefaultThread(threadId: string): void {
    this.defaultThreadId = threadId;
    const sessionKey = this.config.sessionKey ?? 'main';
    this.registerThread(threadId, sessionKey);
  }

  start(): void {
    this.rpcClient.start();
  }

  /** Send a user message from ClawChat into this OpenClaw session */
  async sendToSession(sessionKey: string, content: string): Promise<void> {
    if (!this.rpcClient.connected) {
      console.warn(`[${this.agentName}] Cannot relay — not connected`);
      return;
    }
    try {
      await this.rpcClient.request('session.input', {
        sessionKey,
        content,
        role: 'user',
      });
      console.log(`[${this.agentName}] Relayed user message to session '${sessionKey}': ${content.slice(0, 60)}`);
    } catch (err) {
      // session.input may not exist in all gateway versions; log and move on
      console.warn(`[${this.agentName}] session.input failed (method may differ):`, (err as Error).message);
    }
  }

  // ── seenIds helpers ────────────────────────────────────────────────────────

  private getSeenSet(threadId: string): Set<string> {
    let s = this.seenIds.get(threadId);
    if (!s) { s = new Set(); this.seenIds.set(threadId, s); }
    return s;
  }

  private hasSeen(threadId: string, id: string): boolean {
    return this.getSeenSet(threadId).has(id);
  }

  private markSeen(threadId: string, id: string): void {
    const s = this.getSeenSet(threadId);
    s.add(id);
    if (s.size > 10_000) {
      this.seenIds.set(threadId, new Set(Array.from(s).slice(-5_000)));
    }
  }

  // ── Connected callback ──────────────────────────────────────────────────────

  private onConnected(): void {
    const tick = async () => {
      if (!this.rpcClient.connected) return;
      for (const [threadId, sessionKey] of this.threadToSession) {
        try {
          await this.pollChatHistory(threadId, sessionKey);
        } catch (err) {
          console.error(`[${this.agentName}] pollChatHistory error:`, (err as Error).message);
        }
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    };
    setTimeout(tick, 0);

    // Also poll ClawChat for new user messages to relay to OpenClaw
    const inputTick = async () => {
      for (const [threadId, sessionKey] of this.threadToSession) {
        try {
          await this.pollClawChatForUserInput(threadId, sessionKey);
        } catch (err) {
          console.error(`[${this.agentName}] pollClawChatForUserInput error:`, (err as Error).message);
        }
      }
      setTimeout(inputTick, POLL_INTERVAL_MS);
    };
    setTimeout(inputTick, 1_500); // offset from history poll
  }

  // ── Poll OpenClaw chat history → ClawChat ──────────────────────────────────

  private async pollChatHistory(threadId: string, sessionKey: string): Promise<void> {
    let result: unknown;
    try {
      result = await this.rpcClient.request('chat.history', { sessionKey, limit: 200 });
    } catch (err) {
      console.warn(`[${this.agentName}] chat.history failed:`, (err as Error).message);
      return;
    }

    const messages: OpenClawChatMessage[] = Array.isArray((result as Record<string, unknown>)?.messages)
      ? ((result as Record<string, unknown>).messages as OpenClawChatMessage[])
      : Array.isArray(result) ? (result as OpenClawChatMessage[]) : [];

    for (const msg of messages) {
      const id = String(msg.id ?? '');
      if (!id) continue;
      if (this.hasSeen(threadId, id)) continue;
      this.markSeen(threadId, id);

      const translated = translateChatMessage(msg);
      if (translated) {
        console.log(`[${this.agentName}] → ClawChat [${translated.displayType}] ${translated.content.slice(0, 80)}`);
        await postMessage(
          threadId,
          translated.content,
          translated.role,
          translated.displayType,
          { source: 'openclaw', agent: this.agentName, originalId: id },
        );
      }
    }
  }

  // ── Poll ClawChat for user messages → OpenClaw ─────────────────────────────

  private async pollClawChatForUserInput(threadId: string, sessionKey: string): Promise<void> {
    type ClawMsg = { id: string; role: string; content: string; metadata?: string | null; createdAt: string };
    const messages = await clawchatGet<ClawMsg[]>(`/threads/${threadId}/messages`);

    const lastTime = this.lastUserMsgTime.get(threadId) ?? 0;
    let newLastTime = lastTime;

    for (const msg of messages) {
      if (msg.role !== 'USER') continue;

      const msgTime = new Date(msg.createdAt).getTime();
      if (msgTime <= lastTime) continue;

      // Skip messages that originated from OpenClaw (avoid echo)
      let meta: Record<string, unknown> = {};
      try { meta = msg.metadata ? JSON.parse(msg.metadata) as Record<string, unknown> : {}; } catch {}
      if (meta.source === 'openclaw') continue;

      // Relay to OpenClaw session
      await this.sendToSession(sessionKey, msg.content);
      newLastTime = Math.max(newLastTime, msgTime);
    }

    if (newLastTime > lastTime) {
      this.lastUserMsgTime.set(threadId, newLastTime);
    }
  }

  // ── Handle live RPC events from OpenClaw ───────────────────────────────────

  private handleRpcEvent(event: RpcEvent): void {
    try {
      const threadId = this.defaultThreadId;
      if (!threadId) return;

      const id = String(event.id ?? '');
      if (id && this.hasSeen(threadId, id)) return;
      if (id) this.markSeen(threadId, id);

      const kind = String(event.kind ?? '').toLowerCase();
      const stream = String(event.stream ?? '').toLowerCase();
      const text = String(event.text ?? '');

      // ── Sub-agent: started ───────────────────────────────────────────────
      if (
        kind === 'subagent_started' ||
        kind === 'subagent.started' ||
        kind === 'agent_spawn' ||
        kind === 'agent.spawn' ||
        (kind === 'subagent' && event.status === 'started')
      ) {
        const label = String(event.label ?? event.subAgentId ?? 'sub-agent');
        const model = String(event.model ?? '');
        const runId = String(event.subAgentId ?? crypto.randomUUID());

        console.log(`[${this.agentName}] Sub-agent started: ${label}`);
        postMessage(
          threadId,
          `agent_started: ${label}${model ? ` (${model})` : ''}`,
          'SYSTEM',
          'GHOST',
          { source: 'openclaw', agent: this.agentName, subAgentLabel: label, model, runId, event: 'subagent_started' },
        ).catch(console.error);
        return;
      }

      // ── Sub-agent: completed ─────────────────────────────────────────────
      if (
        kind === 'subagent_completed' ||
        kind === 'subagent.completed' ||
        kind === 'agent_complete' ||
        kind === 'agent.complete' ||
        (kind === 'subagent' && event.status === 'completed')
      ) {
        const label = String(event.label ?? event.subAgentId ?? 'sub-agent');
        const model = String(event.model ?? '');
        const runId = String(event.subAgentId ?? crypto.randomUUID());
        const result = event.result ? String(event.result).slice(0, 200) : '';

        console.log(`[${this.agentName}] Sub-agent completed: ${label}`);
        postMessage(
          threadId,
          `agent_completed: ${label}${result ? ` — ${result}` : ''}`,
          'SYSTEM',
          'GHOST',
          { source: 'openclaw', agent: this.agentName, subAgentLabel: label, model, runId, event: 'subagent_completed' },
        ).catch(console.error);
        return;
      }

      // ── Sub-agent: failed ────────────────────────────────────────────────
      if (
        kind === 'subagent_failed' ||
        kind === 'subagent.failed' ||
        (kind === 'subagent' && event.status === 'failed')
      ) {
        const label = String(event.label ?? event.subAgentId ?? 'sub-agent');
        const error = String(event.error ?? event.message ?? '');
        postMessage(
          threadId,
          `agent_failed: ${label}${error ? ` — ${error}` : ''}`,
          'SYSTEM',
          'GHOST',
          { source: 'openclaw', agent: this.agentName, subAgentLabel: label, event: 'subagent_failed' },
        ).catch(console.error);
        return;
      }

      // ── Memory write detection ───────────────────────────────────────────
      const filePath = String(event.path ?? event.filePath ?? event.file ?? '');
      const isMemoryWrite =
        (kind === 'tool_use' || kind === 'tool_result' || kind === 'tool_call') &&
        (event.tool === 'write' || event.tool === 'edit' || event.tool === 'create') &&
        /[\\/]memory[\\/]|[\\/]MEMORY\.md/i.test(filePath);

      if (isMemoryWrite) {
        const content = String(event.content ?? event.text ?? filePath);
        console.log(`[${this.agentName}] Memory write detected: ${filePath}`);
        createMemoryChip(threadId, content.slice(0, 500), {
          source: 'openclaw-auto',
          agent: this.agentName,
          filePath,
          event: 'memory_write',
        }).catch(console.error);
        return;
      }

      // ── Cost / usage event ───────────────────────────────────────────────
      const hasTokenData =
        typeof event.inputTokens === 'number' ||
        typeof event.outputTokens === 'number' ||
        typeof event.tokensUsed === 'number' ||
        typeof event.totalTokens === 'number';

      if (kind === 'usage' || kind === 'cost' || kind === 'token_usage' || hasTokenData) {
        const inputTokens = Number(event.inputTokens ?? 0);
        const outputTokens = Number(event.outputTokens ?? event.tokensUsed ?? event.totalTokens ?? 0);
        const tokens = inputTokens + outputTokens;
        const costUsd = typeof event.costUsd === 'number' ? event.costUsd : tokens * 0.000003; // rough fallback
        const model = String(event.model ?? 'unknown');

        console.log(`[${this.agentName}] Cost event: ${tokens} tokens, $${costUsd.toFixed(6)}, model=${model}`);
        postCostEntry(threadId, `${this.agentName}:${model}`, tokens, costUsd).catch(console.error);
        return;
      }

      // ── Streaming chat text ──────────────────────────────────────────────
      if (stream.startsWith('stream:') && text) {
        postMessage(
          threadId,
          `agent_progress: ${this.agentName} — ${text}`,
          'SYSTEM',
          'GHOST',
          { source: 'openclaw', agent: this.agentName },
        ).catch(console.error);
      }
    } catch (err) {
      console.error(`[${this.agentName}] handleRpcEvent error:`, (err as Error).message);
    }
  }
}

// ─── Thread → Agent routing ─────────────────────────────────────────────────

/**
 * Determine which agent config should handle a given thread title.
 * Matching rules:
 *  1. Title starts with "[AgentName]" (case-insensitive)
 *  2. Title contains "@agentname"
 *  3. Default: first agent in config array
 */
function resolveAgentForTitle(title: string, configs: AgentConfig[]): AgentConfig {
  const lower = title.toLowerCase();
  for (const cfg of configs) {
    const name = cfg.name.toLowerCase();
    if (lower.startsWith(`[${name}]`) || lower.includes(`@${name}`)) {
      return cfg;
    }
  }
  return configs[0]!;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[bridge] Starting OpenClaw bridge (Phase 3 — bidirectional)');
  console.log(`[bridge] Agents: ${AGENT_CONFIGS.map((c) => `${c.name}@${c.url}`).join(', ')}`);
  console.log(`[bridge] ClawChat: ${CLAWCHAT_URL}`);

  // Instantiate one bridge agent per config
  const agents = new Map<string, OpenClawBridgeAgent>();
  for (const cfg of AGENT_CONFIGS) {
    agents.set(cfg.name, new OpenClawBridgeAgent(cfg, cfg.name));
  }

  // Ensure each agent has at least its activity thread
  for (const [name, agent] of agents) {
    const cfg = AGENT_CONFIGS.find((c) => c.name === name)!;
    const title = AGENT_CONFIGS.length === 1 ? ACTIVITY_THREAD_TITLE : `[${name}] ${ACTIVITY_THREAD_TITLE}`;

    let threadId: string | undefined;
    for (let attempt = 1; ; attempt++) {
      try {
        threadId = await findOrCreateThread(title);
        console.log(`[bridge] [${name}] Activity thread: ${threadId}`);
        break;
      } catch (err) {
        console.error(`[bridge] [${name}] Thread setup attempt ${attempt} failed:`, (err as Error).message);
        if (attempt >= 10) { console.error('[bridge] Giving up'); process.exit(1); }
        await new Promise((r) => setTimeout(r, 3_000 * attempt));
      }
    }

    agent.setDefaultThread(threadId!);
    agent.start();
  }

  // Keep alive
  process.on('SIGINT', () => { console.log('[bridge] Shutting down'); process.exit(0); });
  process.on('SIGTERM', () => { console.log('[bridge] Shutting down'); process.exit(0); });
}

main().catch((err) => {
  console.error('[bridge] Fatal:', err);
  process.exit(1);
});
