# Chess Variant Scripting API

**Single Source of Truth** for the Rhai scripting interface.
All agents (Plan, Build, Sonnet) MUST reference this document when working on engine/script features.

The `api_version` field in the script's `config()` return value defines the
scripting API version the script targets. The engine validates this.

---

## 1. Script Functions

These are the functions the script MUST or MAY implement. The engine calls them.

### `config()`

```
() -> #{}
```

**Mandatory.** Returns the variant configuration map.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `api_version` | i32 | YES | Scripting API version this script targets |
| `name` | string | YES | Variant display name |
| `version` | string | YES | Variant script version |
| `colors` | [string] | YES | Player color identifiers (e.g. `["white","black"]`) |
| `allowed_player_count` | i32 | YES | Exact player count (simplest form: a single number). Also accepts `[i32]` for discrete values or `#{ min, max, step }` for a range. |
| `board` | #{type,rows,cols,count?,disabled_rects?} | YES | Board layout config |
| `check_protection` | bool | NO (default: false) | Enable check filtering in `engine_valid_actions` |
| `pieces` | #{} | NO | Custom piece definitions via `combine(type, type)` |
| `reserve_pile` | bool | NO (default: false) | Enable reserve pile |

### `init(player_count)`

```
(i32) -> #{}
```

**Mandatory.** Returns the initial game state map. Called once at engine construction.

The returned map must contain at least:

```rhai
#{
    board: BoardState,           // native — one board or array of boards
    players: [                   // one entry per player
        #{ board: i32, color: string, team: i32 },
        // ...
    ],
    active_players: [PlayerId],  // ordered turn queue
    game_over: (),               // () = not over
}
```

Variants may add any additional keys. The engine never modifies state keys except `game_over`.

### `on_move(state, player, from, to, piece)`

```
(#{}, PlayerId, Coords, Coords, Piece) -> #{}
```

**Mandatory.** Called when a player makes a move. Receives typed parameters — no
JSON parsing, no dynamic map access for move data.

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | Rhai Map `#{}` | Current game state |
| `player` | `PlayerId` | Player making the move (`.board`, `.color`, `.team`) |
| `from` | `Coords` | Source square (`.type` is `"board"` or `"reserve"`) |
| `to` | `Coords` | Destination square (always board) |
| `piece` | `Piece` | Moving piece (`.color`, `.type`) |

Returns the new game state map.

The engine reads the piece automatically:
- Board move: `board_get(state.board, from)`
- Reserve drop: `piece` from the frontend call

There is **no** `on_drop`. Reserve placements use the same `on_move` — the `from.type`
field distinguishes `"board"` from `"reserve"`.

### `get_ui(state, player)`

```
(#{}, PlayerId) -> #{}
```

**Optional** (returns `#{}` if absent). Returns UI elements the player should see.

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | Rhai Map `#{}` | Current game state |
| `player` | `PlayerId` | Player asking for their UI |

Returns a **map keyed by stable string element IDs**. Each value is a UI element
map (see Section 2). The engine extracts handler closures from the elements,
stores them in an internal registry, and serializes the rest to JSON.

- Called after every state change (after `on_move`, after any UI interaction).
- Also callable anytime (page refresh, UI poll) — must be a pure function.
- The engine **discards all previously stored handlers** before each call.
- Returns `#{}` if there is nothing to show.

### `check_game_over(state)`

```
(#{}) -> #{}
```

**Optional.** Called automatically by the engine after every state change.
May attach `game_over` to the state:

```rhai
state.game_over = Winner(player_index)     // single winner by player index
state.game_over = Winners(["white","red"]) // multiple winners by color
state.game_over = Draw()                   // draw
```

Returns the (possibly modified) state. If not defined, engine skips it.

### `valid_actions(state, player)`

```
(#{}, PlayerId) -> [Action]
```

**Optional** (returns `[]` if absent). Returns legal moves for the given player.
Each action is built via `Move(from, to)`:

```
Action {
    type: "move",
    from: Coords,    // board coords or ReserveCoords(i)
    to: Coords,      // destination (board coords)
}
```

Returns `[]` when the game is in a pending UI state, the player is not active,
or the game is over.

---

