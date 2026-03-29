# ClawChat Vision v2

> **Status:** Internal MVP spec — not a pitch deck.
> **Author:** Newt (synthesized from 4-model review of v1)
> **Date:** 2026-03-29
> **Goal:** Replace Telegram as the primary OpenClaw agent interface within days.

---

## The Problem

Our main Opus session hit 210K tokens in a single working day. Breakdown:

- ~12K tokens were actual workspace files
- ~198K tokens were tool outputs, sub-agent completions, SSH dumps, and exec results
- A single `git merge` output consumed ~15-20K tokens
- Each of ~10 sub-agents contributed 2-5K token payloads
- All of it stays in context permanently

Seven concurrent workstreams (Nemotron MLX deploy, Spark benchmarks, onboarding limits, context trim, ClawChat vision, Studio 2 fix, OpenClaw config) were jammed into one flat Telegram thread with no isolation, no memory, no cost visibility, and no way to collapse irrelevant output.

Current AI chat interfaces — Telegram, Slack, ChatGPT — are structurally wrong for agent orchestration. They provide flat text without:

- Thread-scoped context isolation
- Persistent memory that survives sessions
- Sub-agent visibility and control
- Cost tracking
- Collapsible tool output

ClawChat is the native interface for this workflow.

---

## Core Principles

1. **Internal tool first.** Robin uses it daily before anyone else sees it. OSS comes later.
2. **Memory is a product feature, not a hidden implementation detail.** Users see, edit, pin, and forget memories inline.
3. **Agents are first-class citizens.** Threads know about sub-agents, costs, tool calls, and execution state.
4. **Bridge-first migration.** Telegram bridge on day 2 means instant dogfooding with real workflows.
5. **Boring reliability over flashy demos.** Auth, sync, error handling, and data model come before graph views and ambient effects.

---

## MVP Scope — 5 Features, 5 Days

### 1. Threaded Chat UI
Conversations with isolated context. Each thread has its own message history, agent state, and memory scope.

- Thread list (sorted by recency, unread indicators)
- Thread detail view (messages, agent responses, tool output)
- Collapsible tool output (SSH logs, exec results default to collapsed)
- Basic markdown rendering + syntax-highlighted code blocks
- Optimistic local send with server confirmation

### 2. Memory Chips
Inline, tappable, editable memory indicators powered by mem0 + Qdrant (already running on Studio 1 at `100.93.134.22:6333`, 333+ memories imported).

- Small pill UI appears when an agent recalls or stores a fact
- Only shown when relevance score > 0.7 (configurable threshold)
- Tap to expand inline: title, category, tags, timestamp, source
- Long-press to edit (saves immediately, re-indexes in Qdrant)
- Long-press to pin to thread header
- Swipe to forget (soft delete with undo)
- Provenance visible: where the memory came from (chat, file, manual, tool output)

Memory retrieval pipeline:
```
Query → text-embedding-3-small (~100ms) → Qdrant top-k=10 (~50ms) → recency boost → threshold 0.7 → top 5
```

### 3. Agent Status Bar + Cost Tracking
Always-visible bar showing what agents are doing and what it costs.

- Active agent name + current action ("Forge 1 compiling… 82s")
- Token counter (input/output) + USD cost estimate
- Per-thread cumulative cost
- Sub-agent list: tap to see state, runtime, cost per agent
- Error states: red indicator when an agent crashes, tap to see error + retry

Cost is stored as a ledger, not just a UI element — every entry includes:
- Model used, provider, input/output tokens
- Wall-clock time, tool count, memory retrieval count
- Estimated + actual billed cost

### 4. OpenClaw Bridge
Replaces current Telegram bridge as the primary communication channel. This is the critical path — everything else is useless without the pipe.

- WebSocket connection to OpenClaw gateway (`ws://100.102.5.72:18789/ws`)
- Bidirectional: send user messages, receive agent responses + events
- Telegram bridge retained as fallback/secondary channel during transition
- Message identity mapping between bridge sources
- Reconnect with backfill on socket drop

### 5. Auth + Data Model
Single-user (Robin) for internal MVP. Multi-user comes later.

- Tailscale-authenticated connection (device identity)
- JWT session tokens issued by the Node server
- Device registration for push notifications
- All data in Prisma/SQLite locally + Postgres on the server

---

## What's Cut from MVP

