# Changelog

All notable changes to ClawChat are documented in this file.

## [Unreleased]

### Added

- OpenClaw channel plugin (`packages/channel-openclaw`) — fully functional plugin allowing any OpenClaw instance to add ClawChat as a native channel
- Thread rename functionality via PATCH `/threads/:id`
- Improved empty state UI in thread list
- Message timestamps displayed in thread detail view

### Fixed

- Various P0/P1 bugs identified in code review
- TypeScript type issues across packages
- Memory chip metadata handling edge cases

---

## [1.0.0] - 2026-04-03

### Phase 9: OpenClaw Channel Plugin

**feat**: Functional OpenClaw channel plugin

- Complete `packages/channel-openclaw` implementation
- Plugin follows OpenClaw channel interface
- Bidirectional message relay
- Automatic thread creation for new sessions
- Memory chip synchronization
- Cost tracking integration
- Sub-agent event forwarding
- Multi-agent support via plugin configuration

**Files**: `packages/channel-openclaw/src/index.ts` (~400 lines)

---

## [0.9.0] - 2026-04-02

### Phase 8: Polish & Improvements

**feat**: Thread rename functionality

- PATCH `/threads/:id` endpoint with `title` field
- Client UI for renaming threads in thread list
- Real-time title updates via WebSocket

**feat**: Improved empty state

- Better placeholder UI when no threads exist
- "Create first thread" call-to-action
- Helpful onboarding text

**feat**: Message timestamps

- Display formatted timestamps in thread detail
- Relative time ("2 hours ago") with absolute on hover
- Consistent formatting across platforms

**fix**: Code review P0/P1 issues

- Fixed null pointer issues in bridge-openclaw
- Improved error handling in WebSocket handlers
- Better type safety in shared types
- Fixed memory chip metadata parsing edge cases

**Author**: Qwen-Opus via OpenCode ($0)

---

## [0.8.0] - 2026-04-01

### Phase 5: Bridge Auth Fix + Plugin Skeleton

**fix**: Bridge authentication

- Fixed bridge-openclaw to respect `CLAWCHAT_API_KEY`
- Added proper Bearer token handling in HTTP requests
- Fixed WebSocket auth to support both header and query param

**feat**: OpenClaw channel plugin skeleton

- Created `packages/channel-openclaw` package
- Basic plugin structure following OpenClaw interface
- Stub implementations for all required methods
- Configuration schema definition

---

## [0.7.0] - 2026-03-31

### Phase 3: Bridge Integration

**feat**: Full bidirectional bridge

- ClawChat user messages → OpenClaw sessions via `session.input` RPC
- OpenClaw chat history → ClawChat messages via `chat.history` RPC
- Live event forwarding via WebSocket event stream

**feat**: Sub-agent event forwarding

- `subagent_started` → `agent_started: <name>` message
- `subagent_completed` → `agent_completed: <name> — <result>` message
- `subagent_failed` → `agent_failed: <name> — <error>` message
- Proper runId tracking per sub-agent

**feat**: Memory chip auto-creation

- Detect memory file writes from OpenClaw tool events
- Auto-create memory chips from `MEMORY.md` writes
- Preserves content snapshot and provenance

**feat**: Cost event passthrough

- Parse `usage`/`cost`/`token_usage` events from OpenClaw
- Extract inputTokens, outputTokens, costUsd
- Create CostEntry via ClawChat API
- Update agent status bar in real-time

**feat**: Multi-agent routing

- `OPENCLAW_AGENTS` JSON config for multiple agents
- Thread routing via title prefix `[AgentName]` or `@agentname`
- Per-agent WebSocket connections
- Per-agent session management

**fix**: seenIds scoped per-thread

- Fixed bug where seenIds was a single Set shared across all threads
- Now `Map<threadId, Set<messageId>>`
- Prevents message deduplication bugs

**fix**: Error handling in WS handlers

- All message handlers wrapped in try-catch
- Proper error logging with context
- Graceful degradation on RPC failures

**Files**: `packages/bridge-openclaw/src/index.ts` (~960 lines)

---

## [0.6.0] - 2026-03-30

### Phase 2: Client Polish

**feat**: Dark mode default

- Dark theme as default theme
- Proper dark colors for all components
- Improved contrast ratios

**feat**: Markdown rendering

- Integrated `react-native-markdown-display`
- Code blocks with syntax highlighting
- Basic markdown: bold, italic, links, code spans

**feat**: Settings screen

- Server URL configuration
- API key configuration
- Theme toggle (dark/light)
- Persistent settings via AsyncStorage

**feat**: UX improvements

- Better loading states
- Improved message input UI
- Thread list item styling
- Memory chip visual polish

**fix**: Web build configuration

- Fixed app.json for Expo web
- Proper babel/metro configuration
- Web build now works: `pnpm expo export --platform web`

