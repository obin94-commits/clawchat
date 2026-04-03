// OpenClaw channel plugin for ClawChat
// Provides a bridge between OpenClaw sessions and ClawChat threads.

import WebSocket from "ws";

export interface ClawChatChannelConfig {
  serverUrl: string;
  apiKey?: string;
  defaultThreadId?: string;
  autoCreateThread?: boolean;
}

export interface ChannelMessage {
  content: string;
  role: string;
  threadId?: string;
  displayType?: string;
}

export class ClawChatChannel {
  private serverUrl: string;
  private apiKey?: string;
  private defaultThreadId: string;
  private autoCreateThread: boolean;
  private instanceId =
    "ClawChatChannel(" + Math.random().toString(36).substr(2, 5) + ")";

  private ws: WebSocket | null = null;
  private wsUrl: string | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelayMs = 1000;
  private maxReconnectDelayMs = 60000;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private subscribed = false;
  private seenMessageIds = new Set<string>();

  private onUserMessageCallback?: (message: {
    content: string;
    threadId: string;
  }) => void;

  constructor(config: ClawChatChannelConfig) {
    this.serverUrl = config.serverUrl;
    this.apiKey = config.apiKey;
    this.defaultThreadId = config.defaultThreadId ?? "main";
    this.autoCreateThread = config.autoCreateThread ?? false;
  }

  setOnUserMessageCallback(
    callback: (message: { content: string; threadId: string }) => void,
  ): void {
    this.onUserMessageCallback = callback;
  }

  async connect(): Promise<void> {
    if (this.wsUrl) {
      return;
    }
    const httpUrl = this.serverUrl
      .replace(/^http:\/\//, "ws://")
      .replace(/^https:\/\//, "wss://");
    this.wsUrl = `${httpUrl}/ws?token=${this.apiKey || ""}`;
    this.reconnect();
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.subscribed = false;
  }

  private reconnect(): void {
    if (this.wsUrl === null) {
      return;
    }
    console.log(`[${this.instanceId}] Connecting to ${this.wsUrl}...`);
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on("open", () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelayMs = 1000;
      console.log(`[${this.instanceId}] Connected to ClawChat server`);
      this.subscribeToThread();
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleWsMessage(message);
      } catch (err) {
        console.error(`[${this.instanceId}] Failed to parse WS message:`, err);
      }
    });

    this.ws.on("error", (err: Error) => {
      console.error(`[${this.instanceId}] WebSocket error:`, err.message);
      this.connected = false;
    });

    this.ws.on("close", () => {
      this.connected = false;
      this.subscribed = false;
      console.log(`[${this.instanceId}] WebSocket closed`);
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(
          `[${this.instanceId}] Reconnecting in ${this.reconnectDelayMs / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
        );
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectDelayMs = Math.min(
            this.reconnectDelayMs * 2,
            this.maxReconnectDelayMs,
          );
          this.reconnect();
        }, this.reconnectDelayMs);
      } else {
        console.error(`[${this.instanceId}] Max reconnection attempts reached`);
      }
    });
  }

  private subscribeToThread(): void {
    if (!this.connected || this.subscribed) {
      return;
    }
    const subscribeMsg = {
      type: "subscribe",
      threadId: this.defaultThreadId,
    };
    this.ws?.send(JSON.stringify(subscribeMsg));
    this.subscribed = true;
    console.log(
      `[${this.instanceId}] Subscribed to thread: ${this.defaultThreadId}`,
    );
  }

  private handleWsMessage(message: any): void {
    if (message.type === "message" && message.data) {
      const msgData = message.data;
      const msgId = msgData.id || msgData.messageId;
      if (msgId && this.seenMessageIds.has(msgId)) {
        return;
      }
      if (msgId) {
        this.seenMessageIds.add(msgId);
      }
      if (msgData.role === "USER") {
        console.log(
          `[${this.instanceId}] Received USER message:`,
          msgData.content,
        );
        if (this.onUserMessageCallback) {
          this.onUserMessageCallback({
            content: msgData.content,
            threadId: msgData.threadId || this.defaultThreadId,
          });
        }
      }
    } else if (message.type === "subscribe" && message.error) {
      console.error(`[${this.instanceId}] Subscription error:`, message.error);
      if (this.autoCreateThread && message.error.code === "THREAD_NOT_FOUND") {
        this.createThread().then(() => {
          this.subscribeToThread();
        });
      }
    }
  }

  private async createThread(): Promise<void> {
    const headers: any = { "Content-Type": "application/json" };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    try {
      await fetch(`${this.serverUrl}/threads`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "OpenClaw Channel",
          id: this.defaultThreadId,
        }),
      });
      console.log(
        `[${this.instanceId}] Created thread: ${this.defaultThreadId}`,
      );
    } catch (err) {
      console.error(`[${this.instanceId}] Failed to create thread:`, err);
    }
  }

  async onOpenClawMessage(message: ChannelMessage): Promise<void> {
    const threadId = message.threadId || this.defaultThreadId;
    const payload = {
      content: message.content,
      role: message.role,
      displayType: message.displayType || "VISIBLE",
    };
    await this.postToClawChat(threadId, payload);
  }

  async onClawChatMessage(message: {
    content: string;
    threadId: string;
  }): Promise<void> {
    if (this.onUserMessageCallback) {
      this.onUserMessageCallback(message);
    } else {
      console.log(`[${this.instanceId}] No callback set for user message`);
    }
  }

  private async postToClawChat(threadId: string, body: any): Promise<void> {
    const headers: any = { "Content-Type": "application/json" };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    try {
      await fetch(`${this.serverUrl}/threads/${threadId}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      console.log(`[${this.instanceId}] Posted message to thread ${threadId}`);
    } catch (err) {
      console.error(`[${this.instanceId}] Failed to post message:`, err);
      throw err;
    }
  }

  getConnectedStatus(): boolean {
    return this.connected;
  }
}
