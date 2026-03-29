# ClawChat

> iMessage for AI Agents. Open-source messaging layer for agent orchestration.

**Status: Day 5 complete — Tailscale auth, cost tracking, ghost messages, dogfooding-ready**

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
├── server/          # Node.js + Express + Prisma (SQLite) + WebSocket
├── client/          # Expo (React Native + Web)
├── shared/          # TypeScript types, WS event definitions
└── bridge-openclaw/ # OpenClaw gateway integration adapter
```

**Stack:** TypeScript everywhere · pnpm workspaces · Prisma 6 · Expo SDK 53 · ws

---

## Key Features (MVP)

- **Threaded conversations** — each task/topic gets isolated context
- **Ghost messages** — agent activity feed inline (`agent_started`, `agent_progress`, `agent_completed`, `memory_updated`, `cost_incurred`) — visually dimmed, non-intrusive
- **Memory chips** — inline tappable pills when agents recall/store facts via mem0
- **Agent status bar** — live agent state, runtime, cost tracking
- **OpenClaw bridge** — connects to existing OpenClaw gateway, replaces Telegram as primary interface
- **Cross-platform** — React Native (iOS/Android) + Web from day one

---

## Progress

| Day | Status | What was built |
|-----|--------|----------------|
| Day 1 | ✅ Done | pnpm monorepo, Prisma schema, shared types, WS server skeleton, Expo scaffold |
| Day 2 | ✅ Done | Working Express+WS server, Prisma SQLite, REST endpoints, Expo thread list + chat screens |
| Day 3 | ✅ Done | mem0 memory chip integration, OpenClaw bridge wiring, memory chips interactive |
| Day 4 | ✅ Done | Agent status bar (live state, sub-agent count, cost+tokens), CostEntry DB, SubAgentDrawer, typed WS events, thread name in status bar |
| Day 5 | ✅ Done | Tailscale-first auth middleware, .env.example, client config.ts, ghost messages on WS connect/disconnect |
| Day 6 | 🔄 Next | Push notifications, reconnect/sync, SQLite cache |

---

## Getting Started

```bash
# Install
pnpm install

# Run server (port 3001)
cd packages/server && pnpm dev

# Run client (Expo)
cd packages/client && pnpm start
```

Requires:
- Node 20+
- pnpm
- (For memory features) Qdrant running at `localhost:6333`

---

## Running in production (Tailscale)

ClawChat uses a simple Bearer-token auth layer designed for Tailscale mesh deployments.

1. Copy `packages/server/.env.example` → `packages/server/.env`
2. Set `CLAWCHAT_API_KEY=<random-secret>` in `.env`
3. Deploy the server behind Tailscale so only your mesh nodes can reach it
4. Set `EXPO_PUBLIC_API_KEY=<same-secret>` in the client env (or via Expo config `extra.API_KEY`)
5. Set `EXPO_PUBLIC_SERVER_URL=http://<tailscale-hostname>:3001`

The server will reject any request without a matching `Authorization: Bearer <key>` header.
If `CLAWCHAT_API_KEY` is unset the server runs in open dev mode (all requests allowed).

---

## Infrastructure

This project is dogfooded on:
- **Agent runtime:** OpenClaw gateway
- **Memory:** mem0 + Qdrant on Apple M3 Ultra (57 tok/s Nemotron MLX)
- **Network:** Tailscale mesh (MacBook + 2 Mac Minis + 2 Mac Studios)

---

## License

Apache 2.0 — build with it, fork it, contribute back.

---

## Vision

Full spec: [docs/vision-v2.md](docs/vision-v2.md)