---

## [0.5.0] - 2026-03-29

### Phase 1: Server Hardening

**fix**: runId generation

- Fixed `emitTypedEventFromSystemMessage` to generate runId via `crypto.randomUUID()`
- Previously was empty string, breaking agent tracking

**fix**: Memory service threadId usage

- Fixed `getRelevant` to actually use `threadId` parameter
- Was ignoring thread context, returning global memories

**feat**: Cursor-based pagination

- GET `/threads/:id/messages` now supports `?cursor=<id>&limit=N`
- Returns `{ messages, nextCursor }`
- Limit clamped to 50-200, default 50
- Order: newest first (DESC)

**feat**: Cost tracking wired

- GET `/threads/:id/cost/summary` returns aggregated stats
- Includes `byAgent` breakdown
- Proper token and cost summation

**feat**: Auth middleware

- Bearer token auth via `CLAWCHAT_API_KEY` env var
- Skips auth if env var not set (dev mode)
- Applies to all routes except `/health`
- Proper 401 responses with error codes

**feat**: Rate limiting

- 100 requests/minute per IP
- Standard rate limit headers
- 429 response with retry info

**feat**: Content validation

- Message content max 100KB (truncated)
- Proper role validation (USER|AGENT|SYSTEM|TOOL)
- Proper displayType validation (VISIBLE|GHOST|COLLAPSED|HIDDEN)
- Meaningful error messages with codes

**fix**: Error handling

- Global error handler with proper logging
- Timestamps on all log entries
- Context-aware error messages

---

## [0.4.0] - 2026-03-28

### Bridge OpenClaw: Protocol Fix

**fix**: OpenClaw WS connect protocol

- Fixed `connect` RPC to use proper protocol:
  ```json
  {
    "type": "req",
    "method": "connect",
    "params": {
      "minProtocol": 3,
      "maxProtocol": 3,
      "client": {
        "id": "cli",
        "version": "1.0.0",
        "platform": "node",
        "mode": "cli"
      },
      "auth": { "token": "..." }
    }
  }
  ```
- Previous implementation had wrong structure
- Verified against OpenClaw SPA bundle

**feat**: Proper RPC client

- Request/response tracking with Promise resolution
- Event streaming via `type: "event"` messages
- Sequence number tracking for event ordering
- Reconnection with exponential backoff
- Timeout handling (15s per RPC)

---

## [0.3.0] - 2026-03-27

### Telegram Bridge + QA Fixes

**fix**: Telegram bridge WS null guard

- Added null check before sending WS messages
- Prevents crashes on disconnected state

**fix**: Telegram bridge socket capture

- Properly captures socket reference for cleanup
- Fixes memory leak on reconnect

**fix**: Telegram bridge polling error handler

- Wraps polling in try-catch
- Logs errors without crashing bridge

**feat**: Telegram bridge

- Full bidirectional message relay
- Chat history polling
- User message forwarding to OpenClaw
- Event translation to ClawChat format

---

## [0.2.0] - 2026-03-26

### Day 6: OpenClaw WS-RPC Bridge + Thread Branching

**feat**: OpenClaw bridge (rewritten)

- WebSocket RPC protocol (verified)
- `connect`, `chat.history` RPCs
- Event streaming for live updates
- Proper reconnection logic
- Session-based message deduplication

**feat**: Thread branching

- POST `/threads/:id/branch` endpoint
- Creates child thread with `parentThreadId` and `branchedFromMessageId`
- `thread.branch` WebSocket event
- Optional title override
- Visual breadcrumb in UI (planned)

**feat**: Memory chips CRUD

- GET/POST/PATCH/DELETE `/threads/:id/memories`
- `chipToDto` helper for consistent serialization
- `pinned` field support
- Metadata as JSON string

**feat**: PostgreSQL migration

- Schema updated for Postgres
- Migrations working with `prisma migrate dev`
- SQLite still supported for local dev

**docs**: README updated

- Architecture diagram
- WebSocket event table
- OpenClaw bridge protocol documentation
- Progress tracker (Day 1-6)

**docs**: LICENSE added (Apache 2.0)

---

## [0.1.0] - 2026-03-25

### Day 5: Auth + Ghost Messages

**feat**: Tailscale auth middleware

- Bearer token auth (single-user MVP)
- Configurable via `CLAWCHAT_API_KEY`
- Dev mode when unset
- Skips auth for `/health`

**feat**: Ghost messages on connect/disconnect

- `agent_connected` ghost on WS subscribe
- `agent_disconnected` ghost on WS close
- Properly typed as SYSTEM/GHOST messages

**docs**: `.env.example` added

- Documented all required env vars
- Example values included

---

## [0.0.5] - 2026-03-24

### Day 4: Agent Status + Cost Tracking

