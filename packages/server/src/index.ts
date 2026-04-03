import crypto from "crypto";
import http from "http";
import express from "express";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { WebSocketServer, WebSocket } from "ws";
import rateLimit from "express-rate-limit";
import type {
  PersistedMemoryChip,
  Thread,
  WsClientEvent,
  WsServerEvent,
} from "@clawchat/shared";
import { MemoryService } from "./memory";

dotenv.config();

const prisma = new PrismaClient();
const memory = new MemoryService();
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

/** Map<WebSocket, threadId> */
const subscriptions = new Map<WebSocket, string>();
/** Track liveness for heartbeat */
const clientAlive = new Map<WebSocket, boolean>();
/** Map<threadId, Set<SSEClient>> */
const sseClients = new Map<string, Set<SSEClient>>();

interface SSEClient {
  res: {
    write: (data: string) => boolean;
    end: () => void;
    headersSent: boolean;
  };
  abortListener: () => void;
}

app.use(express.json());

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,DELETE,OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// ─── Rate limiting (100 req/min per IP) ──────────────────────────────────────
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .json({ error: "Too many requests", code: "RATE_LIMITED" });
    },
  }),
);

// ─── Auth middleware ──────────────────────────────────────────────────────────
const REQUIRED_API_KEY = process.env.CLAWCHAT_API_KEY ?? "";

