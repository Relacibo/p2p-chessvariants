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
| `check_protection` | bool | NO (default: false) | Enable check filtering in `engine::valid_actions` |
| `pieces` | #{} | NO | Custom piece definitions via `engine::combine(type, type)`. Each key is a new piece type name (e.g. `"hawk"`). After registration, `Piece("white", "hawk")` is valid and `.type` returns `"hawk"`. The engine uses the `combine` definition to generate moves for that type. |
| `reserve_pile` | bool | NO (default: false) | Enable reserve pile |

### `init(player_count)`

```
(i32) -> #{}
```

**Mandatory.** Returns the initial game state map. Called once at engine construction.

The returned map must contain at least:

```rhai
#{
    board: Board,               // native — one board or array of boards
    players: [                   // one entry per player
        #{ board: i32, color: string, team: i32 },
        // ...
    ],
    active_players: [Player],   // ordered turn queue
    game_over: (),               // () = not over
}
```

Variants may add any additional keys. The engine never modifies state keys except `game_over`.

### `on_move(state, player, from, to, piece)`

```
(#{}, Player, Coords, Coords, Piece) -> #{}
```

**Mandatory.** Called when a player makes a move. Receives typed parameters — no
JSON parsing, no dynamic map access for move data.

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | Rhai Map `#{}` | Current game state |
| `player` | `Player` | Player making the move (`.board`, `.color`, `.team`) |
| `from` | `Coords` | Source square (`.type` is `"board"` or `"reserve"`) |
| `to` | `Coords` | Destination square (always board) |
| `piece` | `Piece` | Moving piece (`.color`, `.type`) |

Returns the new game state map.

The engine reads the piece automatically:
- Board move: `engine::board::get(state.board, from)`
- Reserve drop: `piece` from the frontend call

**Safety guarantee**: The engine validates that the submitted move exists in
`valid_actions(state, player)` **before** calling `on_move`. If the move is not
in the valid actions set, the engine rejects it with an error — the script does
not need to re-validate legality.

There is **no** `on_drop`. Reserve placements use the same `on_move` — the `from.type`
field distinguishes `"board"` from `"reserve"`.

### `get_ui(state, player)`

```
(#{}, Player) -> #{}
```

**Optional** (returns `#{}` if absent). Returns UI elements the player should see.

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | Rhai Map `#{}` | Current game state |
| `player` | `Player` | Player asking for their UI |

Returns a **map keyed by stable, unique string element IDs**. Each value is a UI
element map (see Section 2). The engine extracts handler closures from the elements,
stores them in an internal registry, and serializes the rest to JSON.

- Called after every state change (after `on_move`, after any UI interaction).
- Also callable anytime (page refresh, UI poll) — must be a pure function.
- The engine updates its handler registry from the returned map: existing
  entries are replaced, element IDs not present in the new return value lose
  their handlers. This guarantees that only the UI elements currently returned
  by `get_ui` can receive interactions.
- Returns `#{}` if there is nothing to show.
- **Element ID uniqueness**: The engine detects duplicate keys in the returned
  map and throws an error. Scripts should use descriptive, namespaced IDs (e.g.
  `"promo_pick"`, `"gate_pick"`, `"draw_offer_btn"`), never generic names like
  `"btn"` or `"action"`.

### `check_game_over(state)`

```
(#{}) -> #{}
```

**Optional.** Called automatically by the engine after every state change.
May attach `game_over` to the state:

```rhai
state.game_over = engine::Winner(player_index)       // single winner by player index
state.game_over = engine::Winners(["white","red"])   // multiple winners by color
state.game_over = engine::Draw()                      // draw
```

Returns the (possibly modified) state. If not defined, engine skips it.

### `valid_actions(state, player)`

```
(#{}, Player) -> [Action]
```

**Optional** (returns `[]` if absent). Returns legal moves for the given player.
Each action is built via `engine::Move(from, to)`:

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

## 3. Handler Model

UI handlers are plain Rhai closures stored in a registry keyed by element ID.
They receive the current `state` (and optionally a `Piece`) as parameters —
they never capture stale state through scoping.