**feat**: Agent lifecycle events

- `agent_started: <name>` → `agent_started` WS event
- `agent_completed: <name>` → `agent_completed` WS event
- `agent_failed: <name> - <error>` → `agent_failed` WS event
- `agent_progress: <name> - <action>` → `agent_progress` WS event
- All with proper runId tracking

**feat**: Cost tracking

- `cost_incurred: tokens=N, cost=X, agent=Y` parsing
- CostEntry model with `agentId`, `tokens`, `costUsd`
- GET `/threads/:id/cost` endpoint
- `cost_incurred` WS event broadcast

**feat**: SubAgentDrawer component

- Shows sub-agents in current thread
- Status, runtime, cost per sub-agent
- Expandable drawer UI

**feat**: AgentStatusBar updates

- Live agent state display
- Current action tracking
- Runtime display
- Cost/tokens display

---

## [0.0.4] - 2026-03-23

### Day 3: Memory Integration

**feat**: mem0 integration

- `MemoryService` class in server
- `addMemory`, `store`, `getRelevant`, `searchMemories` methods
- Qdrant vector search
- mem0 API integration

**feat**: Memory chips interactive

- MemoryChip component tappable
- Tap to expand memory details
- Shows relevance score
- Shows category and tags

**feat**: `/remember` command

- Parse `/remember <text>` from user messages
- Auto-create MemoryChip in DB
- Store in mem0 with `type: "explicit"`
- `memory_chip.saved` WS event

**feat**: OpenClaw bridge polling

- Poll `chat.history` every 3s
- Relay new messages to ClawChat
- Translate to proper roles/displayTypes
- Deduplication via `seenIds`

---

## [0.0.3] - 2026-03-22

### Day 2: Working Server + Client

**feat**: Working Express + WS server

- HTTP server on port 3001
- WebSocket upgrade handling
- Thread subscription model
- Broadcast to subscribed clients

**feat**: Prisma SQLite (local)

- In-memory SQLite for dev
- Thread, Message, MemoryChip, CostEntry models
- Migrations working

**feat**: REST endpoints

- GET/POST `/threads`
- GET/POST `/threads/:id/messages`
- GET/POST `/threads/:id/memories`
- GET/POST `/threads/:id/cost`
- GET `/memories?q=`

**feat**: WS events

- `subscribe`, `send_message` (client→server)
- `message.new`, `subscribed`, `error` (server→client)
- Proper JSON envelopes

**feat**: Expo client screens

- ThreadListScreen (thread list, create button)
- ThreadDetailScreen (messages, input)
- Basic navigation working

---

## [0.0.2] - 2026-03-21

### Day 1: Scaffolding

**feat**: pnpm monorepo

- Root `package.json` with workspaces
- `packages/server`, `packages/client`, `packages/shared`
- Shared TypeScript config

**feat**: Prisma schema

- Thread model (id, title, createdAt, updatedAt)
- Message model (id, threadId, role, content, displayType, metadata)
- MemoryChip model (id, threadId, text, metadata, pinned)
- CostEntry model (id, threadId, agentId, tokens, costUsd)

**feat**: Shared types

- TypeScript interfaces in `packages/shared`
- Thread, Message, MemoryChip, CostEntry types
- WsClientEvent, WsServerEvent types

**feat**: WS server skeleton

- Basic WebSocket server
- Ping/pong heartbeat
- Connection tracking

**feat**: Expo client skeleton

- Expo SDK 53
- Basic App.tsx
- Navigation setup

**feat**: OpenClaw bridge skeleton

- `packages/bridge-openclaw` created
- Basic structure in place

---

## [0.0.1] - 2026-03-20

### Initial Commit

**docs**: Vision v2 spec

- Full product specification
- 5 features in 5 days
- Data model design
- WebSocket event design
- Auth model
- Error handling patterns
- Push notification strategy
- Timeline and success criteria

**docs**: `.gitignore`

- node_modules, dist, db
- `.env` files
- Expo cache

---

## Pre-History

### Inspiration & Research

- Leaked Claude Code architecture analysis (Kairos, AutoDream, three-layer memory)
- Open WebUI competitive analysis (124K stars, UI polish matters)
- OpenClaw ecosystem integration planning
- Agent-native interface design principles

### Vision Document (v1)

Original vision document outlining the problem:

- Flat message streams fail for agent orchestration
- 210K tokens in single day, 198K was noise
- Need: threading, memory visibility, cost tracking, sub-agent awareness

---

## Notes

- All development done with AI assistance (Claude Code, Qwen-Opus via OpenCode)
- Total AI cost: $0 (local models via Nemotron MLX, Copia credits)
- Lines of code: ~2,900 (Day 6), growing with each phase
- Build philosophy: Internal tool first, OSS later
