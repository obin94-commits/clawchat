/**
 * bridge-openclaw — polls OpenClaw gateway and relays messages to ClawChat.
 *
 * Primary: HTTP polling every 2s against
 *   GET http://OPENCLAW_HOST/v1/sessions/main/messages?since=<unix_ms>
 * Fallback: WebSocket connection for real-time events.
 * Agent activity events are forwarded as GHOST messages; regular messages as VISIBLE.
 */

import dotenv from 'dotenv';
import WebSocket from 'ws';

dotenv.config();

const CLAWCHAT_URL = process.env.CLAWCHAT_URL ?? 'http://localhost:3001';
const OPENCLAW_BASE = process.env.OPENCLAW_BASE ?? 'http://100.102.5.72:18789';
const OPENCLAW_WS = process.env.OPENCLAW_WS ?? 'ws://100.102.5.72:18789/ws';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN ?? '698900e334ca63800944174b5d1617cd53f7dc0b4a211794';
const SESSION_ID = process.env.OPENCLAW_SESSION ?? 'main';
const ACTIVITY_THREAD_TITLE = 'OpenClaw Activity';

// ─── OpenClaw message shape ────────────────────────────────────────────────

interface OpenClawMessage {
  id?: string;
  type?: string;
  event?: string;
  agentName?: string;
  agent_name?: string;
  runId?: string;
  run_id?: string;
  content?: string;
  text?: string;
  message?: string;
  status?: string;
  timestamp?: number | string;
  created_at?: number | string;
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

function translateMessage(msg: OpenClawMessage): Translated | null {
  const type = (msg.type ?? msg.event ?? msg.status ?? '').toLowerCase();
  const agent = msg.agentName ?? msg.agent_name ?? 'OpenClaw';
  const run = (msg.runId ?? msg.run_id) ? ` [${String(msg.runId ?? msg.run_id).slice(0, 8)}]` : '';
  const text = msg.content ?? msg.text ?? msg.message ?? '';

  // Agent lifecycle / activity events → SYSTEM with prefix, displayed as GHOST
  if (type === 'agent_activity' || type === 'agent_started' || /start/i.test(type) && /agent/i.test(type)) {
    return {
      content: `agent_started: ${agent}${run} started`,
      role: 'SYSTEM',
      displayType: 'GHOST',
    };
  }

  if (type === 'agent_completed' || /complet|done|finish/i.test(type) && /agent/i.test(type)) {
    return {
      content: `agent_completed: ${agent}${run} completed`,
      role: 'SYSTEM',
      displayType: 'GHOST',
    };
  }

  if (type === 'agent_failed' || /fail|error/i.test(type) && /agent/i.test(type)) {
    return {
      content: `agent_failed: ${agent}${run} — ${text}`,
      role: 'SYSTEM',
      displayType: 'GHOST',
    };
  }

  if (/progress|tool_use|tool_result/i.test(type)) {
    const detail = text || type;
    return {
      content: `agent_progress: ${agent}${run} — ${detail}`,
      role: 'SYSTEM',
      displayType: 'GHOST',
    };
  }

  // Regular message with content → AGENT, VISIBLE
  if (text) {
    return { content: text, role: 'AGENT', displayType: 'VISIBLE' };
  }

  return null;
}

// ─── HTTP Polling ──────────────────────────────────────────────────────────

// Track the highest timestamp/id seen so we don't re-relay messages
let sinceMs = Date.now();
let seenIds = new Set<string>();
let pollFailures = 0;

function openClawHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${OPENCLAW_TOKEN}`,
    Accept: 'application/json',
  };
}

async function pollOnce(threadId: string): Promise<void> {
  const url = `${OPENCLAW_BASE}/v1/sessions/${SESSION_ID}/messages?since=${sinceMs}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: openClawHeaders(),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    pollFailures++;
    if (pollFailures === 1 || pollFailures % 30 === 0) {
      console.warn(`[bridge] Poll fetch failed (${pollFailures}x): ${(err as Error).message}`);
    }
    return;
  }

  if (!res.ok) {
    pollFailures++;
    if (pollFailures === 1 || pollFailures % 30 === 0) {
      console.warn(`[bridge] Poll HTTP ${res.status} (${pollFailures}x)`);
    }
    return;
  }

  if (pollFailures > 0) {
    console.log(`[bridge] Poll recovered after ${pollFailures} failures`);
    pollFailures = 0;
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return; // empty or non-JSON body
  }

  const messages: OpenClawMessage[] = Array.isArray(body)
    ? body
    : Array.isArray((body as Record<string, unknown>)?.messages)
      ? ((body as Record<string, unknown>).messages as OpenClawMessage[])
      : [];

  let latestTs = sinceMs;

  for (const msg of messages) {
    // Deduplicate by id when available
    const id = String(msg.id ?? '');
    if (id && seenIds.has(id)) continue;
    if (id) {
      seenIds.add(id);
      // Prune the seen set if it grows large
      if (seenIds.size > 10_000) {
        seenIds = new Set(Array.from(seenIds).slice(-5_000));
      }
    }

    // Track latest timestamp
    const msgTs = msg.timestamp ?? msg.created_at;
    if (msgTs) {
      const ts = typeof msgTs === 'number' ? msgTs : Date.parse(msgTs);
      if (!isNaN(ts) && ts > latestTs) latestTs = ts;
    }

    const translated = translateMessage(msg);
    if (translated) {
      console.log(`[bridge] Relaying: [${translated.displayType}] ${translated.content.slice(0, 80)}`);
      await postMessage(threadId, translated.content, translated.role, translated.displayType, { source: 'openclaw', originalId: id || undefined });
    }
  }

  // Advance the cursor so next poll only fetches newer messages
  if (latestTs > sinceMs) sinceMs = latestTs + 1;
}

