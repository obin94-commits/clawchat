// Shared types for ClawChat

export type ThreadId = string;
export type MessageId = string;
export type AgentId = string;

export interface Thread {
  id: ThreadId;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: MessageId;
  threadId: ThreadId;
  content: string;
  // MessageType includes regular and ghost types
  type: MessageType;
  sender: AgentId | null; // null for system messages
  timestamp: Date;
  // Optional fields for ghost messages
  agentId?: AgentId;
  progress?: number; // 0-100 for agent_progress
  cost?: number; // for cost_incurred
  memoryUpdated?: boolean; // for memory_updated
  memorySearched?: boolean; // for memory_searched
}

export type MessageType = 
  | 'regular'
  | 'agent_started'
  | 'agent_completed'
  | 'agent_failed'
  | 'agent_progress'
  | 'memory_updated'
  | 'memory_searched'
  | 'cost_incurred';

export interface Agent {
  id: AgentId;
  name: string;
  type: string; // e.g., 'forge', 'server'
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

// WebSocket events (from vision doc — all 13 event types)
// We'll define a generic event structure; specific events can be extended.
export interface WebSocketEvent {
  event: string;
  data: any;
}

// Example specific events (we can expand as needed)
export interface ThreadListEvent extends WebSocketEvent {
  event: 'thread_list';
  data: { threads: Thread[] };
}

export interface ThreadCreatedEvent extends WebSocketEvent {
  event: 'thread_created';
  data: { thread: Thread };
}

export interface MessageSentEvent extends WebSocketEvent {
  event: 'message_sent';
  data: { message: Message };
}

export interface ThreadJoinedEvent extends WebSocketEvent {
  event: 'thread_joined';
  data: { threadId: ThreadId };
}

// Export all
export type { Thread, Message, Agent, MemoryChip, CostEntry };
