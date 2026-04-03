# ClawChat OpenClaw Channel Plugin

This plugin allows OpenClaw to act as a client of ClawChat, treating it as a messaging channel. It provides bidirectional communication between OpenClaw sessions and ClawChat threads.

## Features

- **WebSocket-based real-time messaging**: Connects to ClawChat server via WebSocket for live message streaming
- **Automatic reconnection**: Exponential backoff reconnection with configurable max attempts
- **Thread subscription**: Automatically subscribes to a configured thread and listens for new messages
- **Bidirectional message forwarding**:
  - USER messages from ClawChat → forwarded to OpenClaw session
  - AGENT output from OpenClaw → posted to ClawChat thread
- **Auto thread creation**: Optionally creates the default thread if it doesn't exist

## Installation

1. Install dependencies:

```bash
cd packages/channel-openclaw
pnpm install
```

2. Build the plugin:

```bash
pnpm build
```

## Configuration

Add channel configuration to your `openclaw.json`:

```json
{
  "chats": [],
  "channels": {
    "clawchat": {
      "enabled": true,
      "serverUrl": "http://localhost:3001",
      "apiKey": "YOUR_API_KEY",
      "defaultThreadId": "main",
      "autoCreateThread": false
    }
  }
}
```

### Configuration Options

| Option | Type | Description |
`serverUrl` | string (required) | URL of the ClawChat server (e.g., `http://localhost:3001`) |
| `apiKey` | string (optional) | API key for authentication (same as `CLAWCHAT_API_KEY` used by the bridge) |
| `defaultThreadId` | string (optional) | ID of the thread to subscribe to (default: `"main"`) |
| `autoCreateThread` | boolean (optional) | Automatically create the default thread if it doesn't exist (default: `false`) |

## Usage

### Basic Usage

```typescript
import { ClawChatChannel } from "@clawchat/openclaw-channel";

const channel = new ClawChatChannel({
  serverUrl: "http://localhost:3001",
  apiKey: "your-api-key",
  defaultThreadId: "main",
});

// Set callback for incoming USER messages from ClawChat
channel.setOnUserMessageCallback((message) => {
  console.log("Received user message:", message.content);
  // Forward to OpenClaw session here
});

// Connect to ClawChat server
await channel.connect();

// Post a message to ClawChat (e.g., OpenClaw's response)
await channel.onOpenClawMessage({
  content: "Hello from OpenClaw!",
  role: "AGENT",
  displayType: "VISIBLE",
});

// Disconnect when done
channel.disconnect();
```

### Integration with OpenClaw Session

```typescript
const channel = new ClawChatChannel({
  serverUrl: "http://localhost:3001",
  apiKey: "your-api-key",
  defaultThreadId: "my-thread",
  autoCreateThread: true,
});

// Set up message forwarding to OpenClaw
channel.setOnUserMessageCallback((message) => {
  // Forward user message to OpenClaw session
  // This depends on your OpenClaw session management
  // Example: session.input({ content: message.content, role: 'user' })
});

await channel.connect();

// When OpenClaw produces output, post it to ClawChat
async function handleOpenClawOutput(content: string) {
  await channel.onOpenClawMessage({
    content,
    role: "AGENT",
    displayType: "VISIBLE",
  });
}
```

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   User      │         │  ClawChat    │         │   OpenClaw  │
│ (ClawChat)  │────────▶│   Server     │◀───────▶│   Session   │
└─────────────┘         └──────────────┘         └─────────────┘
                            │  ▲
                            │  │ WebSocket
                            │  │ (real-time)
                            ▼  │
┌─────────────┐         ┌──────────────┐
│   User      │◀────────│  ClawChat    │
│ (OpenClaw)  │  REST   │   Channel    │
└─────────────┘         └──────────────┘
```

### Message Flow

1. **User → OpenClaw**: USER messages from ClawChat are forwarded to the OpenClaw session via the `onUserMessageCallback`
2. **OpenClaw → User**: OpenClaw's output is posted to the ClawChat thread as an AGENT message

## Reconnection Behavior

The plugin automatically handles reconnection with exponential backoff:

- Initial delay: 1 second
- Max delay: 60 seconds
- Max attempts: 10
- Backoff multiplier: 2x

## API Reference

### `ClawChatChannel`

#### Constructor

```typescript
new ClawChatChannel(config: {
  serverUrl: string;
  apiKey?: string;
  defaultThreadId?: string;
  autoCreateThread?: boolean;
})
```

#### Methods

| Method | Description |
`connect()` | Connect to the ClawChat server and subscribe to the thread |
| `disconnect()` | Disconnect from the server and clean up resources |
| `setOnUserMessageCallback(callback)` | Set callback for incoming USER messages |
| `onOpenClawMessage(message)` | Post a message to the ClawChat thread |
| `onClawChatMessage(message)` | Handle incoming ClawChat messages (calls the callback) |
| `getConnectedStatus()` | Check if currently connected |

## Troubleshooting

### Connection Issues

- Ensure the ClawChat server is running and accessible
- Verify the `serverUrl` is correct (use `http://` for local, `https://` for production)
- Check that the `apiKey` is valid and matches the server's configuration

### Thread Not Found

- If you get a "thread not found" error, either:
  - Pre-create the thread via the ClawChat UI or API
  - Set `autoCreateThread: true` in the configuration

### Messages Not Appearing

- Check the console logs for connection status
- Verify the `defaultThreadId` matches an existing thread
- Ensure the WebSocket connection is established (look for "Connected to ClawChat server" log)

## License

MIT
