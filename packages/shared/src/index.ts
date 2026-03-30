export type ThreadId = string;
export type MessageId = string;
export type AgentId = string;

export interface Thread {
  id: ThreadId;
  title: string;
  parentThreadId?: string | null;
  branchedFromMessageId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageRole = 'USER' | 'AGENT' | 'SYSTEM' | 'TOOL';
export type DisplayType = 'VISIBLE' | 'COLLAPSED' | 'HIDDEN' | 'GHOST';

export type MessageType =
  | 'regular'
  | 'agent_started'
  | 'agent_completed'
  | 'agent_failed'
  | 'agent_progress'
  | 'memory_updated'
  | 'memory_searched'
  | 'cost_incurred';

export interface Message {
  id: MessageId;
  threadId: ThreadId;
  role: MessageRole;
  content: string;
  displayType: DisplayType;
  metadata?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * GhostMessage — ephemeral in-flight message shown at opacity 0.5 / fontSize 12
 * while waiting for server confirmation.
 */
export interface GhostMessage {
  localId: string;
  threadId: ThreadId;
  role: MessageRole;
  content: string;
  displayType: 'VISIBLE';
  createdAt: string;
}

export interface Agent {
  id: AgentId;
  name: string;
  type: string;
}

export interface AgentRunInfo {
  runId: string;
  agentName: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  lastAction?: string;
  cost: number;
  tokens: number;
}

/** In-flight chip from WS memory_chip event (has similarity score) */
export interface MemoryChip {
  id: string;
  content: string;
  score: number;
  category?: string;
  pinned?: boolean;
  createdAt?: Date;
}

/** Persisted memory chip stored in the DB */
export interface PersistedMemoryChip {
  id: string;
  threadId: string;
  text: string;
  metadata?: string | null;
  pinned: boolean;
  createdAt: string;
}

export interface CostEntry {
  id: string;
  amount: number;
  currency: string;
  timestamp: Date;
  description?: string;
}

export type WsClientEvent =
  | { type: 'subscribe'; threadId: string }
  | { type: 'send_message'; threadId: string; content: string; messageType?: MessageType }
  | { type: 'thread.navigate'; threadId: string };

export type WsServerEvent =
  | { type: 'message'; message: Message }
  | { type: 'message.new'; threadId: string; payload: { message: Message } }
  | { type: 'subscribed'; threadId: string }
  | { type: 'error'; error: string }
  | { type: 'agent_activity'; ghostMessage: GhostMessage }
  | { type: 'memory_chip'; threadId: string; chip: MemoryChip }
  | { type: 'memory_chip.saved'; threadId: string; chip: PersistedMemoryChip }
  | { type: 'agent_started'; threadId: string; agentName: string; runId: string }
  | { type: 'agent_progress'; threadId: string; agentName: string; runId: string; action: string }
  | { type: 'agent_completed'; threadId: string; agentName: string; runId: string }
  | { type: 'agent_failed'; threadId: string; agentName: string; runId: string; error: string }
  | { type: 'cost_incurred'; threadId: string; cost: number; tokens?: number; agentName?: string; runId?: string }
  | { type: 'thread.branch'; parentThreadId: string; childThread: Thread; branchedFromMessageId: string };
