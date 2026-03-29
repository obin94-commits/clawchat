import http from 'http';
import express from 'express';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { WebSocketServer, WebSocket } from 'ws';
import type { MessageType, WsClientEvent, WsServerEvent } from '@clawchat/shared';

dotenv.config();

const prisma = new PrismaClient();
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
      orderBy: { timestamp: 'asc' },
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
    const messageType = (req.body?.messageType ?? req.body?.type ?? 'regular') as MessageType;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const message = await prisma.message.create({
      data: {
        threadId,
        content,
        type: messageType,
        senderId: req.body?.senderId ?? null,
        agentId: req.body?.agentId,
        progress: req.body?.progress,
        cost: req.body?.cost,
      },
    });

    broadcastToThread(threadId, { type: 'message', message });
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

        const message = await prisma.message.create({
          data: {
            threadId: event.threadId,
            content,
            type: event.messageType ?? 'regular',
          },
        });

        broadcastToThread(event.threadId, { type: 'message', message });
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