## 2. UI Element Types

Returned by `get_ui` as values in the returned map. Each element is a Rhai map
with a `type` field and optional handler closures.

### `Button`

```rhai
#{
    type: "button",
    label: string,
    on_click: |state| { ... }   // fn(state) -> #{}
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"button"` | YES | Discriminator |
| `label` | string | YES | Button text |
| `on_click` | closure `fn(state) -> #{}` | YES | Invoked on click. Stripped from JSON. |

### `PieceSelection`

```rhai
#{
    type: "piece_selection",
    title: string,
    pieces: [Piece, ...],
    on_select: |state, piece| { ... }   // fn(state, Piece) -> #{}
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"piece_selection"` | YES | Discriminator |
| `title` | string | YES | Dialog title |
| `pieces` | array of `Piece` | YES | Selectable pieces (`.color`, `.type`) |
| `on_select` | closure `fn(state, piece) -> #{}` | YES | Invoked on selection. Stripped from JSON. |

To allow declining a selection (e.g. gating), include a sentinel:
`Piece("color", "none")`. The handler checks `piece.type == "none"`.

### `Banner`

```rhai
#{
    type: "banner",
    text: string,
    style: "info" | "warning" | "error"   // default: "info"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"banner"` | YES | Discriminator |
| `text` | string | YES | Banner message |
| `style` | string | NO | `"info"`, `"warning"`, or `"error"` |

No handler closure — banners are non-interactive.

---

## 3. Handler Lifecycle

```
State change (on_move returns, or UI handler returns)
    │
    ▼
Engine discards ALL stored handlers
    │
    ▼
Engine calls get_ui(state, player)
    │
    ▼
For each element: extract closures → store in handler_registry[element_id]
    Strip closures → serialize rest → JSON to frontend
    │
    ▼
Frontend renders UI (no closures, only data)
    │
    ▼
Player clicks button "draw_btn" → frontend calls engine.uiInteraction(player, "draw_btn")
    or
Player selects piece → frontend calls engine.uiInteraction(player, "promo", Piece)
    │
    ▼
Engine looks up handler_registry[element_id]
    Button:     handler(state) → new state
    PieceSelection: handler(state, piece) → new state
    │
    ▼
Loop back to top
```

The handler registry is a `HashMap<String, StoredHandler>` completely replaced
after every `get_ui` call. No handlers persist across state changes.

---

## 4. Engine WASM Endpoints

### Constructor

```
new ChessvariantEngine(script_content: string, player_count: number) → engine
```

Calls `config()` and `init(player_count)`. Validates player count.

### Move

```
engine.handleMove(player_json, from_json, to_json, piece_json?) → result_json
```

1. Parses player, from, to, optional piece
2. If piece not provided: `board_get(state.board, from)`
3. Calls `on_move(state, player, from, to, piece)` → new state
4. Calls `get_ui(new_state, player)` → stores handlers, serializes UI
5. Calls `check_game_over(new_state)`
6. Returns `{ "ui": {...}, "game_over": null | {...} }`

### UI Interaction

```
engine.uiInteraction(player_json, element_id, value?) → result_json
```

1. Looks up stored handler by `element_id`
2. `Button`: calls `handler(state)` → new state
3. `PieceSelection`: deserializes value as `Piece`, calls `handler(state, piece)` → new state
4. Calls `get_ui(new_state, player)` → stores handlers, serializes UI
5. Calls `check_game_over(new_state)`
6. Returns `{ "ui": {...}, "game_over": null | {...} }`

Throws if `element_id` not in registry (stale interaction — frontend should re-poll).

### UI Poll / Refresh

```
engine.getUiJson(player_json) → ui_json
```

1. Calls `get_ui(state, player)` → stores handlers, serializes UI
2. Returns `{ "ui": {...} }`

Does not modify state. Does not call `check_game_over`.

### State Queries

```
engine.boardStateJson() → string
engine.activePlayersJson() → string
engine.playersJson() → string
engine.validActionsJson(player_json) → string
engine.reservePileJson() → string
engine.variantConfigJson() → string
engine.name() → string
engine.setLogLevel(level) → void
```

---

## 5. Built-in Functions (Rhai)