function startPolling(threadId: string): void {
  console.log(`[bridge] HTTP polling ${OPENCLAW_BASE}/v1/sessions/${SESSION_ID}/messages every 2s`);

  const tick = async () => {
    await pollOnce(threadId);
    setTimeout(tick, 2_000);
  };

  setTimeout(tick, 0);
}

// ─── WebSocket fallback ────────────────────────────────────────────────────

function connectOpenClawWs(threadId: string): void {
  let ws: WebSocket;
  let wsFailures = 0;

  const connect = () => {
    ws = new WebSocket(OPENCLAW_WS, {
      headers: openClawHeaders(),
    });

    ws.on('open', () => {
      wsFailures = 0;
      console.log('[bridge] OpenClaw WS connected');
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as OpenClawMessage;
        const id = String(msg.id ?? '');
        // Skip if already relayed via polling
        if (id && seenIds.has(id)) return;
        if (id) seenIds.add(id);

        const translated = translateMessage(msg);
        if (translated) {
          postMessage(threadId, translated.content, translated.role, translated.displayType).catch(console.error);
        }
      } catch {
        const text = raw.toString().trim();
        if (text) {
          postMessage(threadId, text, 'AGENT', 'VISIBLE').catch(console.error);
        }
      }
    });

    ws.on('error', (err) => {
      console.error('[bridge] OpenClaw WS error:', err.message);
    });

    ws.on('close', () => {
      wsFailures++;
      const delay = Math.min(5_000 * wsFailures, 60_000);
      console.log(`[bridge] OpenClaw WS closed — reconnecting in ${delay / 1000}s`);
      setTimeout(connect, delay);
    });
  };

  connect();
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('[bridge] Starting OpenClaw bridge…');
  console.log(`[bridge] OpenClaw base: ${OPENCLAW_BASE}, session: ${SESSION_ID}`);
  console.log(`[bridge] ClawChat server: ${CLAWCHAT_URL}`);

  let threadId: string;
  for (let attempt = 1; ; attempt++) {
    try {
      threadId = await findOrCreateActivityThread();
      console.log(`[bridge] Activity thread: ${threadId}`);
      break;
    } catch (err) {
      console.error(`[bridge] Failed to find/create thread (attempt ${attempt}):`, (err as Error).message);
      if (attempt >= 10) {
        console.error('[bridge] Giving up after 10 attempts');
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }

  // Primary: HTTP polling every 2s
  startPolling(threadId);

  // Secondary: WebSocket for lower-latency events
  connectOpenClawWs(threadId);
}

main().catch((err) => {
  console.error('[bridge] Fatal:', err);
  process.exit(1);
});