| Feature | Why Cut | When |
|---|---|---|
| Knowledge graph | Demo-ware. Force-directed graphs on mobile are janky. Searchable entity list serves the same need. | Phase 3+ |
| Kanban board | Competes with Mission Control (Supabase). Chat app ≠ project management tool. | Maybe never |
| Ghost messages | Ambient updates add noise, not signal. Real status goes in the status bar. | Phase 2 eval |
| Thread branching | Architecturally complex (context inheritance, merge semantics). Simple thread creation is enough for now. | Phase 2 |
| "Blue Bubble" positioning | Marketing, not a feature. Remove from feature lists entirely. | OSS launch |
| Smart folds | Good idea but depends on stable message model first. | Phase 2 |
| MQTT | WebSocket is sufficient. MQTT adds broker complexity for zero MVP benefit. | If needed later |
| Paperclip governance | Phantom dependency. OpenClaw has built-in tool policies and `/approve` flows. | Remove |

---

## Data Model — Prisma Schema Draft

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String    @id @default(cuid())
  name          String
  tailscaleId   String?   @unique   // Tailscale device identity
  avatarUrl     String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  threads       Thread[]
  messages      Message[]
  devices       Device[]
}

model Device {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id])
  platform      String    // "ios" | "android" | "web"
  pushToken     String?   // APNs or FCM token
  lastSeen      DateTime  @default(now())
  createdAt     DateTime  @default(now())

  @@index([userId])
}

model Thread {
  id            String    @id @default(cuid())
  title         String?
  userId        String
  user          User      @relation(fields: [userId], references: [id])
  parentId      String?   // For future branching
  parent        Thread?   @relation("ThreadBranch", fields: [parentId], references: [id])
  children      Thread[]  @relation("ThreadBranch")
  pinned        Boolean   @default(false)
  archived      Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  messages      Message[]
  agents        AgentRun[]
  costEntries   CostEntry[]
  memoryChips   MemoryChip[]

  @@index([userId, updatedAt])
}

model Message {
  id            String      @id @default(cuid())
  threadId      String
  thread        Thread      @relation(fields: [threadId], references: [id], onDelete: Cascade)
  userId        String?
  user          User?       @relation(fields: [userId], references: [id])
  agentRunId    String?
  agentRun      AgentRun?   @relation(fields: [agentRunId], references: [id])
  role          MessageRole // USER, AGENT, SYSTEM, TOOL
  content       String
  metadata      Json?       // tool name, exit code, display_type, etc.
  displayType   DisplayType @default(VISIBLE) // VISIBLE, COLLAPSED, HIDDEN
  bridgeSource  String?     // "telegram", "slack", null for native
  bridgeId      String?     // Original message ID from bridge
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  memoryChips   MemoryChip[]
  costEntries   CostEntry[]

  @@index([threadId, createdAt])
  @@index([bridgeSource, bridgeId])
}

enum MessageRole {
  USER
  AGENT
  SYSTEM
  TOOL
}

enum DisplayType {
  VISIBLE
  COLLAPSED
  HIDDEN
}

model AgentRun {
  id            String        @id @default(cuid())
  threadId      String
  thread        Thread        @relation(fields: [threadId], references: [id], onDelete: Cascade)
  agentName     String        // "Newt", "Forge 1", "sub-agent:abc123"
  parentRunId   String?       // Sub-agent parent
  parentRun     AgentRun?     @relation("SubAgent", fields: [parentRunId], references: [id])
  childRuns     AgentRun[]    @relation("SubAgent")
  status        AgentStatus   // RUNNING, COMPLETED, FAILED, CANCELLED
  model         String?       // "claude-opus-4", "nemotron-mlx"
  startedAt     DateTime      @default(now())
  completedAt   DateTime?
  error         String?
  toolCount     Int           @default(0)

  messages      Message[]
  costEntries   CostEntry[]

  @@index([threadId, startedAt])
  @@index([status])
}