### Primitives

| Function | Signature | Purpose |
|----------|-----------|---------|
| `board_get` | `(BoardState, Coords) -> Piece` | Read piece at coords. Returns `()` if empty. |
| `board_set` | `(BoardState, Coords, Piece) -> BoardState` | Place piece (returns new board, immutable). |
| `board_move_piece` | `(BoardState, Coords, Coords) -> BoardState` | Move piece from→to (returns new board). |
| `board_find` | `(BoardState, Piece) -> [Coords]` | Find all coords with matching piece. |
| `board_rows` | `(BoardState) -> i32` | Board height. |
| `board_cols` | `(BoardState) -> i32` | Board width. |
| `board_count` | `(BoardState) -> i32` | Total pieces on board. |
| `ray` | `(BoardState, Coords, [i32,i32]) -> [{coords, piece}]` | Ray trace in direction. |
| `xray` | `(BoardState, Coords, [i32,i32]) -> [{coords, piece}]` | X-ray (through pieces). |
| `jump` | `(BoardState, Coords, [[i32,i32]]) -> [{coords, piece}]` | Knight-style jump moves. |
| `pawn_moves` | `(BoardState, Coords, String) -> [Coords]` | Pseudo-legal pawn moves. |
| `rook_moves` | `(BoardState, Coords, String) -> [Coords]` | Pseudo-legal rook moves. |
| `knight_moves` | `(BoardState, Coords, String) -> [Coords]` | Pseudo-legal knight moves. |
| `bishop_moves` | `(BoardState, Coords, String) -> [Coords]` | Pseudo-legal bishop moves. |
| `queen_moves` | `(BoardState, Coords, String) -> [Coords]` | Pseudo-legal queen moves. |
| `king_moves` | `(BoardState, Coords, String) -> [Coords]` | Pseudo-legal king moves. |
| `engine_valid_actions` | `(state, player) -> [Action]` | Legal moves (check-filtered if check_protection: true). |
| `is_square_attacked` | `(BoardState, Coords, String) -> bool` | Is a square attacked by a color? |
| `pseudo_moves` | `(BoardState, Coords, String, String) -> [Coords]` | Pseudo-moves for piece type+color. |
| `merge` | `(base: #{}, updates: #{}) -> #{}` | Shallow merge two maps. |
| `standard_start_position` | `() -> BoardState` | 8×8 standard chess starting position. |

### Constructors

| Function | Returns | Usage |
|----------|---------|-------|
| `Coords(r, c)` | `Coords` | Board square (board_index 0). |
| `Coords(r, c, b)` | `Coords` | Board square on board `b`. |
| `ReserveCoords(i)` | `Coords` | Reserve slot `i` (`.type == "reserve"`). |
| `Player("color")` | `PlayerId` | Player by color string. |
| `Player(board, "color")` | `PlayerId` | Player by board index and color. |
| `Piece("color", "type")` | `Piece` | Piece with color and type. |
| `Move(from, to)` | `Action` | Move action (for `valid_actions`). |
| `Winner(idx)` | `Dynamic` | Game-over: single winner by player index. |
| `Winners(arr)` | `Dynamic` | Game-over: multiple winners by color strings. |
| `Draw()` | `Dynamic` | Game-over: draw. |
| `combine(type, type)` | `#{}` | Custom piece definition (config only). |
| `Rectangle(r,c)` | `#{}` | Board layout: rectangle. |
| `Rect(r1,c1,r2,c2)` | `#{}` | Rectangular region descriptor. |

### Logging

| Function | Purpose |
|----------|---------|
| `log::debug(msg)` | Debug-level log. |
| `log::info(msg)` | Info-level log. |
| `log::warn(msg)` | Warning-level log. |
| `log::error(msg)` | Error-level log. |

### Native Types

| Type | Fields |
|------|--------|
| `Coords` | `.type` (`"board"` or `"reserve"`), `.row`, `.col`, `.board_index`, `.index` |
| `PlayerId` | `.board`, `.color`, `.team` |
| `Piece` | `.color`, `.type` (via `.piece_type` getter) |
| `Action` | `.type`, `.from`, `.to` |
| `BoardState` | opaque — use `board_*` functions |