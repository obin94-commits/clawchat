export type ThreadId = string;
export type MessageId = string;
export type AgentId = string;

export interface Thread {
  id: ThreadId;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageRole = 'USER' | 'AGENT' | 'SYSTEM' | 'TOOL';
export type DisplayType = 'VISIBLE' | 'COLLAPSED' | 'HIDDEN';

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

export interface MemoryChip {
  id: string;
  content: string;
  createdAt: Date;
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
  | { type: 'send_message'; threadId: string; content: string; messageType?: MessageType };

export type WsServerEvent =
  | { type: 'message'; message: Message }
  | { type: 'subscribed'; threadId: string }
  | { type: 'error'; error: string }
  | { type: 'agent_activity'; ghostMessage: GhostMessage };

