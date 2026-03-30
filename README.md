# ClawChat

> iMessage for AI Agents. Open-source messaging layer for agent orchestration.

**Status: Day 6 complete — OpenClaw WS-RPC bridge, thread branching, memory chips, PostgreSQL**

---

## What is ClawChat?

Current AI chat interfaces (Telegram, Slack, Discord) treat agent conversations as flat message streams. This fails when:
- Multiple tasks run simultaneously — everything pollutes a single context
- Sub-agents produce large outputs you never asked to see
- You have no idea if an agent is running, stuck, finished, or crashed
- Every SSH output, tool call, and exec result stays in context forever

ClawChat is the missing messaging layer: **agent-native threading, visible memory, real-time agent telemetry** — all in a familiar chat interface that looks like iMessage 90% of the time.

Built with OpenClaw, dogfooded internally at Copia, open to the community.

---

## Architecture

```
packages/
├── server/          # Node.js + Express + Prisma (PostgreSQL) + WebSocket
├── client/          # Expo (React Native + Web)
├── shared/          # TypeScript types, WS event definitions
└── bridge-openclaw/ # OpenClaw gateway integration adapter
```

**Stack:** TypeScript everywhere · pnpm workspaces · Prisma 6 · Expo SDK 53 · ws · PostgreSQL

### Data model

```
Thread
  ├── parentThreadId?        (branch parent)
  ├── branchedFromMessageId? (branch point)
  ├── Message[]
  ├── MemoryChip[]
  └── CostEntry[]

Message  — role: USER|AGENT|SYSTEM|TOOL, displayType: VISIBLE|GHOST|COLLAPSED|HIDDEN
MemoryChip — text, pinned, metadata (JSON)
CostEntry  — tokens, costUsd, agentId
```

### WebSocket events

| Event | Direction | Description |
|-------|-----------|-------------|
| `subscribe` | client→server | Subscribe to a thread |
| `send_message` | client→server | Post a user message |
| `message.new` | server→client | New message in thread |
| `memory_chip` | server→client | In-flight memory match |
| `memory_chip.saved` | server→client | Persisted memory chip |
| `agent_started/progress/completed/failed` | server→client | Agent lifecycle |
| `cost_incurred` | server→client | Token/cost update |
| `thread.branch` | server→client | New child thread created |

### OpenClaw bridge protocol

The bridge connects to the OpenClaw gateway using **WebSocket RPC**:

```
ws://100.102.5.72:18789  →  { type:"req", id, method:"connect", params:{token} }
                          ←  { type:"res", id, result:{...} }
                          →  { type:"req", id, method:"chat.history", params:{sessionKey, limit} }
                          ←  { type:"res", id, result:{messages:[...]} }
                          ←  { type:"event", seq:N, stream:"...", text:"..." }
```

The gateway serves an SPA UI — all HTTP routes return HTML. Data access is exclusively via WebSocket RPC.

---

## Key Features (MVP)

- **Threaded conversations** — each task/topic gets isolated context
- **Thread branching** — branch from any message, visual breadcrumb, WS events
- **Ghost messages** — agent activity feed inline (`agent_started`, `agent_progress`, `agent_completed`, `memory_updated`, `cost_incurred`) — visually dimmed, non-intrusive
- **Memory chips** — `/remember <text>` creates tappable pill; GET/POST/PATCH/DELETE `/threads/:id/memories`
- **Agent status bar** — live agent state, runtime, cost tracking
- **OpenClaw bridge** — WebSocket RPC to gateway (verified protocol), replaces Telegram
- **Cross-platform** — React Native (iOS/Android) + Web from day one

---

## Getting Started

### Prerequisites
- Node 20+
- pnpm
- PostgreSQL (or SQLite for local dev — see below)
- Optional: Qdrant at `localhost:6333` (for memory features)

### Install & run

```bash
pnpm install

# Configure server
cp packages/server/.env.example packages/server/.env
# Edit DATABASE_URL, CLAWCHAT_API_KEY, etc.

# Run database migrations
cd packages/server && pnpm prisma migrate dev

# Start server (port 3001)
pnpm dev  # from packages/server

# Start client (Expo)
pnpm start  # from packages/client

# Start OpenClaw bridge (optional)
pnpm dev  # from packages/bridge-openclaw
```

### SQLite local dev fallback

```bash
# In packages/server/.env:
DATABASE_URL="file:./dev.db"

# In packages/server/prisma/schema.prisma, change datasource:
#   provider = "sqlite"

cd packages/server && pnpm prisma migrate dev
```

---

## REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/threads` | List all threads |
| POST | `/threads` | Create thread `{title}` |
| POST | `/threads/:id/branch` | Branch from message `{messageId, title?}` |
| GET | `/threads/:id/messages` | List messages |
| POST | `/threads/:id/messages` | Post message `{content, role, displayType}` |
| GET | `/threads/:id/memories` | List memory chips |
| POST | `/threads/:id/memories` | Create chip `{text, metadata?}` |
| PATCH | `/threads/:id/memories/:chipId` | Update chip `{text?, pinned?}` |
| DELETE | `/threads/:id/memories/:chipId` | Delete chip |
| GET | `/threads/:id/cost` | Get cost summary |
| POST | `/threads/:id/cost` | Record cost `{tokens, costUsd, agentId?}` |
| GET | `/memories?q=` | Search mem0 vector DB |
| GET | `/health` | Health check |

---

## Running in production (Tailscale)

1. Copy `packages/server/.env.example` → `packages/server/.env`
2. Set `CLAWCHAT_API_KEY=<random-secret>` in `.env`
3. Set `DATABASE_URL=postgresql://...` pointing at your Postgres instance
4. Run `pnpm prisma migrate deploy` in `packages/server`
5. Deploy the server behind Tailscale so only your mesh nodes can reach it
6. Set `EXPO_PUBLIC_API_KEY=<same-secret>` in the client env
7. Set `EXPO_PUBLIC_SERVER_URL=http://<tailscale-hostname>:3001`

If `CLAWCHAT_API_KEY` is unset the server runs in open dev mode (all requests allowed).

---

## Infrastructure

This project is dogfooded on:
- **Agent runtime:** OpenClaw gateway
- **Memory:** mem0 + Qdrant on Apple M3 Ultra (57 tok/s Nemotron MLX)
- **Network:** Tailscale mesh (MacBook + 2 Mac Minis + 2 Mac Studios)
- **Database:** PostgreSQL

---

## Progress

| Day | Status | What was built |
|-----|--------|----------------|
| Day 1 | ✅ Done | pnpm monorepo, Prisma schema, shared types, WS server skeleton, Expo scaffold |
| Day 2 | ✅ Done | Working Express+WS server, Prisma SQLite, REST endpoints, Expo thread list + chat screens |
| Day 3 | ✅ Done | mem0 memory chip integration, OpenClaw bridge wiring, memory chips interactive |
| Day 4 | ✅ Done | Agent status bar (live state, sub-agent count, cost+tokens), CostEntry DB, SubAgentDrawer, typed WS events |
| Day 5 | ✅ Done | Tailscale-first auth middleware, .env.example, ghost messages on WS connect/disconnect |
| Day 6 | ✅ Done | OpenClaw WS-RPC bridge (verified protocol), thread branching, memory chips CRUD, PostgreSQL, README, LICENSE |
| Day 7 | 🔄 Next | Push notifications, reconnect/sync, SQLite cache |

---

## License

Apache 2.0 — build with it, fork it, contribute back.

---

## Vision

Full spec: [docs/vision-v2.md](docs/vision-v2.md)
