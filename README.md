# ClawChat

> **iMessage for AI Agents.** Open-source messaging layer for agent orchestration.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Expo](https://img.shields.io/badge/Expo-SDK%2053-green.svg)](https://expo.dev/)

---

## Overview

ClawChat is a native messaging interface for AI agent conversations. Unlike chat wrappers (Open WebUI, LibreChat) that treat agents as simple Q&A bots, ClawChat provides:

- **Threaded conversations** — isolated context per task/topic
- **Thread branching** — fork any message into a new thread (like `git branch` for conversations)
- **Agent telemetry** — real-time visibility into agent state, sub-agents, tool calls
- **Memory chips** — visible, pinnable agent memories inline with conversation
- **Cost tracking** — per-thread token usage and USD cost estimates
- **OpenClaw integration** — first-class bridge to OpenClaw gateway ecosystem

Built with TypeScript, Expo, and PostgreSQL. Mobile-first (iOS/Android/Web).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ClawChat System                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Client     │    │    Server    │    │   Bridges    │      │
│  │  (Expo)      │◄──►│  (Express)   │◄──►│  (OpenClaw) │      │
│  │              │    │              │    │  (Telegram) │      │
│  │ • iOS        │    │ • REST API  │    │              │      │
│  │ • Android    │    │ • WebSocket │    │ • WS-RPC    │      │
│  │ • Web        │    │ • Prisma    │    │ • Polling   │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                    │                    │              │
│         └────────────────────┼────────────────────┘              │
│                              ▼                                   │
│                   ┌──────────────────┐                          │
│                   │   PostgreSQL     │                          │
│                   │   • Threads      │                          │
│                   │   • Messages     │                          │
│                   │   • CostEntries  │                          │
│                   │   • MemoryChips  │                          │
│                   └────────┬─────────┘                          │
│                            │                                    │
│                            ▼                                   │
│                   ┌──────────────────┐                          │
│                   │    mem0 +        │                          │
│                   │    Qdrant        │                          │
│                   │   (vector DB)    │                          │
│                   └──────────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Model

```
Thread
├── parentThreadId?        (branch parent)
├── branchedFromMessageId? (branch point)
├── Message[]
├── MemoryChip[]
└── CostEntry[]

Message
├── role: USER | AGENT | SYSTEM | TOOL
├── displayType: VISIBLE | GHOST | COLLAPSED | HIDDEN
├── content: string
└── metadata: JSON

MemoryChip
├── text: string
├── pinned: boolean
└── metadata: JSON

CostEntry
├── agentId?: string
├── tokens: number
└── costUsd: number
```

---

## Features

### Implemented

| Feature              | Description                                                   |
| -------------------- | ------------------------------------------------------------- |
| **Threaded chat**    | Create, list, delete threads with isolated contexts           |
| **Thread branching** | Fork any message into a new child thread                      |
| **Message roles**    | USER, AGENT, SYSTEM, TOOL with proper display                 |
| **Display types**    | VISIBLE, GHOST (ephemeral), COLLAPSED, HIDDEN                 |
| **Memory chips**     | `/remember` command, CRUD API, vector search via mem0         |
| **Cost tracking**    | Per-thread token/cost summaries, per-agent breakdowns         |
| **WebSocket events** | Real-time message delivery, agent lifecycle, cost updates     |
| **OpenClaw bridge**  | Bidirectional WS-RPC, sub-agent forwarding, auto-memory       |
| **Multi-agent**      | Route threads to different agents via title prefix `[@agent]` |
| **Pagination**       | Cursor-based message pagination (50-200 limit)                |
| **Auth**             | Bearer token via `CLAWCHAT_API_KEY` env var                   |
| **Rate limiting**    | 100 requests/minute per IP                                    |
| **Dark mode**        | Default theme with light mode option                          |
| **Markdown**         | Basic markdown rendering in messages                          |
| **Settings**         | Server URL, API key, theme configuration                      |
| **Error boundaries** | Graceful error handling in client                             |

### In Progress / Planned

- Push notifications (Expo Push)
- Thread search (full-text)
- Thread archive/rename
- Typing indicators
- Offline mode with SQLite cache
- Message reactions
- File attachments
- Voice messages
- OpenClaw channel plugin (`@clawchat/openclaw-channel`)

---

## Quick Start

### Prerequisites

```bash
# Required
node --version   # 20+
pnpm --version   # 8+

# For production database
pg_isready -h localhost -p 5432  # PostgreSQL 14+

# Optional for memory features
curl http://localhost:6333       # Qdrant (optional)
```

### Installation

```bash
# Clone and install
git clone https://github.com/copia-claw/clawchat.git
cd clawchat
pnpm install

# Configure environment
cp packages/server/.env.example packages/server/.env
# Edit .env - set DATABASE_URL, CLAWCHAT_API_KEY

# Run database migrations
cd packages/server && pnpm prisma migrate dev

# Start development servers (separate terminals)

# Server (port 3001)
cd packages/server && pnpm dev

# Client (Expo)
cd packages/client && pnpm start

# OpenClaw bridge (optional)
cd packages/bridge-openclaw && pnpm dev
```

### Local Development with SQLite

```bash
# In packages/server/.env:
DATABASE_URL="file:./dev.db"

# In packages/server/prisma/schema.prisma, change:
# datasource db { provider = "sqlite" }

cd packages/server && pnpm prisma migrate dev
```

---

## Configuration

### Server Environment Variables

| Variable           | Required | Description                           | Example                                          |
| ------------------ | -------- | ------------------------------------- | ------------------------------------------------ |
| `DATABASE_URL`     | Yes      | PostgreSQL connection string          | `postgresql://user:pass@localhost:5432/clawchat` |
| `CLAWCHAT_API_KEY` | No       | Bearer token for auth (skip if unset) | `your-secret-key-here`                           |
| `SERVER_PORT`      | No       | HTTP port                             | `3001`                                           |
| `QDRANT_URL`       | No       | Qdrant vector DB URL                  | `http://localhost:6333`                          |
| `MEM0_API_KEY`     | No       | mem0 API key                          | `mem0_...`                                       |

### Client Environment Variables

| Variable                 | Required | Description      | Example                 |
| ------------------------ | -------- | ---------------- | ----------------------- |
| `EXPO_PUBLIC_SERVER_URL` | Yes      | Server base URL  | `http://localhost:3001` |
| `EXPO_PUBLIC_API_KEY`    | No       | Matching API key | `your-secret-key-here`  |

### OpenClaw Bridge Environment Variables

| Variable           | Required | Description                | Example                   |
| ------------------ | -------- | -------------------------- | ------------------------- |
| `CLAWCHAT_URL`     | Yes      | ClawChat server URL        | `http://localhost:3001`   |
| `CLAWCHAT_API_KEY` | No       | ClawChat API key           | `your-secret-key-here`    |
| `OPENCLAW_WS`      | Yes      | OpenClaw gateway WebSocket | `ws://100.102.5.72:18789` |
| `OPENCLAW_TOKEN`   | Yes      | OpenClaw auth token        | `698900e3...`             |
| `OPENCLAW_SESSION` | No       | Default session key        | `main`                    |
| `OPENCLAW_AGENTS`  | No       | Multi-agent JSON config    | `[{"name":"agent1",...}]` |

#### Multi-Agent Configuration

```bash
# Single agent (legacy)
OPENCLAW_WS=ws://host:port
OPENCLAW_TOKEN=your-token
OPENCLAW_SESSION=main

# Multi-agent (recommended)
OPENCLAW_AGENTS='[
  {
    "name": "researcher",
    "url": "ws://host1:18789",
    "token": "token1",
    "sessionKey": "research"
  },
  {
    "name": "coder",
    "url": "ws://host2:18789",
    "token": "token2",
    "sessionKey": "coding"
  }
]'
```

Thread routing: Title starting with `[researcher]` routes to researcher agent. Unmatched threads go to first agent.

---

## API Reference

### Base URL

```
http://localhost:3001
```

### Authentication

All endpoints (except `/health`) require:

```http
Authorization: Bearer <CLAWCHAT_API_KEY>
```

### REST Endpoints

#### Threads

**List threads**

```http
GET /threads
```

Response:

```json
[
  {
    "id": "clzabc123",
    "title": "Research task",
    "parentThreadId": null,
    "branchedFromMessageId": null,
    "createdAt": "2026-03-29T10:00:00.000Z",
    "updatedAt": "2026-03-29T12:00:00.000Z"
  }
]
```

**Create thread**

```http
POST /threads
Content-Type: application/json

{
  "title": "New conversation"
}
```

Response: `201 Created` with thread object

**Delete thread**

```http
DELETE /threads/:id
```

Response: `204 No Content` (also deletes messages, memories, cost entries)

**Branch thread**

```http
POST /threads/:id/branch
Content-Type: application/json

{
  "messageId": "clzmsg456",
  "title": "Branch: Alternative approach" // optional
}
```

Response: `201 Created` with child thread object

---

#### Messages

**List messages (paginated)**

```http
GET /threads/:id/messages?cursor=<messageId>&limit=50
```

Query params:

- `cursor` (optional): Message ID to start from (exclusive)
- `limit` (optional): 1-200, default 50

Response:

```json
{
  "messages": [
    {
      "id": "clzmsg456",
      "threadId": "clzabc123",
      "role": "USER",
      "content": "Hello, analyze this",
      "displayType": "VISIBLE",
      "metadata": null,
      "createdAt": "2026-03-29T10:00:00.000Z",
      "updatedAt": "2026-03-29T10:00:00.000Z"
    }
  ],
  "nextCursor": "clzmsg123" // null if no more
}
```

**Post message**

```http
POST /threads/:id/messages
Content-Type: application/json

{
  "content": "Hello, analyze this",
  "role": "USER",        // USER | AGENT | SYSTEM | TOOL
  "displayType": "VISIBLE", // VISIBLE | GHOST | COLLAPSED | HIDDEN
  "metadata": {}         // optional JSON object
}
```

Response: `201 Created` with message object

Notes:

- `content` max 100KB (truncated if longer)
- SYSTEM messages with special prefixes trigger WebSocket events:
  - `agent_started: <name>` → `agent_started` event
  - `agent_completed: <name>` → `agent_completed` event
  - `agent_failed: <name> - <error>` → `agent_failed` event
  - `agent_progress: <name> - <action>` → `agent_progress` event
  - `cost_incurred: tokens=N, cost=X, agent=Y` → `cost_incurred` event
- `/remember <text>` automatically creates a memory chip

---

#### Memory Chips

**List memory chips**

```http
GET /threads/:id/memories
```

Response:

```json
[
  {
    "id": "clzmem789",
    "threadId": "clzabc123",
    "text": "User prefers concise responses",
    "metadata": "{\"source\": \"explicit\"}",
    "pinned": true,
    "createdAt": "2026-03-29T10:00:00.000Z"
  }
]
```

**Create memory chip**

```http
POST /threads/:id/memories
Content-Type: application/json

{
  "text": "Important fact to remember",
  "metadata": {} // optional
}
```

Response: `201 Created` with chip object

**Update memory chip**

```http
PATCH /threads/:id/memories/:chipId
Content-Type: application/json

{
  "text": "Updated text",  // optional
  "pinned": true         // optional
}
```

Response: Updated chip object

**Delete memory chip**

```http
DELETE /threads/:id/memories/:chipId
```

Response: `204 No Content`

---

#### Cost Tracking

**Get cost summary**

```http
GET /threads/:id/cost/summary
```

Response:

```json
{
  "totalTokens": 15420,
  "totalCostUsd": 0.0456,
  "byAgent": [
    {
      "agentId": "researcher:claude-opus-4",
      "totalTokens": 12000,
      "totalCostUsd": 0.035
    },
    {
      "agentId": null,
      "totalTokens": 3420,
      "totalCostUsd": 0.0106
    }
  ]
}
```

**Get cost entries**

```http
GET /threads/:id/cost
```

Response:

```json
{
  "totalTokens": 15420,
  "totalCostUsd": 0.0456,
  "entries": [
    {
      "id": "clzcost123",
      "threadId": "clzabc123",
      "agentId": "researcher:claude-opus-4",
      "tokens": 12000,
      "costUsd": 0.035,
      "createdAt": "2026-03-29T10:00:00.000Z"
    }
  ]
}
```

**Record cost**

```http
POST /threads/:id/cost
Content-Type: application/json

{
  "agentId": "researcher:claude-opus-4",
  "tokens": 12000,
  "costUsd": 0.035
}
```

Response: `201 Created` with cost entry object

---

#### Memory Search

**Search global memories**

```http
GET /memories?q=<query>&userId=<userId>
```

Response:

```json
[
  {
    "id": "mem0-abc123",
    "content": "User prefers concise responses",
    "score": 0.85,
    "category": "preference",
    "tags": ["communication", "style"]
  }
]
```

---

#### Health Check

```http
GET /health
```

Response:

```json
{
  "status": "ok",
  "clients": 3 // connected WebSocket clients
}
```

No authentication required.

---

## WebSocket Events

### Connection

```typescript
// Connect to WebSocket
const ws = new WebSocket("ws://localhost:3001");

// First message must subscribe to a thread
ws.send(
  JSON.stringify({
    type: "subscribe",
    threadId: "clzabc123",
  }),
);
```

### Client → Server Events

| Event             | Payload                                 | Description                |
| ----------------- | --------------------------------------- | -------------------------- |
| `subscribe`       | `{ threadId: string }`                  | Subscribe to thread events |
| `send_message`    | `{ threadId: string, content: string }` | Send a user message        |
| `thread.navigate` | `{ threadId: string }`                  | Change active thread       |

### Server → Client Events

| Event               | Payload                                                                          | Description                  |
| ------------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| `subscribed`        | `{ threadId: string }`                                                           | Confirmation of subscription |
| `message.new`       | `{ threadId: string, payload: { message: Message } }`                            | New message in thread        |
| `agent_started`     | `{ threadId: string, agentName: string, runId: string }`                         | Agent execution started      |
| `agent_progress`    | `{ threadId: string, agentName: string, runId: string, action: string }`         | Agent progress update        |
| `agent_completed`   | `{ threadId: string, agentName: string, runId: string }`                         | Agent execution completed    |
| `agent_failed`      | `{ threadId: string, agentName: string, runId: string, error: string }`          | Agent execution failed       |
| `cost_incurred`     | `{ threadId: string, cost: number, tokens?: number, agentName?: string }`        | Cost tracking update         |
| `memory_chip`       | `{ threadId: string, chip: { id, content, score, category } }`                   | Relevant memory found        |
| `memory_chip.saved` | `{ threadId: string, chip: PersistedMemoryChip }`                                | Memory chip persisted        |
| `thread.branch`     | `{ parentThreadId: string, childThread: Thread, branchedFromMessageId: string }` | New branch created           |
| `error`             | `{ error: string }`                                                              | Error occurred               |

### Example Client Code

```typescript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "message.new":
      addMessageToUI(data.payload.message);
      break;
    case "agent_started":
      showAgentStatus(data.agentName, "running");
      break;
    case "agent_completed":
      showAgentStatus(data.agentName, "completed");
      break;
    case "cost_incurred":
      updateCostDisplay(data.cost, data.tokens);
      break;
    case "memory_chip":
      showMemoryChip(data.chip);
      break;
    case "thread.branch":
      navigateToThread(data.childThread.id);
      break;
  }
};
```

---

## OpenClaw Plugin Setup

### As a Bridge (Standalone)

```bash
# Configure bridge
cd packages/bridge-openclaw

# Single agent
export OPENCLAW_WS="ws://100.102.5.72:18789"
export OPENCLAW_TOKEN="your-token"
export OPENCLAW_SESSION="main"
export CLAWCHAT_URL="http://localhost:3001"

# Multi-agent
export OPENCLAW_AGENTS='[{"name":"agent1","url":"...","token":"..."}]'

# Run
pnpm dev
```

### As an OpenClaw Channel (Phase 6)

The `@clawchat/openclaw-channel` package allows any OpenClaw instance to add ClawChat as a native channel:

```json
// OpenClaw config
{
  "channels": {
    "clawchat": {
      "enabled": true,
      "port": 3001,
      "url": "http://localhost:3001",
      "apiKey": "your-secret-key"
    }
  }
}
```

---

## Contributing

### Development Workflow

```bash
# 1. Fork and clone
git clone https://github.com/your-user/clawchat.git
cd clawchat
pnpm install

# 2. Set up development database
cp packages/server/.env.example packages/server/.env
# Edit .env with your settings
cd packages/server && pnpm prisma migrate dev

# 3. Run tests (when available)
pnpm test

# 4. Run linting
pnpm lint

# 5. Run type checking
pnpm typecheck

# 6. Make changes and test locally
pnpm dev  # from root to run all packages
```

### Code Style

- TypeScript everywhere
- ESLint + Prettier (configured in root)
- Functional components with hooks (client)
- Express routes in single file (server) — keep it simple
- Prisma for database access

### Adding a Feature

1. Check existing issues/discussions for similar ideas
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Update types in `packages/shared` if needed
4. Implement server-side logic in `packages/server/src/index.ts`
5. Implement client-side UI in `packages/client/src/`
6. Test locally with real OpenClaw connection if applicable
7. Submit PR with description and screenshots

### Bug Reports

Include:

- Steps to reproduce
- Expected vs actual behavior
- Server logs (if applicable)
- Client platform (iOS/Android/Web)
- ClawChat version (check `package.json`)

---

## License

Apache License 2.0

```apache
Copyright 2026 Copia and contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

## Vision

Full product specification: [docs/vision-v2.md](docs/vision-v2.md)

Technical spec: [SPEC.md](SPEC.md)

---

## Acknowledgments

- Inspired by leaked Claude Code architecture (Kairos, AutoDream, three-layer memory)
- Built on top of OpenClaw's channel/skills ecosystem
- mem0 for memory management
- Qdrant for vector search

Built by Robin Danielsen with help from Newt, Forge 1, and the Copia team.
