/**
 * bridge-openclaw — translates OpenClaw gateway events into ClawChat ghost messages.
 *
 * Connects to OpenClaw via WebSocket (ws://OPENCLAW_HOST/ws) and, on startup,
 * creates (or reuses) an "OpenClaw Activity" thread in the ClawChat server.
 * Agent start/progress/completion events are forwarded as typed messages.
 */

import dotenv from 'dotenv';
import WebSocket from 'ws';

dotenv.config();

const CLAWCHAT_URL = process.env.CLAWCHAT_URL ?? 'http://localhost:3001';
const OPENCLAW_WS = process.env.OPENCLAW_WS ?? 'ws://100.102.5.72:18789/ws';
const OPENCLAW_POLL_URL = process.env.OPENCLAW_POLL_URL ?? 'http://100.102.5.72:18789/v1/messages';
const ACTIVITY_THREAD_TITLE = 'OpenClaw Activity';

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

async function postMessage(threadId: string, content: string, role = 'SYSTEM', displayType = 'VISIBLE'): Promise<void> {
  const res = await fetch(`${CLAWCHAT_URL}/threads/${threadId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, role, displayType }),
  });
  if (!res.ok) {
    console.error(`[bridge] POST message failed: ${res.status} ${await res.text()}`);
  }
}

// ─── Event translation ─────────────────────────────────────────────────────

interface OpenClawEvent {
  type?: string;
  event?: string;
  agentName?: string;
  runId?: string;
  content?: string;
  message?: string;
  status?: string;
  [key: string]: unknown;
}

function translateEvent(ev: OpenClawEvent, threadId: string): { content: string; role: string } | null {
  const type = ev.type ?? ev.event ?? ev.status ?? '';
  const agent = ev.agentName ?? 'OpenClaw';
  const run = ev.runId ? ` [${ev.runId.slice(0, 8)}]` : '';

  if (/start/i.test(type)) {
    return { content: `agent_started: ${agent}${run} started`, role: 'SYSTEM' };
  }
  if (/complet|done|finish/i.test(type)) {
    return { content: `agent_completed: ${agent}${run} completed`, role: 'SYSTEM' };
  }
  if (/fail|error/i.test(type)) {
    const detail = ev.message ?? ev.content ?? '';
    return { content: `agent_failed: ${agent}${run} — ${detail}`, role: 'SYSTEM' };
  }
  if (/progress|update|tool/i.test(type)) {
    const detail = ev.content ?? ev.message ?? type;
    return { content: `agent_progress: ${agent}${run} — ${detail}`, role: 'SYSTEM' };
  }
  if (ev.content || ev.message) {
    return { content: String(ev.content ?? ev.message), role: 'AGENT' };
  }

  void threadId; // suppress unused warning
  return null;
}

// ─── WebSocket connection to OpenClaw ─────────────────────────────────────

function connectOpenClawWs(threadId: string): void {
  console.log(`[bridge] Connecting to OpenClaw WS: ${OPENCLAW_WS}`);
  let ws: WebSocket;

  const connect = () => {
    ws = new WebSocket(OPENCLAW_WS);

    ws.on('open', () => {
      console.log('[bridge] OpenClaw WS connected');
      postMessage(threadId, 'Bridge connected to OpenClaw gateway', 'SYSTEM', 'VISIBLE').catch(console.error);
    });

    ws.on('message', (raw) => {
      try {
        const ev = JSON.parse(raw.toString()) as OpenClawEvent;
        const translated = translateEvent(ev, threadId);
        if (translated) {
          postMessage(threadId, translated.content, translated.role, 'VISIBLE').catch(console.error);
        }
      } catch {
        // Non-JSON frame — forward as raw text
        const text = raw.toString();
        if (text.trim()) {
          postMessage(threadId, text.trim(), 'AGENT', 'VISIBLE').catch(console.error);
        }
      }
    });

    ws.on('error', (err) => {
      console.error('[bridge] OpenClaw WS error:', err.message);
    });

    ws.on('close', () => {
      console.log('[bridge] OpenClaw WS closed — reconnecting in 5s');
      setTimeout(connect, 5_000);
    });
  };

  connect();
}

// ─── HTTP poll fallback (every 2s) ────────────────────────────────────────

let lastPollTimestamp = 0;

async function pollOpenClaw(threadId: string): Promise<void> {
  try {
    const url = lastPollTimestamp
      ? `${OPENCLAW_POLL_URL}?since=${lastPollTimestamp}`
      : OPENCLAW_POLL_URL;

    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return; // Endpoint may not exist — silently skip

    const body = (await res.json()) as unknown;
    const events: OpenClawEvent[] = Array.isArray(body) ? body : [];
    lastPollTimestamp = Date.now();

    for (const ev of events) {
      const translated = translateEvent(ev, threadId);
      if (translated) {
        await postMessage(threadId, translated.content, translated.role, 'VISIBLE');
      }
    }
  } catch {
    // Poll endpoint unavailable — WS path is primary
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('[bridge] Starting OpenClaw bridge…');

  let threadId: string;
  try {
    threadId = await findOrCreateActivityThread();
    console.log(`[bridge] Activity thread: ${threadId}`);
  } catch (err) {
    console.error('[bridge] Failed to find/create activity thread:', err);
    process.exit(1);
  }

  // Primary: WebSocket connection
  connectOpenClawWs(threadId);

  // Secondary: HTTP poll every 2s (no-ops gracefully if endpoint absent)
  setInterval(() => pollOpenClaw(threadId), 2_000);
}

main().catch((err) => {
  console.error('[bridge] Fatal:', err);
  process.exit(1);
});
