# ClawChat — Product Spec

> iMessage for AI Agents. The missing native interface for the agent era.

## The Gap

Every agent chat tool today falls into one of two buckets:

1. **Chat wrappers** (Open WebUI, LibreChat, AnythingLLM) — pretty ChatGPT clones for local models. No threading, no agent awareness, no memory visibility. 124K+ stars proves the demand, but they're model interfaces, not agent interfaces.

2. **Borrowed channels** (Telegram, Discord, Slack via OpenClaw) — works, but flat message streams. When you have 5 agents running tasks, sub-agents spawning, memory being written, costs accumulating — a single Telegram chat is chaos.

Claude Code's leaked architecture (Kairos daemon, AutoDream memory consolidation, three-layer memory) confirms where the industry is heading: **always-on agents with persistent memory that operate in the background.** But they're building it as a terminal tool. We're building it as a messaging experience.

## What ClawChat Is

A native messaging app (iOS, Android, Web) purpose-built for AI agent conversations:

- **Threads** — like iMessage conversations, but each is an isolated agent context
- **Agent telemetry** — see when agents are thinking, using tools, spawning sub-agents, in real-time
- **Memory visibility** — memory chips surface what the agent remembers, right in the conversation
- **Cost tracking** — see token usage and cost per thread, per message, per agent
- **Branch conversations** — fork any message into a new thread (like git branch for conversations)
- **Display types** — messages can be VISIBLE, COLLAPSED (tool outputs), HIDDEN (internal), GHOST (ephemeral)
- **Multi-agent** — one app, many agents. Connect to any OpenClaw instance.

## Architecture

```
packages/
├── server/          # Node.js + Express + Prisma (PostgreSQL) + WebSocket
├── client/          # Expo (React Native + Web) 
├── shared/          # TypeScript types, WS event definitions
├── bridge-openclaw/ # OpenClaw gateway adapter (WS-RPC)
└── bridge-telegram/ # Telegram relay bridge
```

## What Exists (Day 6 — ~2,900 lines)

### Working:
- Prisma schema: Thread, Message, MemoryChip, CostEntry models
- REST API: CRUD for threads, messages, memories, cost entries (12 endpoints)
- WebSocket: subscribe, send_message, message.new, agent lifecycle events
- Client: ThreadListScreen, ThreadDetailScreen, AgentStatusBar, MemoryChip, SubAgentDrawer
- OpenClaw bridge: WS-RPC connection, message relay
- Telegram bridge: message forwarding
- CORS, health check, pnpm workspaces

### Known Bugs:
- server/src/index.ts: runId is empty string (needs crypto.randomUUID())
- server/src/memory.ts: threadId param unused in getRelevant
- bridge-openclaw: seenIds not scoped per-thread
- client: no WS reconnection logic
- bridge-telegram: WS URL appends /ws but server has no such route

### Missing for Production:
- [ ] Authentication (API keys + JWT)
- [ ] Message pagination (cursor-based)
- [ ] Markdown rendering in messages
- [ ] Error boundaries in client
- [ ] Settings screen (server URL, API key, theme)
- [ ] Thread search
- [ ] Thread archive/delete
- [ ] Typing indicators
- [ ] Dark mode (should be default)
- [ ] Offline state handling
- [ ] Push notifications
- [ ] OpenClaw channel plugin mode
- [ ] Multi-agent routing
- [ ] Message reactions/actions
- [ ] File/image attachments
- [ ] Voice message support

## Competitive Intelligence

### Claude Code (leaked architecture — what to learn)
- **Three-layer memory**: MEMORY.md index (always loaded) → topic files (on-demand) → raw transcripts (grep only). We should implement this — it's exactly what our MemoryChip model supports.
- **Kairos daemon**: Always-on background agent with periodic "tick" prompts. We already have heartbeats — same concept.
- **AutoDream**: Memory consolidation during idle. Scan day's transcripts, merge observations, prune contradictions. We should build this into the server.
- **Strict Write Discipline**: Only update memory index after successful file write. Prevents context pollution from failed attempts.
- **"Buddy" system**: Tamagotchi-style personality with stats. Fun for engagement — consider for v2.

### Open WebUI (124K stars — market leader for local chat)
- Strengths: Beautiful UI, Ollama integration, RAG, voice/video
- Weakness: No agent awareness, no threading, no memory visibility, no sub-agent concept
- Lesson: UI polish matters enormously. People choose Open WebUI over better tools because it looks good.

### LibreChat / AnythingLLM
- Strengths: Multi-provider, enterprise features
- Weakness: Same as Open WebUI — chat wrappers, not agent interfaces
- Lesson: Multi-provider support is table stakes

## Differentiators (What Only ClawChat Does)

1. **Agent-native** — not a model wrapper, an agent interface. See tool calls, sub-agents, memory, costs.
2. **OpenClaw native** — first-class integration with the OpenClaw ecosystem (30+ channels, skills, sub-agents)
3. **Thread branching** — fork conversations like git branches
4. **Memory chips** — visible, pinnable, searchable agent memories in the conversation
5. **Display types** — collapse tool outputs, hide internal messages, ghost ephemeral content
6. **Mobile-first** — Expo means iOS + Android + Web from one codebase

## Build Phases

### Phase 1: Fix & Harden (Server + Shared)
- Fix all known bugs
- Add auth middleware
- Cursor-based message pagination
- Wire cost tracking
- Error handling on all routes
- WebSocket heartbeat + reconnection protocol

### Phase 2: Client Polish
- Markdown rendering (react-native-markdown-display)
- Dark mode default
- Settings screen
- Message search
- Thread management (archive, delete, rename)
- Error boundaries
- Loading states + skeleton screens
- Pull-to-refresh, infinite scroll

### Phase 3: Bridge Integration
- OpenClaw bridge: full bidirectional (ClawChat ↔ OpenClaw sessions)
- Sub-agent event forwarding
- Memory chip auto-creation from OpenClaw memory events
- Cost event passthrough
- Multi-agent routing (connect to multiple OpenClaw instances)

### Phase 4: Deploy & Dogfood
- PostgreSQL on Donna's Mini
- Server on Donna's Mini with PM2
- Expo web build deployed
- Connect to Newt (this session) via ClawChat
- Connect to @Nemo_Newt_Bot via ClawChat
- Fix everything that breaks

### Phase 5: OpenClaw Plugin
- Package as `@clawchat/openclaw-channel`
- Any OpenClaw instance can add ClawChat as a channel
- Config: `channels.clawchat.enabled: true, port: 3001`
- This is the distribution play — every OpenClaw user gets ClawChat