app.use((req, res, next) => {
  // Dev mode: no key configured
  if (!REQUIRED_API_KEY) {
    next();
    return;
  }
  // Skip auth for health endpoint
  if (req.path === "/health") {
    next();
    return;
  }

  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== REQUIRED_API_KEY) {
    res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }
  next();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function logError(context: string, error: unknown): void {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [${context}]`, error);
}

const broadcastToThread = (threadId: string, payload: WsServerEvent) => {
  const serialized = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (subscriptions.get(client) !== threadId) continue;
    client.send(serialized);
  }

  // Also broadcast to SSE clients if it's a message event
  if (payload.type === "message.new" && payload.payload) {
    broadcastToSseClients(threadId, {
      type: "message",
      data: payload.payload.message,
    });
  }
};

/**
 * Parse a SYSTEM message and emit a typed WS event if it matches a known prefix.
 * Extracts runId from metadata if present, otherwise generates one.
 */
function emitTypedEventFromSystemMessage(
  threadId: string,
  content: string,
  metadata?: string | null,
): void {
  let runId: string | null = null;
  if (metadata) {
    try {
      const meta = JSON.parse(metadata) as Record<string, unknown>;
      runId = String(meta.runId ?? meta.run_id ?? "");
    } catch {}
  }
  const generatedRunId = crypto.randomUUID();
  runId = runId || generatedRunId;

  if (content.startsWith("agent_started:")) {
    const agentName =
      content.replace("agent_started:", "").trim().split(" ")[0] ?? "Agent";
    broadcastToThread(threadId, {
      type: "agent_started",
      threadId,
      agentName,
      runId,
    });
    return;
  }

  if (content.startsWith("agent_completed:")) {
    const agentName =
      content.replace("agent_completed:", "").trim().split(" ")[0] ?? "Agent";
    broadcastToThread(threadId, {
      type: "agent_completed",
      threadId,
      agentName,
      runId,
    });
    return;
  }

  if (content.startsWith("agent_failed:")) {
    const rest = content.replace("agent_failed:", "").trim();
    const agentName = rest.split(" ")[0] ?? "Agent";
    const error = rest.replace(agentName, "").replace(/^[\s—-]+/, "");
    broadcastToThread(threadId, {
      type: "agent_failed",
      threadId,
      agentName,
      runId,
      error,
    });
    return;
  }

  if (content.startsWith("agent_progress:")) {
    const rest = content.replace("agent_progress:", "").trim();
    const agentName = rest.split(" ")[0] ?? "Agent";
    const action = rest.replace(agentName, "").replace(/^[\s—-]+/, "");
    broadcastToThread(threadId, {
      type: "agent_progress",
      threadId,
      agentName,
      runId,
      action,
    });
    return;
  }

  if (content.startsWith("cost_incurred:")) {
    const rest = content.replace("cost_incurred:", "").trim();
    const parts = rest
      .split(",")
      .reduce<Record<string, string>>((acc, pair) => {
        const [k, v] = pair.split("=").map((s) => s.trim());
        if (k && v) acc[k] = v;
        return acc;
      }, {});
    const cost = parseFloat(parts["cost"] ?? "0") || 0;
    const tokens = parseInt(parts["tokens"] ?? "0", 10) || 0;
    const agentName = parts["agent"] ?? undefined;

    prisma.costEntry
      .create({
        data: { threadId, agentId: agentName, tokens, costUsd: cost },
      })
      .catch((err) => logError("cost.persist", err));

    broadcastToThread(threadId, {
      type: "cost_incurred",
      threadId,
      cost,
      tokens,
      agentName,
    });
  }
}

// ─── /remember handling ───────────────────────────────────────────────────────

async function handleRememberCommand(
  threadId: string,
  messageId: string,
  content: string,
): Promise<void> {
  const text = content.replace(/^\/remember\s+/i, "").trim();
  if (!text) return;

  const chip = await prisma.memoryChip.create({
    data: {
      threadId,
      text,
      metadata: JSON.stringify({ sourceMessageId: messageId }),
    },
  });

  memory
    .addMemory(text, "robin", { threadId, messageId, type: "explicit" })
    .catch((err) => {
      logError("memory.addMemory./remember", err);
    });

  broadcastToThread(threadId, {
    type: "memory_chip.saved",
    threadId,
    chip: chipToDto(chip),
  });
}

function chipToDto(chip: {
  id: string;
  threadId: string;
  text: string;
  metadata: string | null;
  pinned: boolean;
  createdAt: Date;
}): PersistedMemoryChip {
  return {
    id: chip.id,
    threadId: chip.threadId,
    text: chip.text,
    metadata: chip.metadata,
    pinned: chip.pinned,
    createdAt: chip.createdAt.toISOString(),
  };
}

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", clients: wss.clients.size });
});

// ─── Memories (global search) ─────────────────────────────────────────────────

app.get("/memories", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const userId = typeof req.query.userId === "string" ? req.query.userId : "";
    if (!q) {
      res.json([]);
      return;
    }
    const results = await memory.searchMemories(q, userId);
    res.json(results);
  } catch (error) {
    next(error);
  }
});

// ─── Global message search ───────────────────────────────────────────────────

interface SearchResult {
  message: {
    id: string;
    threadId: string;
    content: string;
    role: string;
    createdAt: string;
  };
  threadTitle: string;
}

app.get("/search", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const threadId =
      typeof req.query.threadId === "string" ? req.query.threadId : undefined;

    if (!q) {
      res.json([]);
      return;
    }

    const searchWhere: Record<string, unknown> = {
      content: {
        contains: q,
        mode: "insensitive",
      },
    };

    if (threadId) {
      searchWhere.threadId = threadId;
    }

    const messages = await prisma.message.findMany({
      where: searchWhere,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        threadId: true,
        content: true,
        role: true,
        createdAt: true,
      },
    });

    const threadTitlesMap = new Map<string, string>();
    const threadIds = Array.from(new Set(messages.map((m) => m.threadId)));
    const threads = await prisma.thread.findMany({
      where: { id: { in: threadIds } },
      select: { id: true, title: true },
    });
    threads.forEach((t) => threadTitlesMap.set(t.id, t.title));

    const results: SearchResult[] = messages.map((message) => ({
      message: {
        id: message.id,
        threadId: message.threadId,
        content: message.content,
        role: message.role,
        createdAt: message.createdAt.toISOString(),
      },
      threadTitle: threadTitlesMap.get(message.threadId) ?? "Unknown",
    }));

    res.json(results);
  } catch (error) {
    next(error);
  }
});

// ─── Threads ──────────────────────────────────────────────────────────────────

app.get("/threads", async (_req, res, next) => {
  try {
    const threads = await prisma.thread.findMany({
      orderBy: { updatedAt: "desc" },
    });
    res.json(threads);
  } catch (error) {
    next(error);
  }
});

app.post("/threads", async (req, res, next) => {
  try {
    const title =
      typeof req.body?.title === "string" && req.body.title.trim()
        ? req.body.title.trim()
        : "Untitled";
    const thread = await prisma.thread.create({ data: { title } });
    res.status(201).json(thread);
  } catch (error) {
    next(error);
  }
});

app.delete("/threads/:id", async (req, res, next) => {
  try {
    const threadId = req.params.id;

    await prisma.costEntry.deleteMany({ where: { threadId } });
    await prisma.memoryChip.deleteMany({ where: { threadId } });
    await prisma.message.deleteMany({ where: { threadId } });
    await prisma.thread.delete({ where: { id: threadId } });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ─── Thread branching ─────────────────────────────────────────────────────────

app.post("/threads/:id/branch", async (req, res, next) => {
  try {
    const parentThreadId = req.params.id;
    const messageId =
      typeof req.body?.messageId === "string" ? req.body.messageId : null;
    const titleOverride =
      typeof req.body?.title === "string" && req.body.title.trim()
        ? req.body.title.trim()
        : null;

    if (!messageId) {
      res
        .status(400)
        .json({ error: "messageId is required", code: "MISSING_MESSAGE_ID" });
      return;
    }

    const sourceMessage = await prisma.message.findFirst({
      where: { id: messageId, threadId: parentThreadId },
    });
    if (!sourceMessage) {
      res
        .status(404)
        .json({ error: "Message not found in this thread", code: "NOT_FOUND" });
      return;
    }

    const parentThread = await prisma.thread.findUnique({
      where: { id: parentThreadId },
    });
    const childTitle =
      titleOverride ??
      `Branch: ${(parentThread?.title ?? "Thread").slice(0, 40)}`;

    const childThread = await prisma.thread.create({
      data: {
        title: childTitle,
        parentThreadId,
        branchedFromMessageId: messageId,
      },
    });

    broadcastToThread(parentThreadId, {
      type: "thread.branch",
      parentThreadId,
      childThread: childThread as unknown as Thread,
      branchedFromMessageId: messageId,
    });

    res.status(201).json(childThread);
  } catch (error) {
    next(error);
  }
});

// ─── Messages ────────────────────────────────────────────────────────────────

/**
 * GET /threads/:id/messages
 * Query params: ?cursor=<messageId>&limit=50
 * Returns: { messages: [...], nextCursor: string | null }
 * Order: createdAt DESC (newest first)
 */
app.get("/threads/:id/messages", async (req, res, next) => {
  try {
    const threadId = req.params.id;
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limitRaw = parseInt(String(req.query.limit ?? "50"), 10);
    const limit =
      Number.isNaN(limitRaw) || limitRaw < 1 ? 50 : Math.min(limitRaw, 200);

    // Fetch limit+1 to determine if there's a next page
    const messages = await prisma.message.findMany({
      where: {
        threadId,
        ...(cursor
          ? {
              createdAt: {
                lt: (await prisma.message.findUnique({ where: { id: cursor } }))
                  ?.createdAt,
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    res.json({ messages: page, nextCursor });
  } catch (error) {
    next(error);
  }
});

app.post("/threads/:id/messages", async (req, res, next) => {
  try {
    const threadId = req.params.id;
    let content =
      typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const role = (req.body?.role ?? "USER") as string;
    const displayType = (req.body?.displayType ?? "VISIBLE") as string;
    const metadata = req.body?.metadata
      ? JSON.stringify(req.body.metadata)
      : null;

    // Allow empty content for voice messages
    const isVoiceMessage = metadata && JSON.parse(metadata).type === "voice";
    if (!content && !isVoiceMessage) {
      res
        .status(400)
        .json({ error: "content is required", code: "MISSING_CONTENT" });
      return;
    }

    // Validate content length (max 100KB)
    if (content.length > 100_000) {
      res.status(400).json({
        error: `content exceeds 100KB limit (${content.length} bytes)`,
        code: "CONTENT_TOO_LONG",
      });
      return;
    }
    // Truncate to 100KB if necessary
    content = content.slice(0, 100_000);

    // Validate role
    const validRoles = ["USER", "AGENT", "SYSTEM", "TOOL"] as const;
    if (!validRoles.includes(role as (typeof validRoles)[number])) {
      res.status(400).json({
        error: `invalid role: ${role}. Must be one of: ${validRoles.join(", ")}`,
        code: "INVALID_ROLE",
      });
      return;
    }

    // Validate displayType
    const validDisplayTypes = [
      "VISIBLE",
      "GHOST",
      "COLLAPSED",
      "HIDDEN",
    ] as const;
    if (
      !validDisplayTypes.includes(
        displayType as (typeof validDisplayTypes)[number],
      )
    ) {
      res.status(400).json({
        error: `invalid displayType: ${displayType}. Must be one of: ${validDisplayTypes.join(", ")}`,
        code: "INVALID_DISPLAY_TYPE",
      });
      return;
    }

    const message = await prisma.message.create({
      data: { threadId, content, role, displayType, metadata },
    });

    await prisma.thread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    broadcastToThread(threadId, {
      type: "message.new",
      threadId,
      payload: { message },
    } as unknown as WsServerEvent);

    if (role === "SYSTEM") {
      emitTypedEventFromSystemMessage(threadId, content, message.metadata);
    }

    if (/^\/remember\s+/i.test(content)) {
      handleRememberCommand(threadId, message.id, content).catch((err) => {
        logError("remember", err);
      });
    }

    memory
      .addMemory(content, "robin", { threadId, role, messageId: message.id })
      .catch((err) => {
        logError("memory.addMemory", err);
      });

    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

// ─── Webhook endpoint for inter-agent communication ──────────────────────────

/**
 * POST /threads/:id/messages/webhook
 * Accept messages from external agents without requiring WS connection.
 * Body: { content, role, agentId, metadata }
 * Broadcasts via WS to any connected clients.
 */
app.post("/threads/:id/messages/webhook", async (req, res, next) => {
  try {
    const threadId = req.params.id;
    let content =
      typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const role = (req.body?.role ?? "USER") as string;
    const agentId =
      typeof req.body?.agentId === "string" ? req.body.agentId : null;
    const metadata = req.body?.metadata
      ? JSON.stringify(req.body.metadata)
      : null;

    // Allow empty content for voice messages
    const isVoiceMessage = metadata && JSON.parse(metadata).type === "voice";
    if (!content && !isVoiceMessage) {
      res
        .status(400)
        .json({ error: "content is required", code: "MISSING_CONTENT" });
      return;
    }

    // Validate content length (max 100KB)
    if (content.length > 100_000) {
      res.status(400).json({
        error: `content exceeds 100KB limit (${content.length} bytes)`,
        code: "CONTENT_TOO_LONG",
      });
      return;
    }
    content = content.slice(0, 100_000);

    // Validate role
    const validRoles = ["USER", "AGENT", "SYSTEM", "TOOL"] as const;
    if (!validRoles.includes(role as (typeof validRoles)[number])) {
      res.status(400).json({
        error: `invalid role: ${role}. Must be one of: ${validRoles.join(", ")}`,
        code: "INVALID_ROLE",
      });
      return;
    }

    const message = await prisma.message.create({
      data: { threadId, content, role, displayType: "VISIBLE", metadata },
    });

    await prisma.thread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    // Broadcast to WS clients
    broadcastToThread(threadId, {
      type: "message.new",
      threadId,
      payload: { message },
    } as unknown as WsServerEvent);

    // Broadcast to SSE clients
    broadcastToSseClients(threadId, { type: "message", data: message });

    if (role === "SYSTEM") {
      emitTypedEventFromSystemMessage(threadId, content, message.metadata);
    }

    if (/^\/remember\s+/i.test(content)) {
      handleRememberCommand(threadId, message.id, content).catch((err) => {
        logError("remember.webhook", err);
      });
    }

    memory
      .addMemory(content, "robin", {
        threadId,
        role,
        messageId: message.id,
        agentId,
      })
      .catch((err) => {
        logError("memory.addMemory.webhook", err);
      });

    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

// ─── SSE subscribe endpoint for inter-agent communication ────────────────────

/**
 * GET /threads/:id/subscribe
 * Returns a Server-Sent Events (SSE) stream.
 * When new messages arrive in the thread, push them as SSE events.
 */
app.get("/threads/:id/subscribe", (req, res) => {
  const threadId = req.params.id;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Create abort controller for cleanup
  const abortController = new AbortController();

  // Add abort listener for cleanup when client disconnects
  const abortListener = () => {
    cleanupSseClient(threadId, res);
  };
  abortController.signal.addEventListener("abort", abortListener);

  // Create SSE client entry
  const sseClient: SSEClient = {
    res,
    abortListener,
  };

  // Add client to thread's SSE clients
  if (!sseClients.has(threadId)) {
    sseClients.set(threadId, new Set());
  }
  sseClients.get(threadId)!.add(sseClient);

  // Send initial connection event
  res.write(
    `event: connected\ndata: {"threadId":"${threadId}","status":"subscribed"}\n\n`,
  );

  // Cleanup on client disconnect
  res.on("close", () => {
    abortController.abort();
  });
});

function cleanupSseClient(threadId: string, res: SSEClient["res"]) {
  const clients = sseClients.get(threadId);
  if (clients) {
    clients.forEach((client) => {
      if (client.res === res) {
        clients.delete(client);
        client.abortListener();
      }
    });
    if (clients.size === 0) {
      sseClients.delete(threadId);
    }
  }
}

function broadcastToSseClients(threadId: string, event: unknown) {
  const clients = sseClients.get(threadId);
  if (!clients) return;

  const data = JSON.stringify(event);
  const sseData = `data: ${data}\n\n`;

  for (const client of clients) {
    if (!client.res.headersSent) {
      client.res.write(sseData);
    }
  }
}

// ─── Cost endpoints ──────────────────────────────────────────────────────────

/**
 * GET /threads/:id/cost/summary
 * Returns { totalTokens, totalCostUsd, byAgent: [{ agentId, totalTokens, totalCostUsd }] }
 */
app.get("/threads/:id/cost/summary", async (req, res, next) => {
  try {
    const threadId = req.params.id;
    const entries = await prisma.costEntry.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });

    const totalTokens = entries.reduce((sum, e) => sum + e.tokens, 0);
    const totalCostUsd = entries.reduce((sum, e) => sum + e.costUsd, 0);

    // Group by agentId
    const agentMap = new Map<
      string,
      { totalTokens: number; totalCostUsd: number }
    >();
    for (const e of entries) {
      const key = e.agentId ?? "__unknown__";
      const cur = agentMap.get(key) ?? { totalTokens: 0, totalCostUsd: 0 };
      agentMap.set(key, {
        totalTokens: cur.totalTokens + e.tokens,
        totalCostUsd: cur.totalCostUsd + e.costUsd,
      });
    }

    const byAgent = Array.from(agentMap.entries()).map(([agentId, stats]) => ({
      agentId: agentId === "__unknown__" ? null : agentId,
      totalTokens: stats.totalTokens,
      totalCostUsd: stats.totalCostUsd,
    }));

    res.json({ totalTokens, totalCostUsd, byAgent });
  } catch (error) {
    next(error);
  }
});

app.get("/threads/:id/cost", async (req, res, next) => {
  try {
    const threadId = req.params.id;
    const entries = await prisma.costEntry.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });

    const totalTokens = entries.reduce((sum, e) => sum + e.tokens, 0);
    const totalCostUsd = entries.reduce((sum, e) => sum + e.costUsd, 0);

    res.json({ totalTokens, totalCostUsd, entries });
  } catch (error) {
    next(error);
  }
});

app.post("/threads/:id/cost", async (req, res, next) => {
  try {
    const threadId = req.params.id;
    const agentId =
      typeof req.body?.agentId === "string" ? req.body.agentId : null;
    const tokens = typeof req.body?.tokens === "number" ? req.body.tokens : 0;
    const costUsd =
      typeof req.body?.costUsd === "number" ? req.body.costUsd : 0;

    const entry = await prisma.costEntry.create({
      data: { threadId, agentId, tokens, costUsd },
    });

    broadcastToThread(threadId, {
      type: "cost_incurred",
      threadId,
      cost: costUsd,
      tokens,
      agentName: agentId ?? undefined,
    });

    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
});

// ─── Memory chip CRUD ─────────────────────────────────────────────────────────

app.get("/threads/:id/memories", async (req, res, next) => {
  try {
    const chips = await prisma.memoryChip.findMany({
      where: { threadId: req.params.id },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    });
    res.json(chips.map(chipToDto));
  } catch (error) {
    next(error);
  }
});

app.post("/threads/:id/memories", async (req, res, next) => {
  try {
    const threadId = req.params.id;
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ error: "text is required", code: "MISSING_TEXT" });
      return;
    }
    const metadata = req.body?.metadata
      ? JSON.stringify(req.body.metadata)
      : null;

    const chip = await prisma.memoryChip.create({
      data: { threadId, text, metadata },
    });

    memory
      .addMemory(text, "robin", { threadId, type: "explicit" })
      .catch((err) => {
        logError("memory.addMemory.chip", err);
      });

    broadcastToThread(threadId, {
      type: "memory_chip.saved",
      threadId,
      chip: chipToDto(chip),
    });
    res.status(201).json(chipToDto(chip));
  } catch (error) {
    next(error);
  }
});

app.patch("/threads/:id/memories/:chipId", async (req, res, next) => {
  try {
    const { id: threadId, chipId } = req.params;
    const updates: { text?: string; pinned?: boolean } = {};
    if (typeof req.body?.text === "string" && req.body.text.trim()) {
      updates.text = req.body.text.trim();
    }
    if (typeof req.body?.pinned === "boolean") {
      updates.pinned = req.body.pinned;
    }

    const chip = await prisma.memoryChip.findUnique({ where: { id: chipId } });
    if (!chip || chip.threadId !== threadId) {
      res
        .status(404)
        .json({ error: "Memory chip not found", code: "NOT_FOUND" });
      return;
    }

    await prisma.memoryChip.update({ where: { id: chipId }, data: updates });

    res.json(chipToDto(chip));
  } catch (error) {
    next(error);
  }
});

app.delete("/threads/:id/memories/:chipId", async (req, res, next) => {
  try {
    const { id: threadId, chipId } = req.params;

    const chip = await prisma.memoryChip.findUnique({ where: { id: chipId } });
    if (!chip || chip.threadId !== threadId) {
      res
        .status(404)
        .json({ error: "Memory chip not found", code: "NOT_FOUND" });
      return;
    }

    await prisma.memoryChip.delete({ where: { id: chipId } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ─── Error handler ───────────────────────────────────────────────────────────

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const ts = new Date().toISOString();
    console.error(`[${ts}] [unhandled]`, error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
  },
);

// ─── WebSocket upgrade ───────────────────────────────────────────────────────

server.on("upgrade", (request, socket, head) => {
  if (REQUIRED_API_KEY) {
    const auth = request.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const tokenQuery = request.url?.split("?")[1];
    const urlParams = new URLSearchParams(tokenQuery ?? "");
    const tokenFromQuery = urlParams.get("token") ?? "";

    if (token !== REQUIRED_API_KEY && tokenFromQuery !== REQUIRED_API_KEY) {
      socket.destroy();
      return;
    }
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// ─── WebSocket heartbeat (30s ping/pong) ─────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30_000;

const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (!clientAlive.get(ws)) {
      // No pong received since last ping — terminate stale client
      const threadId = subscriptions.get(ws);
      subscriptions.delete(ws);
      clientAlive.delete(ws);
      ws.terminate();
      if (threadId) {
        emitGhostMessage(threadId, "agent_disconnected").catch((err) =>
          logError("ghost.stale_disconnect", err),
        );
      }
      continue;
    }
    clientAlive.set(ws, false);
    ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

wss.on("close", () => {
  clearInterval(heartbeatTimer);
});

// ─── WebSocket helpers ────────────────────────────────────────────────────────

async function emitGhostMessage(
  threadId: string,
  content: string,
): Promise<void> {
  const message = await prisma.message.create({
    data: { threadId, content, role: "SYSTEM", displayType: "GHOST" },
  });
  broadcastToThread(threadId, {
    type: "message.new",
    threadId,
    payload: { message },
  } as unknown as WsServerEvent);
}

async function handleIncomingMessage(
  ws: WebSocket,
  threadId: string,
  content: string,
) {
  const message = await prisma.message.create({
    data: { threadId, content, role: "USER", displayType: "VISIBLE" },
  });

  await prisma.thread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  broadcastToThread(threadId, {
    type: "message.new",
    threadId,
    payload: { message },
  } as unknown as WsServerEvent);

  if (/^\/remember\s+/i.test(content)) {
    handleRememberCommand(threadId, message.id, content).catch((err) => {
      logError("remember.ws", err);
    });
  }

  const chips = await memory.getRelevant(threadId, content);
  for (const chip of chips) {
    broadcastToThread(threadId, {
      type: "memory_chip",
      threadId,
      chip: {
        id: chip.id,
        content: chip.content,
        score: chip.score,
        category: chip.category,
      },
    });
  }

  memory
    .store(content, "default", {
      threadId,
      role: "USER",
      messageId: message.id,
    })
    .catch((err) => {
      logError("memory.store", err);
    });
}

// ─── WebSocket connection handler ─────────────────────────────────────────────

wss.on("connection", (ws) => {
  let subscribed = false;

  // Mark client as alive initially
  clientAlive.set(ws, true);

  ws.on("pong", () => {
    clientAlive.set(ws, true);
  });

  ws.on("message", async (raw) => {
    try {
      const event = JSON.parse(raw.toString()) as WsClientEvent;

      if (!subscribed) {
        if (event.type !== "subscribe") {
          ws.send(
            JSON.stringify({
              type: "error",
              error: "First message must be subscribe",
            } satisfies WsServerEvent),
          );
          ws.close();
          return;
        }

        subscriptions.set(ws, event.threadId);
        subscribed = true;
        ws.send(
          JSON.stringify({
            type: "subscribed",
            threadId: event.threadId,
          } satisfies WsServerEvent),
        );
        emitGhostMessage(event.threadId, "agent_connected").catch((err) =>
          logError("ghost.connect", err),
        );
        return;
      }

      if (event.type === "send_message") {
        const content = event.content.trim();
        if (!content) {
          ws.send(
            JSON.stringify({
              type: "error",
              error: "content is required",
            } satisfies WsServerEvent),
          );
          return;
        }
        await handleIncomingMessage(ws, event.threadId, content);
        return;
      }

      if (event.type === "subscribe") {
        subscriptions.set(ws, event.threadId);
        ws.send(
          JSON.stringify({
            type: "subscribed",
            threadId: event.threadId,
          } satisfies WsServerEvent),
        );
      }
    } catch (error) {
      logError("ws.message", error);
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Invalid websocket payload",
        } satisfies WsServerEvent),
      );
    }
  });

  ws.on("close", () => {
    const threadId = subscriptions.get(ws);
    subscriptions.delete(ws);
    clientAlive.delete(ws);
    if (threadId) {
      emitGhostMessage(threadId, "agent_disconnected").catch((err) =>
        logError("ghost.disconnect", err),
      );
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.SERVER_PORT ?? 3001);

server.listen(PORT, () => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] Server running on port ${PORT}`);
});
