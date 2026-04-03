# QA Bug Report — Computer Use Testing (2026-04-03)

## P0 — Blocking

### BUG-1: Send button doesn't work ✅ FIXED
- Voice feature overwrote onPress with onPressIn
- Fixed in commit 8b231cb

### BUG-2: New Thread modal didn't show on web ✅ FIXED  
- RN Modal z-index broken on web
- Fixed in commit 2040d11 (replaced with absolute overlay)

### BUG-3: WebSocket connection fails through Cloudflare
- Red dot in header = disconnected
- WS upgrade gets 401 from auth middleware
- Client doesn't send auth token in WS connection
- Messages work via HTTP fallback but no real-time updates
- **Fix needed:** Pass API key as query param in WS URL: `ws://host?token=KEY`

### BUG-4: Messages ordered newest-first (wrong)
- Server returns DESC, client displays as-is
- Should be oldest first (ASC) in chat view
- **Fix needed:** Reverse message array after fetch, or change server to ASC

## P1 — Should Fix

### BUG-5: Thread list doesn't auto-refresh
- Creating a thread via FAB should show it in the list
- Currently needs manual page reload
- **Fix needed:** After create, either refetch list or add to local state (code does this but navigation may interrupt)

### BUG-6: No back navigation after creating thread
- After thread creation, navigates to detail but back button may not work on web
- Need to test

### BUG-7: Agent status bar says "idle" always
- No live agent connected via bridge
- Bridge relay broken (session.input needs admin scope)
- This is a bridge issue, not UI

### BUG-8: Cost shows $0.000 always
- No cost events flowing because bridge is broken
- UI component works, just no data

### BUG-9: WS red dot should show more context
- Just a red dot with no tooltip/explanation
- User doesn't know what it means

## P2 — Polish

### BUG-10: Memory link ("mem") has no functionality on web
- Clicking "mem" does nothing visible
- Need to implement memory panel or remove the link

### BUG-11: No loading state when entering thread
- Thread detail shows empty then messages pop in
- Should show a spinner/skeleton

### BUG-12: Search bar only filters thread titles locally  
- The global search API exists but isn't wired to the UI properly