```
State change (on_move returns, or UI handler returns)
    │
    ▼
Engine calls get_ui(state, player)
    │
    ▼
Handler closures extracted → stored in handler_registry (replaces old entries)
Serializable data     → JSON → frontend
    │
    ▼
Frontend renders UI (no closures, only data)
    │
    ▼
Player interaction → engine.uiInteraction(player, elementId, value?)
    │
    ▼
Engine looks up handler_registry[elementId]
    Button:          handler(state) → new state
    PieceSelection:  handler(state, piece) → new state
    │
    ▼
Loop back to top
```

### Registry Update Rules

| Rule | Rationale |
|------|-----------|
| New element IDs are added | `get_ui` returned them |
| Existing element IDs are replaced | UI layout or closure may have changed |
| Element IDs no longer in the return value lose their handlers | They are no longer visible — the frontend cannot trigger them |
| Unknown element IDs → error on `uiInteraction` | Prevents stale or forged interactions |

The handler closures are **pure functions** of the state they receive as argument.
They are not tied to the state snapshot at the time `get_ui` was called. The registry
update is a simple replacement — not a purge-and-rebuild lifecycle.

The handler registry is an opaque, engine-internal data structure. Scripts don't
interact with it directly.

---

## 4. Engine WASM Endpoints

All game logic runs in the Rust engine (WASM). The frontend is a thin
presentation layer. Clock management and game-over detection live in the engine,
not in TypeScript.

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
2. **Validates**: if `valid_actions` is implemented, the submitted move must be in the returned set. If not → error. If `valid_actions` is not implemented by the script, this step is skipped.
3. If piece not provided: reads it via board
4. Calls `on_move(state, player, from, to, piece)` → new state
5. Calls `get_ui(new_state, player)` → updates handler registry, serializes UI data
6. Calls `check_game_over(new_state)`
7. Returns `{ "ui": {...}, "game_over": null | {...} }`

### UI Interaction

```
engine.uiInteraction(player_json, element_id, value?) → result_json
```

1. **Validates**: `element_id` must exist in handler registry. If not → error.
2. `Button`: calls `handler(state)` → new state
3. `PieceSelection`: deserializes value as `Piece`, calls `handler(state, piece)` → new state
4. Calls `get_ui(new_state, player)` → stores handlers, serializes UI
5. Calls `check_game_over(new_state)`
6. Returns `{ "ui": {...}, "game_over": null | {...} }`

### UI Poll / Refresh

```
engine.getUiJson(player_json) → ui_json
```

1. Calls `get_ui(state, player)` → updates handler registry, serializes UI data
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

## 5. Built-in Modules (Rhai)

All built-in functions and types are organized into Rhai modules.
Scripts access them via module paths (e.g. `engine::board::get(...)`).

### `engine::board` — Board Operations

Board functions use copy-on-write semantics. Scripts receive a new `Board` value
after each mutation; the engine internally reuses shared state for performance.

| Function | Signature | Purpose |
|----------|-----------|---------|
| `get` | `(Board, Coords) -> Piece` | Read piece at coords. Returns `()` if empty. |
| `set` | `(Board, Coords, Piece) -> Board` | Place piece (returns new board). |
| `move_piece` | `(Board, Coords, Coords) -> Board` | Move piece from→to (returns new board). |
| `find` | `(Board, Piece) -> [Coords]` | Find all coords with matching piece. |
| `rows` | `(Board) -> i32` | Board height. |
| `cols` | `(Board) -> i32` | Board width. |
| `count` | `(Board) -> i32` | Total pieces on board. |

### `engine::board` — Movement Primitives

| Function | Signature | Purpose |
|----------|-----------|---------|
| `ray` | `(Board, Coords, [i32,i32]) -> [{coords, piece}]` | Ray trace in direction. |
| `xray` | `(Board, Coords, [i32,i32]) -> [{coords, piece}]` | X-ray (through pieces). |
| `jump` | `(Board, Coords, [[i32,i32]]) -> [{coords, piece}]` | Knight-style jump moves. |

### `engine::moves` — Pseudo-Legal Move Generators

The third parameter is always the **moving piece's color** (e.g. `"white"`, `"black"`),
not the piece type.

