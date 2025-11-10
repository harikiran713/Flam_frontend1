# Architecture Overview

## Data Flow Diagram

```
┌──────────────┐       ┌────────────────┐       ┌──────────────────┐
│ Pointer/Touch │──────▶│  CanvasManager │──────▶│ WebSocketClient  │
└──────────────┘       └────────────────┘       └──────┬───────────┘
                                                        │ Socket.IO emit
                                                        ▼
                                                 ┌───────────────┐
                                                 │   Server.js    │
                                                 │ (Socket.IO)    │
                                                 └──────┬─────────┘
                                                        │
                   ┌──────────────────────┬─────────────┴──────────────┐
                   │                      │                            │
                   ▼                      ▼                            ▼
          ┌────────────────┐    ┌────────────────────┐        ┌────────────────┐
          │ RoomManager    │    │ DrawingStateManager │        │ Other Clients │
          │ track users    │    │ persist operations  │        │ (Socket.IO)   │
          └────────────────┘    └────────────────────┘        └──────┬────────┘
                                                                      │ Socket.IO broadcast
                                                                      ▼
                                                             ┌────────────────┐
                                                             │ CanvasManager  │
                                                             └────────────────┘
```

1. User interactions on the drawing canvas raise local callbacks in `CanvasManager`.
2. `CanvasManager` notifies `WebSocketClient`, which throttles high-frequency events and emits Socket.IO messages tagged with the active room.
3. `server/server.js` handles each message, coordinates membership via `RoomManager`, and mutates room state via `DrawingStateManager`.
4. The server re-broadcasts authoritative updates to all sockets in the room; peers merge them into their local canvases.

## WebSocket Protocol

| Event            | Direction              | Payload Highlights                                                                 | Purpose                                                         |
|------------------|------------------------|-------------------------------------------------------------------------------------|-----------------------------------------------------------------|
| `join-room`      | client ➜ server        | `{ roomId, userName }`                                                              | Request to enter a room (ID may be client-generated).           |
| `joined`         | server ➜ client        | `{ userId, userName, color, roomId }`                                               | Confirms join, assigns authoritative user identity and color.   |
| `canvas-state`   | server ➜ client        | `[operation]` array with `{ id, tool, color, strokeWidth, points[] }`              | Sends full replay of persisted strokes to newly joined client.  |
| `user-joined`    | server ➜ room          | `{ userId, userName, color }`                                                       | Announces a new peer to existing clients.                       |
| `users-list`     | bidirectional broadcast| `[{ userId, userName, color }]`                                                     | Keeps sidebar roster synchronized after joins/leaves.           |
| `draw-start`     | bidirectional broadcast| `{ roomId, operationId, x, y, color, strokeWidth, tool }`                           | Starts a stroke; server persists via `startDraw` and relays.    |
| `draw-move`      | bidirectional broadcast| `{ roomId, operationId, x, y }`                                                     | Adds points to an active stroke (throttled on the client).      |
| `draw-end`       | bidirectional broadcast| `{ roomId, operationId }`                                                           | Finalizes stroke timeline and stops replay buffering.           |
| `cursor-move`    | bidirectional broadcast| `{ roomId, x, y }` + server metadata `{ userId, userName, userColor }`              | Shares pointer ghost positions at a lower frequency.            |
| `undo`           | bidirectional broadcast| `{ roomId }` ➜ `{ operationId, userId, userName }`                                  | Pops last operation globally, replays canvas without it.        |
| `redo`           | bidirectional broadcast| `{ roomId }` ➜ `{ operationId, userId, userName }` (operation replay handled client-side)| Reapplies the most recently undone stroke.                 |
| `user-left`      | server ➜ room          | `{ userId, userName }`                                                              | Removes departing member and their cursor ghost.                |

All protocol messages are namespace-scoped by `roomId`; the server rejects or ignores events from sockets lacking membership context.

## Undo/Redo Strategy

- **Authoritative state**: `DrawingStateManager` keeps per-room arrays of committed `operations`, plus `undoStack` and `redoStack`. Each Socket.IO undo pops the latest operation from `operations`, pushes it to `undoStack`, and broadcasts an `undo` message containing the removed `operationId`.
- **Client reconciliation**: `CanvasManager` mirrors these stacks locally. When it receives `undo`, it deletes the operation from its map and calls `redrawAll()` to re-render the remaining strokes in order.
- **Redo flow**: A redo request pulls the latest operation from the server-side `undoStack`, re-appends it to `operations`, and broadcasts `redo`. The client then rehydrates the stroke from its local redo stack (or from a full `canvas-state` replay on reconnect).
- **Global semantics**: Undo/redo operate on the shared timeline, not per-user history. Any user can trigger undo/redo, and the change affects the room atomically because the server serializes these stack mutations.

## Performance Decisions

- **Event throttling**: `WebSocketClient` throttles `draw-move` to ~60 fps and `cursor-move` to 10 fps, cutting message volume while preserving smooth visuals.
- **Incremental rendering**: `CanvasManager` draws strokes incrementally (point interpolation + line segments) instead of redrawing the entire canvas for each move. Full `redrawAll()` is reserved for state resets (resize, undo).
- **Canvas sizing**: Canvas dimensions track the container via resize observers, ensuring resolution matches display size without per-frame scaling.
- **Optimistic UI**: Local strokes render immediately before the server round-trip, using unique `operationId`s so server echoes merge seamlessly.
- **Stateless HTTP serving**: Express simply serves static assets; all real-time load stays on the Socket.IO channel, simplifying horizontal scaling strategies.

## Conflict Resolution

- **Operation ordering**: Each stroke has a UUID and timestamps (`startTime`, per-point timestamps). `DrawingStateManager` appends operations in the order the server receives `draw-start`, defining the canonical timeline.
- **Idempotency guards**: Clients ignore echoed events where `userId` matches their own, avoiding duplicate rendering of local strokes.
- **Last-writer wins**: If simultaneous undo/redo or draw events arrive, the server's single-threaded event loop applies them sequentially; later events see the updated stacks and either succeed or become no-ops (e.g., undo when stack empty).
- **State reconciliation**: On join or reconnect, clients receive the authoritative `canvas-state` array to resynchronize after any missed real-time events. Additional helper `getOperationsAfter(timestamp)` enables future diff-based sync if needed.


