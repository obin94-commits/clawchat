import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import WebSocket from "ws";

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const CLAWCHAT_SERVER_URL =
  process.env.CLAWCHAT_SERVER_URL ?? "http://localhost:3001";
const CLAWCHAT_API_KEY = process.env.CLAWCHAT_API_KEY;

if (!TELEGRAM_BOT_TOKEN) {
  console.error("[telegram-bridge] TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

if (!TELEGRAM_CHAT_ID) {
  console.error("[telegram-bridge] TELEGRAM_CHAT_ID is required");
  process.exit(1);
}

const CLAWCHAT_WS_URL =
  CLAWCHAT_SERVER_URL.replace("http://", "ws://").replace(
    "https://",
    "wss://",
  ) + "/ws";

// ─── ClawChat REST API helpers ───────────────────────────────────────────────

async function findOrCreateThread(title: string): Promise<string> {
  const res = await fetch(`${CLAWCHAT_SERVER_URL}/threads`, {
    headers: CLAWCHAT_API_KEY
      ? { Authorization: `Bearer ${CLAWCHAT_API_KEY}` }
      : undefined,
  });
  if (!res.ok) throw new Error(`GET /threads failed: ${res.status}`);
  const threads = (await res.json()) as Array<{ id: string; title: string }>;

  const existing = threads.find((t) => t.title === title);
  if (existing) return existing.id;

  const created = await fetch(`${CLAWCHAT_SERVER_URL}/threads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(CLAWCHAT_API_KEY
        ? { Authorization: `Bearer ${CLAWCHAT_API_KEY}` }
        : undefined),
    },
    body: JSON.stringify({ title }),
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

  const res = await fetch(
    `${CLAWCHAT_SERVER_URL}/threads/${threadId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CLAWCHAT_API_KEY
          ? { Authorization: `Bearer ${CLAWCHAT_API_KEY}` }
          : undefined),
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    console.error(
      `[telegram-bridge] POST message failed: ${res.status} ${await res.text()}`,
    );
  }
}

// ─── Telegram Bot setup ──────────────────────────────────────────────────────

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// ─── WebSocket client for ClawChat ───────────────────────────────────────────

let ws: WebSocket | null = null;
let threadId: string | null = null;
let wsConnected = false;

function connectWebSocket(): void {
  const url = `${CLAWCHAT_WS_URL}?threadId=${encodeURIComponent(threadId!)}`;
  ws = new WebSocket(url, {
    headers: CLAWCHAT_API_KEY
      ? { Authorization: `Bearer ${CLAWCHAT_API_KEY}` }
      : undefined,
  });

  ws.on("open", () => {
    console.log("[telegram-bridge] WebSocket connected");
    wsConnected = true;
    if (threadId) {
      ws!.send(
        JSON.stringify({
          type: "subscribe",
          threadId: threadId,
        }),
      );
    }
  });

  ws.on("message", (raw) => {
    try {
      const event = JSON.parse(raw.toString());
      handleWsEvent(event);
    } catch (err) {
      console.error("[telegram-bridge] Failed to parse WS event:", err);
    }
  });

  ws.on("error", (err) => {
    console.error("[telegram-bridge] WebSocket error:", err.message);
  });

  ws.on("close", () => {
    console.log("[telegram-bridge] WebSocket closed, reconnecting...");
    wsConnected = false;
    setTimeout(connectWebSocket, 3000);
  });
}

function sendToTelegram(
  chatId: string,
  content: string,
  metadata?: Record<string, unknown>,
): void {
  const replyToId = metadata?.replyToMessageId
    ? parseInt(String(metadata.replyToMessageId), 10)
    : undefined;
  const options: TelegramBot.SendMessageOptions = {};
  if (replyToId) options.reply_to_message_id = replyToId;

  bot
    .sendMessage(chatId, content, options)
    .then((msg: TelegramBot.Message) => {
      console.log(`[telegram-bridge] Sent to Telegram: ${msg.message_id}`);
    })
    .catch((err: Error) => {
      console.error(
        "[telegram-bridge] Failed to send to Telegram:",
        err.message,
      );
    });
}

// ─── Message translation ─────────────────────────────────────────────────────

function translateToTelegram(
  content: string,
  role: string,
  displayType: string,
): string {
  let prefix = "";
  if (role === "AGENT") {
    prefix = "🤖 Agent: ";
  } else if (role === "SYSTEM") {
    if (displayType === "GHOST") {
      prefix = "⚙️ ";
    } else {
      prefix = "📝 ";
    }
  } else if (role === "USER") {
    prefix = "👤 User: ";
  }
  return prefix + content;
}

// ─── WebSocket event handler ─────────────────────────────────────────────────

function handleWsEvent(event: unknown): void {
  if (!threadId) return;

  const evt = event as {
    type: string;
    threadId?: string;
    payload?: {
      message?: {
        id: string;
        content: string;
        role: string;
        displayType: string;
        metadata?: unknown;
      };
    };
  };

  if (evt.type === "message.new" && evt.payload?.message) {
    const msg = evt.payload.message;

    // Don't forward HIDDEN messages to Telegram
    if (msg.displayType === "HIDDEN") return;

    let metadata: Record<string, unknown> | undefined;
    if (msg.metadata) {
      try {
        metadata =
          typeof msg.metadata === "string"
            ? JSON.parse(msg.metadata)
            : (msg.metadata as Record<string, unknown>);
      } catch {
        metadata = undefined;
      }
    }

    // Don't echo messages that originated from Telegram back to Telegram
    if (metadata?.source === "telegram") return;

    const telegramContent = translateToTelegram(
      msg.content,
      msg.role,
      msg.displayType,
    );
    sendToTelegram(TELEGRAM_CHAT_ID!, telegramContent, metadata);
  }
}

// ─── Telegram message handler ────────────────────────────────────────────────

bot.on("message", (msg: TelegramBot.Message) => {
  if (!threadId) return;

  if (msg.chat.id.toString() !== TELEGRAM_CHAT_ID) return;

  if (msg.text) {
    const content = msg.text.trim();
    if (!content) return;

    const metadata = {
      source: "telegram",
      telegramMessageId: msg.message_id,
      chatId: msg.chat.id,
    };

    postMessage(threadId, content, "USER", "VISIBLE", metadata)
      .then(() => {
        console.log(
          `[telegram-bridge] Relayed Telegram message ${msg.message_id} to ClawChat`,
        );
      })
      .catch((err: Error) => {
        console.error(
          "[telegram-bridge] Failed to relay to ClawChat:",
          err.message,
        );
      });
  }
});

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[telegram-bridge] Starting Telegram bridge...");
  console.log(`[telegram-bridge] Telegram Chat ID: ${TELEGRAM_CHAT_ID}`);
  console.log(`[telegram-bridge] ClawChat server: ${CLAWCHAT_SERVER_URL}`);

  try {
    threadId = await findOrCreateThread("Telegram Bridge");
    console.log(`[telegram-bridge] Thread ID: ${threadId}`);

    connectWebSocket();

    console.log("[telegram-bridge] Bridge started. Listening for messages...");
  } catch (err) {
    console.error("[telegram-bridge] Failed to start:", err);
    process.exit(1);
  }
}

main();
