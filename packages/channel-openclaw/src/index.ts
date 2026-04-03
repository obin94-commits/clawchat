// OpenClaw channel plugin for ClawChat
// Provides a bridge between OpenClaw sessions and ClawChat threads.

export class ClawChatChannel {
  private serverUrl: string;
  private apiKey?: string;
  private defaultThreadId: string;
  private instanceId = 'ClawChatChannel(' + Math.random().toString(36).substr(2, 5) + ')';

  constructor(config: { serverUrl: string; apiKey?: string; defaultThreadId?: string }) {
    this.serverUrl = config.serverUrl;
    this.apiKey = config.apiKey;
    this.defaultThreadId = config.defaultThreadId ?? 'main';
  }

  async onOpenClawMessage(message: { content: string; role: string; threadId?: string; displayType?: string }) {
    const threadId = message.threadId || this.defaultThreadId;
    const payload = { content: message.content, role: message.role };
    await this.postToClawChat(threadId, payload);
  }

  async onClawChatMessage(message: { content: string; threadId: string }) {
    // Forward to the current OpenClaw session (if any)
    // In a real plugin, integrate with OpenClaw's session management.
    console.log('[ClawChatChannel] Forwarding to OpenClaw:', message.content);
  }

  private async postToClawChat(threadId: string, body: any) {
    const headers: any = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    await fetch(`${this.serverUrl}/threads/${threadId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }
}
