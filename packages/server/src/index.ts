import { PrismaClient } from '@prisma/client';
import { WebSocketServer } from 'ws';
import http from 'http';
import express from 'express';

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// REST endpoints
app.get('/threads', async (req, res) => {
  const threads = await prisma.thread.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  res.json(threads);
});

app.post('/threads', async (req, res) => {
  const { title } = req.body;
  const thread = await prisma.thread.create({
    data: { title: title || 'Untitled' },
  });
  res.status(201).json(thread);
});

app.get('/threads/:id/messages', async (req, res) => {
  const { id } = req.params;
  const messages = await prisma.message.findMany({
    where: { threadId: id },
    orderBy: { timestamp: 'asc' },
  });
  res.json(messages);
});

app.post('/messages', async (req, res) => {
  const { threadId, content, type = 'regular', senderId } = req.body;
  const message = await prisma.message.create({
    data: {
      threadId,
      content,
      type,
      senderId: senderId || null,
    },
  });
  // Broadcast to WebSocket clients
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({ event: 'message_sent', data: message }));
    }
  });
  res.status(201).json(message);
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export {};