| Function | Signature | Purpose |
|----------|-----------|---------|
| `pawn` | `(Board, Coords, color: string) -> [Coords]` | Pseudo-legal pawn moves. |
| `rook` | `(Board, Coords, color: string) -> [Coords]` | Pseudo-legal rook moves. |
| `knight` | `(Board, Coords, color: string) -> [Coords]` | Pseudo-legal knight moves. |
| `bishop` | `(Board, Coords, color: string) -> [Coords]` | Pseudo-legal bishop moves. |
| `queen` | `(Board, Coords, color: string) -> [Coords]` | Pseudo-legal queen moves. |
| `king` | `(Board, Coords, color: string) -> [Coords]` | Pseudo-legal king moves. |

### `engine` — Engine Helpers

| Function | Signature | Purpose |
|----------|-----------|---------|
| `valid_actions` | `(state, player) -> [Action]` | Legal moves (check-filtered if `check_protection: true`). |
| `is_square_attacked` | `(Board, Coords, attacker_color: string) -> bool` | Is the square attacked by any piece of the given color? |
| `pseudo_moves` | `(Board, Coords, piece_type: string, color: string) -> [Coords]` | Pseudo-moves for a given piece type and color. |
| `merge` | `(base: #{}, updates: #{}) -> #{}` | Shallow merge two maps. |
| `standard_start_position` | `() -> Board` | 8×8 standard chess starting position. |

### `engine` — Constructors

| Function | Returns | Usage |
|----------|---------|-------|
| `Coords(r, c)` | `Coords` | Board square (board_index 0). |
| `Coords(r, c, b)` | `Coords` | Board square on board `b`. |
| `ReserveCoords(i)` | `Coords` | Reserve slot `i` (`.type == "reserve"`). |
| `Player("color")` | `Player` | Player by color string. |
| `Player(board, "color")` | `Player` | Player by board index and color. |
| `Piece("color", "type")` | `Piece` | Piece with color and type. |
| `Move(from, to)` | `Action` | Move action (for `valid_actions`). |
| `Winner(idx)` | `Dynamic` | Game-over: single winner by player index. |
| `Winners(arr)` | `Dynamic` | Game-over: multiple winners by color strings. |
| `Draw()` | `Dynamic` | Game-over: draw. |
| `combine(type, type)` | `#{}` | Custom piece definition (config only). |
| `Rectangle(r,c)` | `#{}` | Board layout: rectangle. |
| `Rect(r1,c1,r2,c2)` | `#{}` | Rectangular region descriptor. |

### `log` — Logging

| Function | Purpose |
|----------|---------|
| `log::debug(msg)` | Debug-level log. |
| `log::info(msg)` | Info-level log. |
| `log::warn(msg)` | Warning-level log. |
| `log::error(msg)` | Error-level log. |

### Native Types

| Type | Module | Fields |
|------|--------|--------|
| `Coords` | — | `.type` (`"board"` or `"reserve"`), `.row`, `.col`, `.board_index`, `.index` |
| `Player` | — | `.board`, `.color`, `.team` |
| `Piece` | — | `.color`, `.type` |
| `Action` | — | `.type`, `.from`, `.to` |
| `Board` | `engine::board` | Opaque — use `engine::board::*` functions |

---

## 6. Safety Guarantees

The Rust engine enforces these guarantees. Scripts can rely on them — they do
not need to duplicate these checks.

| Guarantee | Enforcement |
|-----------|-------------|
| Submitted move is legal | Engine validates `Move(from, to)` is in `valid_actions(state, player)` **before** calling `on_move`. |
| UI element IDs are unique | Engine detects duplicate keys in `get_ui` return value and throws. |
| UI handler ID is valid | Engine validates `element_id` exists in registry before dispatching `uiInteraction`. |
| State ownership | Engine never modifies state fields except `game_over`. Script owns all state. |
| Turn order is engine-driven | The engine tracks whose turn it is; clock management will be in Rust, not Rhai. |
| Game-over check is automatic | `check_game_over(state)` is called after every state change. Script only needs to implement the detection logic. |