enum AgentStatus {
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

model MemoryChip {
  id            String    @id @default(cuid())
  threadId      String
  thread        Thread    @relation(fields: [threadId], references: [id], onDelete: Cascade)
  messageId     String?   // Message that surfaced this memory
  message       Message?  @relation(fields: [messageId], references: [id])
  mem0Id        String    // Reference to mem0 memory ID
  content       String    // Snapshot of memory content at time of surfacing
  category      String?   // "decision", "preference", "fact", "lesson"
  relevance     Float     // 0.0-1.0 relevance score from retrieval
  pinned        Boolean   @default(false)
  forgotten     Boolean   @default(false) // Soft delete
  source        String?   // "chat", "file", "manual", "tool_output", "imported"
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([threadId])
  @@index([mem0Id])
  @@index([pinned])
}

model CostEntry {
  id            String    @id @default(cuid())
  threadId      String
  thread        Thread    @relation(fields: [threadId], references: [id], onDelete: Cascade)
  messageId     String?
  message       Message?  @relation(fields: [messageId], references: [id])
  agentRunId    String?
  agentRun      AgentRun? @relation(fields: [agentRunId], references: [id])
  model         String    // "claude-opus-4", "nemotron-mlx", "text-embedding-3-small"
  provider      String    // "anthropic", "openai", "local"
  inputTokens   Int       @default(0)
  outputTokens  Int       @default(0)
  wallClockMs   Int       @default(0)
  toolCount     Int       @default(0)
  memoryLookups Int       @default(0)
  estimatedCost Float     @default(0) // USD
  billedCost    Float?    // USD, filled when invoice data available
  createdAt     DateTime  @default(now())

  @@index([threadId, createdAt])
  @@index([agentRunId])
}
```

---

## WebSocket Event Types

All client↔server communication uses typed JSON envelopes over a single WebSocket connection:

```typescript
// Base envelope — every message has this shape
interface WsEnvelope<T extends string = string, P = unknown> {
  type: T;
  id: string;          // Unique event ID (cuid)
  threadId: string;
  timestamp: number;   // Unix ms
  payload: P;
}

// ─── Client → Server ───────────────────────────────────

interface SendMessage {
  type: "message.send";
  payload: {
    content: string;
    metadata?: Record<string, unknown>;
  };
}

interface ThreadCreate {
  type: "thread.create";
  payload: {
    title?: string;
  };
}

interface ThreadArchive {
  type: "thread.archive";
  payload: {};
}

interface MemoryEdit {
  type: "memory.edit";
  payload: {
    chipId: string;
    content: string;
  };
}

interface MemoryPin {
  type: "memory.pin";
  payload: {
    chipId: string;
    pinned: boolean;
  };
}

interface MemoryForget {
  type: "memory.forget";
  payload: {
    chipId: string;
  };
}

interface AgentAction {
  type: "agent.action";
  payload: {
    runId: string;
    action: "cancel" | "retry";
  };
}

interface ClientSync {
  type: "sync.request";
  payload: {
    lastEventId?: string;  // Resume from this event
    threadId?: string;      // Specific thread or all
  };
}

// ─── Server → Client ───────────────────────────────────

interface MessageNew {
  type: "message.new";
  payload: {
    message: {
      id: string;
      role: "USER" | "AGENT" | "SYSTEM" | "TOOL";
      content: string;
      displayType: "VISIBLE" | "COLLAPSED" | "HIDDEN";
      agentRunId?: string;
      metadata?: Record<string, unknown>;
    };
  };
}

interface MessageUpdate {
  type: "message.update";
  payload: {
    messageId: string;
    content?: string;       // For streaming token deltas
    displayType?: "VISIBLE" | "COLLAPSED" | "HIDDEN";
    append?: boolean;       // True = append content, false = replace
  };
}

interface TokenDelta {
  type: "message.delta";
  payload: {
    messageId: string;
    delta: string;          // Incremental text chunk
  };
}

interface ThreadCreated {
  type: "thread.created";
  payload: {
    thread: {
      id: string;
      title?: string;
    };
  };
}

interface ThreadUpdated {
  type: "thread.updated";
  payload: {
    threadId: string;
    title?: string;
    archived?: boolean;
    updatedAt: number;
  };
}

interface AgentStatusUpdate {
  type: "agent.status";
  payload: {
    run: {
      id: string;
      agentName: string;
      status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
      model?: string;
      parentRunId?: string;
      startedAt: number;
      completedAt?: number;
      error?: string;
      toolCount: number;
    };
  };
}

interface MemorySurfaced {
  type: "memory.surfaced";
  payload: {
    chip: {
      id: string;
      mem0Id: string;
      content: string;
      category?: string;
      relevance: number;
      source?: string;
      messageId: string;
    };
  };
}

interface MemoryUpdated {
  type: "memory.updated";
  payload: {
    chipId: string;
    content?: string;
    pinned?: boolean;
    forgotten?: boolean;
  };
}

interface CostUpdate {
  type: "cost.update";
  payload: {
    entry: {
      id: string;
      model: string;
      provider: string;
      inputTokens: number;
      outputTokens: number;
      estimatedCost: number;
      agentRunId?: string;
      messageId?: string;
    };
  };
}

interface SyncResponse {
  type: "sync.response";
  payload: {
    events: WsEnvelope[];  // Ordered replay of missed events
    hasMore: boolean;
  };
}

interface ErrorEvent {
  type: "error";
  payload: {
    code: string;           // "AUTH_FAILED", "THREAD_NOT_FOUND", "RATE_LIMITED", etc.
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
  };
}
```

---

## Auth & Identity Model

**MVP (single-user internal):**
- Connection authenticated via Tailscale device identity
- Node server validates Tailscale peer IP on WebSocket upgrade
- JWT issued on first connect, short-lived (24h), auto-refreshed
- Device registered on first connect (platform, push token)

**Phase 2 (multi-user):**
- Email/password or OAuth (GitHub)
- Workspace model: users belong to workspaces, threads belong to workspaces
- Role-based permissions: owner (full control), member (use agents, edit own memory), viewer (read-only)
- Agent action gating: destructive actions (kill, restart) require owner role

---

## Error Handling Patterns

| Scenario | Behavior |
|---|---|
| Agent crashes mid-response | Message marked with error state. Status bar turns red with agent name. Tap → error detail + "Retry" button. |
| Memory retrieval slow (>2s) | Skeleton chip placeholders shown. Message renders without blocking on memory. Chips fade in when ready. |
| WebSocket disconnects | Local message queue. Exponential backoff reconnect (1s, 2s, 4s… max 30s). On reconnect: `sync.request` with last event ID. Backfill missed events. |
| Memory edit conflicts | Optimistic UI update. If server rejects (concurrent edit), show conflict toast with "Keep mine" / "Use server" options. |
| Cost exceeds threshold | Configurable per-thread budget. At 80%: yellow warning in status bar. At 100%: pause agent execution, require explicit "Continue" tap. |
| Rate limited | `error` event with `retryable: true` and `retryAfterMs`. Client shows "Slow down" indicator, auto-retries. |
| Invalid auth | `error` event with `code: "AUTH_FAILED"`. Client clears token, re-authenticates. |

---

## Push Notification Strategy

**MVP:** Expo Push Notifications (works for both iOS and Android without native APNs/FCM setup).

| Event | Notification | Priority |
|---|---|---|
| Agent run completed | "✅ {agentName} finished in {thread}" | Normal |
| Agent run failed | "❌ {agentName} failed: {error snippet}" | High |
| Approval requested | "🔒 {agentName} needs approval in {thread}" | High |
| Budget threshold hit | "💰 Thread '{title}' hit 80% budget" | Normal |
| Mention / direct message | "💬 {agentName}: {preview}" | High |

**Rules:**
- Suppress notifications while app is foregrounded
- Quiet hours: respect device DND settings (no custom quiet hours in MVP)
- Tap notification → deep link to specific thread + message
- Badge count = unread threads with pending actions (approvals, errors)

**Phase 2:** Move to native APNs/FCM for reliability. Add per-thread notification overrides (mute, digest mode).

---

## Infrastructure — What Already Exists

| Component | Location | Status |
|---|---|---|
| mem0 + Qdrant | Studio 1 (`100.93.134.22:6333`) | Running, 333+ memories |
| Nemotron MLX | Both Studios, 57 tok/s, $0 | Running |
| OpenClaw gateway | Overseer (`100.102.5.72:18789`) | Running |
| Tailscale mesh | 5 Macs (MBP + 2 Minis + 2 Studios) | Running |
| Embeddings | OpenAI `text-embedding-3-small` | API key active |
| Mission Control | Supabase (`taikjadzcsbutmxqxcqv`) | Running |

**New infrastructure needed:**
- Postgres database (Supabase or local) for Prisma
- Node.js WebSocket server (runs on Overseer alongside OpenClaw gateway)
- Expo dev build on Robin's iPhone

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Mobile | Expo (React Native) | Fast iteration, push notifications built-in, no Xcode/Gradle pain |
| Server | Node.js + Express + ws | Same runtime as OpenClaw, minimal operational overhead |
| ORM | Prisma | Type-safe, migration-friendly, excellent DX |
| Database | PostgreSQL | Relational data with JSON support for metadata |
| Local cache | Expo SQLite | Offline message queue, thread list cache |
| State mgmt | Zustand | Lightweight, no boilerplate, good for real-time updates |
| Memory | mem0 + Qdrant | Already running, proven |
| Embeddings | OpenAI text-embedding-3-small | Fast, cheap, good quality |
| Protocol | WebSocket (JSON) | Bidirectional, well-supported, no broker needed |
| Push | Expo Push Notifications | Zero native config for MVP |

---

## Timeline

### Day 1 — Foundation
- [ ] Prisma schema finalized + initial migration
- [ ] Node.js WebSocket server skeleton (connect, auth, basic event routing)
- [ ] Expo project scaffolded (navigation, basic screens)
- [ ] WebSocket event type definitions as shared TypeScript package

### Day 2 — Chat Core
- [ ] Thread list screen (fetch from server, display, create new)
- [ ] Thread detail screen (message list, text input, send)
- [ ] OpenClaw WebSocket bridge (forward user messages → OpenClaw, relay responses → client)
- [ ] Collapsible tool output (display_type: COLLAPSED for tool messages)
- [ ] **Milestone: Send a message from phone → agent responds → see it on screen**

### Day 3 — Memory
- [ ] Memory retrieval on agent response (query mem0, score, filter)
- [ ] Memory chip UI component (pill, tap to expand, inline detail)
- [ ] Memory edit (long-press → inline edit → save to mem0 + re-index)
- [ ] Memory pin/forget actions
- [ ] Provenance display (source, timestamp, relevance)

### Day 4 — Agents + Cost
- [ ] Agent status bar component (active agent, current action, elapsed time)
- [ ] Sub-agent list (drawer or expandable section)
- [ ] Cost entry recording (per-message, per-run)
- [ ] Cost display (per-thread cumulative, per-message badges)
- [ ] Error states (agent failure indicator, retry button)

### Day 5 — Polish + Dogfood
- [ ] Auth flow (Tailscale identity → JWT)
- [ ] Push notifications (Expo Push for agent completion, errors, approvals)
- [ ] Reconnect/sync logic (backfill missed events)
- [ ] Local SQLite cache for offline thread list
- [ ] Bug fixes from first real usage
- [ ] **Milestone: Robin uses ClawChat as primary agent interface**

### Week 2+ — Iterate on Real Usage
- Thread search (full-text across messages and memories)
- Smart folds (auto-collapse old tool output groups)
- Sub-agent drawer improvements (kill/restart from phone)
- Memory categories and scoped memory packs
- Telegram bridge as secondary channel (keep working for fallback)
- Notification refinements (per-thread mute, digest mode)

### Month 2+ — Expand
- Thread branching (fork with context inheritance)
- Multi-user auth (workspaces, roles, permissions)
- Slack bridge
- Artifact inspector (files, diffs, screenshots as first-class objects)
- Search improvements (filter by agent, date, type)
- Export/import

### Month 3+ — OSS Prep
- Apache 2.0 license
- Documentation site
- Self-hosting guide
- Protocol specification
- Community contribution guidelines
- Knowledge graph (only if memory density justifies it)

---

## Success Criteria

**Day 5 (internal MVP):**
- Robin can send a message, receive an agent response, and see memory chips — from phone
- Agent status and cost are visible per-thread
- WebSocket reconnects gracefully after network drop
- At least one full workstream completed through ClawChat instead of Telegram

**Week 2 (daily driver):**
- Telegram is secondary, ClawChat is primary for all agent work
- Memory edits from phone propagate correctly to mem0
- No data loss from disconnects or app backgrounding
- Sub-agent visibility shows the full tree (parent → children)

**Month 2 (team-ready):**
- Second user can onboard without Robin's help
- Thread search works across all history
- Cost tracking matches actual billing within 10%

---

## Open Questions

1. **Expo vs bare React Native?** Expo simplifies push and dev builds, but limits native module access. Start with Expo, eject only if blocked.
2. **Postgres hosting?** Supabase (already have account) vs local on Overseer. Supabase is easier but adds external dependency.
3. **Token streaming granularity?** Stream every token via `message.delta` or batch every ~100ms? Batching reduces WebSocket chatter.
4. **Memory compression?** The v1 doc's "45x compression" claim is unvalidated. For MVP, store raw memories and retrieve with vector search. Compress later based on actual usage patterns.
5. **Shared TypeScript types?** Monorepo with shared `@clawchat/types` package, or duplicate types in client/server? Monorepo is cleaner but adds build complexity.
