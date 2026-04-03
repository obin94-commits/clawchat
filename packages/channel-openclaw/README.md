# ClawChat OpenClaw Channel Plugin

This plugin allows OpenClaw to act as a client of ClawChat, treating it as a messaging channel.

## Installation

1. Add the plugin to your OpenClaw workspace:

```bash
cd packages/channel-openclaw
npm install
```

2. Add `channel` configuration to your `openclaw.json`:

```json
{
  "chats": [],
  "channels": {
    "clawchat": {
      "enabled": true,
      "serverUrl": "http://localhost:3001",
      "apiKey": "YOUR_API_KEY",
      "defaultThreadId": "main"
    }
  }
}
```

3. Build the plugin:

```bash
npm run build
```

OpenClaw will load plugins from `packages`. Ensure the plugin's `dist` is published or placed in the correct location.

## Closing Notes

- Use `serverUrl` to point to the ClawChat server (default uses port 3001 with Unix socket `/var/run/clawchat.sock`).
- The `apiKey` is the same `CLAWCHAT_API_KEY` used by the bridge. The plugin forwards messages with `Authorization: Bearer <apiKey>`.
- The plugin polls ClawChat for new messages every few seconds; adjust polling if needed.

This is a minimal skeleton; you can extend it with better error handling, reconnection logic, and richer message handling.

## License

MIT
