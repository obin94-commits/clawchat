import http from 'http';
import express from 'express';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { WebSocketServer, WebSocket } from 'ws';
import type { WsClientEvent, WsServerEvent } from '@clawchat/shared';
import { MemoryService } from './memory.js';

dotenv.config();

const prisma = new PrismaClient();
const memory = new MemoryService();
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const subscriptions = new Map<WebSocket, string>();

app.use(express.json());

const broadcastToThread = (threadId: string, payload: WsServerEvent) => {
  const serialized = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (subscriptions.get(client) !== threadId) continue;
    client.send(serialized);
  }
};

app.get('/memories', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
    if (!q) { res.json([]); return; }
    const results = await memory.searchMemories(q, userId);
    res.json(results);
  } catch (error) {
    next(error);
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', clients: wss.clients.size });
});

app.get('/threads', async (_req, res, next) => {
  try {
    const threads = await prisma.thread.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    res.json(threads);
  } catch (error) {
    next(error);
  }
});

app.post('/threads', async (req, res, next) => {
  try {
    const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim() : 'Untitled';
    const thread = await prisma.thread.create({ data: { title } });
    res.status(201).json(thread);
  } catch (error) {
    next(error);
  }
});

app.get('/threads/:id/messages', async (req, res, next) => {
  try {
    const messages = await prisma.message.findMany({
      where: { threadId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(messages);
  } catch (error) {
    next(error);
  }
});

app.post('/threads/:id/messages', async (req, res, next) => {
  try {
    const threadId = req.params.id;
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    const role = (req.body?.role ?? 'USER') as string;
    const displayType = (req.body?.displayType ?? 'VISIBLE') as string;
    const metadata = req.body?.metadata ? JSON.stringify(req.body.metadata) : null;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const message = await prisma.message.create({
      data: { threadId, content, role, displayType, metadata },
    });

    await prisma.thread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });

    broadcastToThread(threadId, { type: 'message.new', threadId, payload: { message } } as unknown as WsServerEvent);

    // Fire-and-forget: store message in mem0
    memory.addMemory(content, 'robin', { threadId, role, messageId: message.id }).catch((err) => {
      console.error('[memory] addMemory failed:', err);
    });

    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

async function handleIncomingMessage(ws: WebSocket, threadId: string, content: string) {
  const message = await prisma.message.create({
    data: { threadId, content, role: 'USER', displayType: 'VISIBLE' },
  });

  await prisma.thread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });

  broadcastToThread(threadId, {
    type: 'message.new',
    threadId,
    payload: { message },
  } as unknown as WsServerEvent);

  // Retrieve relevant memories and emit chips
  const chips = await memory.getRelevant(threadId, content);
  for (const chip of chips) {
    broadcastToThread(threadId, {
      type: 'memory_chip',
      threadId,
      chip: {
        id: chip.id,
        content: chip.content,
        score: chip.score,
        category: chip.category,
      },
    });
  }

  // Store message in mem0 for future retrieval (fire-and-forget)
  memory.store(content, 'default', { threadId, role: 'USER', messageId: message.id }).catch((err) => {
    console.error('[memory] store failed:', err);
  });
}

wss.on('connection', (ws) => {
  let subscribed = false;

  ws.on('message', async (raw) => {
    try {
      const event = JSON.parse(raw.toString()) as WsClientEvent;

      if (!subscribed) {
        if (event.type !== 'subscribe') {
          ws.send(JSON.stringify({ type: 'error', error: 'First message must be subscribe' } satisfies WsServerEvent));
          ws.close();
          return;
        }

        subscriptions.set(ws, event.threadId);
        subscribed = true;
        ws.send(JSON.stringify({ type: 'subscribed', threadId: event.threadId } satisfies WsServerEvent));
        return;
      }

      if (event.type === 'send_message') {
        const content = event.content.trim();
        if (!content) {
          ws.send(JSON.stringify({ type: 'error', error: 'content is required' } satisfies WsServerEvent));
          return;
        }

        await handleIncomingMessage(ws, event.threadId, content);
        return;
      }

      if (event.type === 'subscribe') {
        subscriptions.set(ws, event.threadId);
        ws.send(JSON.stringify({ type: 'subscribed', threadId: event.threadId } satisfies WsServerEvent));
      }
    } catch (error) {
      console.error('WebSocket error', error);
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid websocket payload' } satisfies WsServerEvent));
    }
  });

  ws.on('close', () => {
    subscriptions.delete(ws);
  });
});

const PORT = Number(process.env.SERVER_PORT ?? 3001);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
