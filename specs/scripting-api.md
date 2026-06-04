# Chess Variant Scripting API v1

**Single Source of Truth** for the Rhai scripting interface.
All agents (Plan, Build) MUST reference this document.

`api_version` in `config()` must be `1`.

---

## 1. Script Functions

### `config()`

```
() -> #{}
```

**Mandatory.** Returns the variant configuration map.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `api_version` | i32 | YES | Must be `1` |
| `name` | string | YES | Variant display name |
| `version` | string | YES | Variant script version |
| `colors` | [string] | YES | Player color identifiers |
| `allowed_player_count` | i32, [i32], or #{min,max,step?} | YES | Player count constraint |
| `board` | #{type,rows,cols,count?,disabled_rects?} | YES | Board layout config |

### `pieces()`

```
() -> [#{}]
```

**Optional.** Called once at engine startup (after `config()`, before `init()`). Defines custom piece types stored in the engine — never serialized into game state. Both peers derive them from the same script, so they never need to be transmitted.

Each piece must have a unique `name` that does not shadow a built-in piece type (`pawn`, `rook`, `knight`, `bishop`, `queen`, `king`).

#### `Parts` — union of existing piece types

```rhai
fn pieces() {
    [
        // empress = rook + knight
        #{ name: "empress",  parts: ["rook", "knight"] },
        // princess = bishop + knight
        #{ name: "princess", parts: ["bishop", "knight"] },
    ]
}
```

`parts` lists any combination of built-in piece names and other custom piece names. Pseudo-moves are the union of all component types. Cycles are rejected at startup.

#### `Components` — explicit movement rules

```rhai
fn pieces() {
    [
        // lance: slides forward only (white = up = row -1)
        #{
            name: "lance",
            components: [
                #{ type: "slide", dirs: [[-1, 0]] }
            ]
        },

        // ferz: jumps one step diagonally
        #{
            name: "ferz",
            components: [
                #{ type: "jump", offsets: [[1,1],[1,-1],[-1,1],[-1,-1]] }
            ]
        },

        // teleporter knight: jumps to knight offsets on board 1
        #{
            name: "phantom_knight",
            components: [
                #{
                    type: "jump",
                    offsets: [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]],
                    target_board_delta: 1   // lands on board index + 1
                }
            ]
        },
    ]
}
```

#### Component types

| type | required fields | optional fields | description |
|------|----------------|-----------------|-------------|
| `slide` | `dirs: [[dr,dc],…]` | — | Ray in each direction. Stops at first occupied square (can capture enemy, blocked by own). Board stays the same. |
| `jump` | `offsets: [[dr,dc],…]` | `target_board_delta: i32` (default `0`) | Fixed offset, ignores blocking pieces. Destination board = `from.board_index + target_board_delta`. Out-of-range board indices are silently filtered. |

#### Using custom pieces in scripts

```rhai
// 2-arg form reads piece type and color from the board automatically:
let dests = pseudo_moves(state.board, from);

// 4-arg form lets you specify piece type and color explicitly (also works):
let dests = engine::pseudo_moves(state.board, from, "empress", player.color);
```

---

### `init(player_count)`

```
(i32) -> #{}
```

**Mandatory.** Returns the initial game state.

```rhai
#{
    board: Board,
    players: [
        #{
            // Player identity — id is the canonical reference
            id: i32,                // Required: unique player identifier
            name?: string,          // Optional: display name (e.g. "Alice")
            home_board?: i32,       // Optional: default board when pressing "home" (default 0)
            data?: #{},             // Optional: arbitrary script-defined metadata (available as Rhai value)

            // Game role — which board, color, and team this player controls
            board: i32,
            color: string,
            team: i32,
            // Optional: how this player views the board.
            // Overrides team orientation. See §7 for values and resolution order.
            orientation?: string,
        },
    ],
    // Optional: team-level orientation defaults (convenience, may be omitted).
    teams?: [
        #{
            id: i32,
            orientations: [
                #{ board: i32, orientation: string },
            ],
        },
    ],
    // custom state keys ...
}
```

**Orientation values:** `"normal"` | `"flipped"` | `"clockwise"` | `"counterclockwise"`

**Resolution order** (highest wins):
1. `player.orientation` (if present)
2. `teams[player.team].orientations` entry matching `board` (if `teams` present)
3. Default: team 0 → `"normal"`, team 1 → `"flipped"`, others → `"normal"`

**Standard 1v1** — using player-level orientation directly:
```rhai
fn init(player_count) {
    #{
        board: engine::standard_start_position(),
        players: [
            #{ id: 0, name: "White", board: 0, color: "white", team: 0, orientation: "normal" },
            #{ id: 1, name: "Black", board: 0, color: "black", team: 1, orientation: "flipped" },
        ],
        // Variant-defined keys: e.g. turn: 0, turn_order, castling_rights, …
    }
}
```

**4-player chess** — using team-level orientation:
```rhai
fn init(player_count) {
    #{
        board: /* ... */,
        players: [
            #{ id: 0, name: "North", board: 0, color: "north", team: 0 },
            #{ id: 1, name: "East",  board: 0, color: "east",  team: 1 },
            #{ id: 2, name: "South", board: 0, color: "south", team: 2 },
            #{ id: 3, name: "West",  board: 0, color: "west",  team: 3 },
        ],
        teams: [
            #{ id: 0, orientations: [#{ board: 0, orientation: "normal" }] },
            #{ id: 1, orientations: [#{ board: 0, orientation: "clockwise" }] },
            #{ id: 2, orientations: [#{ board: 0, orientation: "flipped" }] },
            #{ id: 3, orientations: [#{ board: 0, orientation: "counterclockwise" }] },
        ],
        // Variant-defined keys: e.g. turn: 0, turn_order, …
    }
}
```

### `valid_moves(state, player_id)`

```
(#{}, i32) -> [Move]
```

**Mandatory.** Returns all legal `Move` actions for the given player (identified by `player_id`).
**Only `Move` actions.** No `SelectPiece`, `Interact`, or `Cancel`.

The script looks up the player from `state.players` by id:

```rhai
fn valid_moves(state, player_id) {
    if "outcome" in state { return []; }
    let player = state.players.find(|p| p.id == player_id);
    // Variant-defined turn check, e.g.:
    // if player_id != state.turn { return []; }

    let candidates = [];
    for r in 0..8 {
        for c in 0..8 {
            let from = Coords(r, c);
            let piece = engine::board::get(state.board, from);
            if piece != () && piece.color == player.color {
                let dests = pseudo_moves(state.board, from);
                for to in dests {
                    candidates.push(Move(from, to));
                }
            }
        }
    }

    candidates.filter(|m| {
        try { handle_action(state, player_id, m); true }
        catch(err) { false }
    })
}
```

- Returns `[]` if the player has no legal moves.

### `is_game_over(state, all_valid_moves)`

```
(#{}, [ #{ player: Player, moves: [Move] } ]) -> bool
```

**Mandatory.** Called after `valid_moves` has been computed for **all** players — even when every player has an empty moves array (stalemate / game-over scenarios).

`all_valid_moves` is an array where each entry has the player and their legal moves:

```rhai
[
    #{ player: #{ id: 0, board: 0, color: "white", team: 0 }, moves: [Move, Move] },
    #{ player: #{ id: 1, board: 0, color: "black", team: 1 }, moves: [] },
]
```

**Typical implementation** — all players have no moves:

```rhai
fn is_game_over(state, all_valid_moves) {
    if "outcome" in state { return true; }
    for entry in all_valid_moves {
        if entry.moves.len > 0 { return false; }
    }
    true
}
```

Or **specific variant** — current player has no moves:

```rhai
fn is_game_over(state, all_valid_moves) {
    for entry in all_valid_moves {
        // Variant-defined: check if current player has no moves
        // if entry.player.id == state.turn && entry.moves.len == 0 {
            return true;
        }
    }
    false
}
```

- Returns `true` → engine reads `state.outcome` for the result.
- Returns `false` → game continues.
- Outcome constructors: `Winner(idx)`, `Winners(["color",...])`, `Draw()` — set by `handle_action`.

### `handle_action(state, player_id, action)`

```
(#{}, i32, Action) -> #{}
```

**Mandatory.** The single action reducer. Dispatches on `action.type`.

**Contract:** `handle_action` is responsible for ALL legality enforcement:
- Turn order (whose turn it is)
- Piece ownership (player can only move own pieces)
- No self-capture
- **King safety** — after applying the move, throw if the acting player's king is now in check

Throwing from `handle_action` signals an illegal action. `valid_moves` uses this to filter candidates (try/catch pattern).

```rhai
fn handle_action(state, player_id, action) {
    let player = state.players.find(|p| p.id == player_id);
    if action.type == "move" {
        // Variant-defined turn check, e.g.:
        // if state.turn != player_id { throw "not your turn"; }
        let piece = engine::board::get(state.board, action.from);
        if piece == () { throw "no piece at source square"; }
        if piece.color != player.color { throw "not your piece"; }

        let new_board = engine::board::move_piece(state.board, action.from, action.to);

        // King safety: throw if own king is left in check
        let enemy_colors = state.players
            .filter(|p| p.team != player.team)
            .map(|p| p.color);
        if is_in_check(new_board, player.color, enemy_colors) {
            throw "move leaves king in check";
        }

        state.board = new_board;
        state.turn = if state.turn == "white" { "black" } else { "white" };
    }
    if action.type == "interact" && action.element_id == "summon_btn" {
        // Example: "Summon" button places a pawn in the center of the board.
        let spawn = Coords(3, 3); // d5-ish
        state.board = engine::board::set(state.board, spawn, Piece(player.color, "pawn"));
        state.summoned = true;
    }
    if action.type == "select_piece" {
        // action.piece — user picked from PiecePicker UI element
    }
    if action.type == "cancel" {
        // user dismissed PiecePicker without selecting — abort pending sequence
    }
    state
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | `#{}` | Current game state |
| `player_id` | i32 | Submitting player's id — look up from `state.players` |
| `action` | `Action` | See Section 2 |

**Game-over:** Set `state.outcome` before returning. Engine reads it when `is_game_over` returns `true`.

### `derive_ui(state, player_id)`

```
(#{}, i32) -> #{}
```

**Optional** (returns `#{}` if absent). Returns UI elements for the given player.
Pure function of `state` and `player_id`.

```rhai
fn derive_ui(state, player_id) {
    let player = state.players.find(|p| p.id == player_id);
    let ui = #{};

    // "Summon" button: available once per game, lets the player spawn a pawn
    // in the center. Pressing it emits Interact("summon_btn").
    // Variant-defined turn check for UI, e.g.:
    // if player.id == state.turn && !state.summoned {
        ui.summon_btn = #{ type: "button", label: "Summon Pawn" };
    }

    // PiecePicker for promotion
    if state.pending == "promotion" {
        ui.promo_pick = #{
            type: "piece_picker",
            pieces: [
                Piece(player.color, "queen"),
                Piece(player.color, "rook"),
                Piece(player.color, "bishop"),
                Piece(player.color, "knight"),
            ],
        };
    }

    // Reserve pile
    if state.reserve != () && state.reserve[player.color].len > 0 {
        ui.reserve = #{ type: "reserve_pile", pieces: state.reserve[player.color] };
    }

    ui
}
```

- Called after every `handle_action` and on UI refresh.
- Element IDs must be unique; engine throws on duplicates.

---

## 2. Action Types

Every action has a `type` discriminator field.

### `Move`

```rhai
Move(from, to)
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"move"` | Discriminator |
| `from` | `Coords` | Board square or `ReserveCoords(i)`. Access via `.type`, `.row`, `.col`, `.board_index`, `.index` getters. |
| `to` | `Coords` | Destination board square (always a board coordinate) |

Returned by `valid_moves`. Reserve drops use `from = ReserveCoords(i)`.

Moves are compared by structural equality of their `from` and `to` fields.

### `SelectPiece`

```rhai
SelectPiece(piece)
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"select_piece"` | Discriminator |
| `piece` | `Piece` | Chosen piece |

Emitted by the frontend when the user picks from a `PiecePicker` UI element.
**Not** returned by `valid_moves`. Script must validate state conditions in `handle_action`.

### `Interact`

```rhai
Interact(element_id)
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"interact"` | Discriminator |
| `element_id` | string | Matches key in `derive_ui` return map |

Emitted when the user clicks a `Button` UI element. **Not** returned by `valid_moves`.

### `Cancel`

```rhai
Cancel()
```

No payload. Emitted when the user dismisses a `PiecePicker` without selecting.
**Not** returned by `valid_moves`.

---

## 3. UI Element Types

Returned by `derive_ui` as values in the element map. Every element has a `type` discriminator. Pure data — no closures.

### `Button`

```rhai
#{ type: "button", label: string, disabled?: bool }
```

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `type` | `"button"` | YES | — |
| `label` | string | YES | — |
| `disabled` | bool | NO | `false` |

Clicking an enabled button emits `Interact(element_id)`. A disabled button is rendered greyed out and ignores clicks.

### `Banner`

```rhai
#{ type: "banner", text: string, style?: "info" | "warning" | "error" }
```

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `type` | `"banner"` | YES | — |
| `text` | string | YES | — |
| `style` | string | NO | `"info"` |

Non-interactive. Rendered as a colored bar with the text. Style controls background color.

### `ReservePile`

```rhai
#{ type: "reserve_pile", pieces: [Piece, ...], board_index?: i32 }
```

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `type` | `"reserve_pile"` | YES | — |
| `pieces` | [Piece] | YES | — |
| `board_index` | i32 | NO | `0` |

Dragging/clicking a reserve piece emits `Move(ReserveCoords(i), to)` when the target is a valid board square. `board_index` controls which board slot the pile is anchored to.

### `PiecePicker`

```rhai
#{ type: "piece_picker", pieces: [Piece, ...], cancelable?: bool, title?: string }
```

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `type` | `"piece_picker"` | YES | — |
| `pieces` | [Piece] | YES | — |
| `cancelable` | bool | NO | `true` |
| `title` | string | NO | — |

The frontend renders an overlay listing the pieces as selectable sprites.

- Clicking a piece emits `SelectPiece(piece)`.
- If `cancelable` is `true`, a cancel affordance is shown; dismissing or tapping the cancel area emits `Cancel()`.
- If `cancelable` is `false`, the picker is mandatory — no dismiss possible. Use for forced choices like pawn promotion where the player must pick a piece.

Shown when present in `derive_ui`; hidden when absent.

#### Example: forced promotion picker (no cancel)

```rhai
fn derive_ui(state, player_id) {
    let player = state.players.find(|p| p.id == player_id);
    if "promotion_pending" in state && state.promotion_pending != () {
        let pp = state.promotion_pending;
        if pp.color == player.color {
            return #{
                promotion: #{
                    type: "piece_picker",
                    cancelable: false,
                    title: "Promote pawn to:",
                    pieces: [
                        Piece(pp.color, "queen"),
                        Piece(pp.color, "rook"),
                        Piece(pp.color, "bishop"),
                        Piece(pp.color, "knight"),
                    ],
                },
            };
        }
    }
    #{}
}
```

#### Example: optional summon picker (cancel allowed)

```rhai
fn derive_ui(state, player_id) {
    let player = state.players.find(|p| p.id == player_id);
    if player_id == state.turn && !state.summoned {
        ui.summon_btn = #{ type: "button", label: "Summon Piece" };
    }
    if "summon_pending" in state {
        result.choose_piece = #{
            type: "piece_picker",
            cancelable: true,
            pieces: [Piece(player.color, "knight"), Piece(player.color, "bishop")],
        };
    }
    result
}
```

---

## 4. Engine Flow

### Constructor

```
new ChessvariantEngine(script, player_count)
→ calls config() → validates api_version=1
→ calls pieces() (optional — absent fn silently skipped, errors propagate)
→ registers engine helpers with custom piece definitions
→ calls init() → returns engine
```

### Submit Action — Phase 1 (synchronous, immediate)

```
player submits (player_json, action_json)
  │
  ├─ action is Move?
  │   → call valid_moves(state, player_id) via Rhai
  │   → move not in returned list? → reject
  │
  ├─ action is non-Move (SelectPiece, Interact, Cancel)?
  │   → pass through unconditionally
  │
  ▼
handle_action(state, player_id, action) → new_state
  │
  ├─ derive_ui(new_state, player_id) → serialize to JSON
  │
  ▼
Return { board_state, ui, game_over: null? } to frontend
```

### Phase 2a — local player first

```
valid_moves(new_state, local_player_id)  → [Move, ...]
  → postMessage { _phase: "validMoves", player, moves } to frontend
```

### Phase 2b — remaining players

```
for each player in state.players except local:
    valid_moves(new_state, player.id) → [Move, ...]
```

### Phase 2c — game over check

```
all_valid_moves = collected from Phase 2a + 2b
is_game_over(new_state, all_valid_moves) → bool
  │
  ├─ true  → read new_state.outcome
  │          → postMessage { _phase: "gameOver", result: { type, player? } }
  │
  └─ false → game continues
```

### State Queries

```
engine.boardStateJson()    → string
engine.playersJson()       → string
engine.variantConfigJson() → string
engine.name()              → string
engine.stateJson()         → string
```

### Valid Moves Poll

```
engine.validMovesForPlayerJson(player_json) → string
// Computes valid_moves for a single player (Phase 2a caller).
```

### UI Refresh

```
engine.deriveUiJson(player_json) → string
// Calls derive_ui(state, player_id). Does not modify state.
```

---

## 5. Built-in Modules

### `engine::board` — Board Operations

| Function | Signature |
|----------|-----------|
| `get` | `(Board, Coords) -> Piece` |
| `set` | `(Board, Coords, Piece) -> Board` |
| `move_piece` | `(Board, Coords, Coords) -> Board` |
| `find` | `(Board, Piece) -> [Coords]` |
| `find_by_color` | `(Board, color) -> [#{coords, piece}]` |
| `rows` | `(Board) -> i32` |
| `cols` | `(Board) -> i32` |
| `count` | `(Board) -> i32` |
| `ray` | `(Board, Coords, [i32,i32]) -> [{coords, piece}]` |
| `xray` | `(Board, Coords, [i32,i32]) -> [{coords, piece}]` |
| `jump` | `(Board, Coords, [[i32,i32]]) -> [{coords, piece}]` |

### `engine::moves` — Pseudo-Legal Move Generators

| Function | Signature |
|----------|-----------|
| `pawn` | `(Board, Coords, color) -> [Coords]` |
| `rook` | `(Board, Coords, color) -> [Coords]` |
| `knight` | `(Board, Coords, color) -> [Coords]` |
| `bishop` | `(Board, Coords, color) -> [Coords]` |
| `queen` | `(Board, Coords, color) -> [Coords]` |
| `king` | `(Board, Coords, color) -> [Coords]` |

### `engine` — Helpers

| Function | Signature | Purpose |
|----------|-----------|---------|
| `is_square_attacked` | `(Board, Coords, color) -> bool` | Square attacked by pieces of color? |
| `pseudo_moves` | `(Board, Coords) -> [Coords]` | Pseudo-moves for piece at coords (reads piece from board) |
| `pseudo_moves` | `(Board, Coords, piece_type, color) -> [Coords]` | Pseudo-moves with explicit type and color |
| `is_in_check` | `(Board, king_color, [enemy_color]) -> bool` | Is the king of `king_color` currently in check? Pure board scan — caller must apply any move first. |
| `merge` | `(base: #{}, updates: #{}) -> #{}` | Shallow merge |
| `standard_start_position` | `() -> Board` | 8×8 standard chess |

### `engine` — Constructors

| Function | Purpose |
|----------|---------|
| `Coords(r, c)` | Board square (board_index = 0) |
| `Coords(r, c, board)` | Board square on board `board` |
| `ReserveCoords(i)` | Reserve slot (board_index = 0) |
| `Move(from, to)` | Move action |
| `SelectPiece(piece)` | SelectPiece action |
| `Interact(element_id)` | Interact action |
| `Cancel()` | Cancel action |
| `Piece(color, type)` | Piece |
| `Player(id)` | Player by numeric id (preferred) |
| `Player(id, name)` | Player by id with display name |
| `Player(id, name, home_board)` | Player with id, name, and home board |
| `Player(id, name, home_board, data)` | Player with arbitrary script data |
| `Player(color)` | Player by color (backward compat) |
| `Player(board, color)` | Player by board + color (backward compat) |
| `Winner(idx)` | Game outcome |
| `Winners([colors])` | Game outcome |
| `Draw()` | Game outcome |

Player has an optional `data` field (like `Piece.data`) for script-defined metadata:

```rhai
let p = Player(0, "Alice", 0, #{ score: 42 });
// p.data  →  #{ score: 42 }
```

The `data` field is extracted from `state.players` Rhai map entries if a `data` key is present, and is included in `validMovesForPlayerJson` and `validMovesAllJson` output.

Coords is an **opaque Rhai type** with the following getter properties:

| Property | Type | Board | Reserve |
|----------|------|-------|---------|
| `coords.type` | string | `"board"` | `"reserve"` |
| `coords.row` | i32 | row | 0 |
| `coords.col` | i32 | column | 0 |
| `coords.board_index` | i32 | board index | 0 |
| `coords.index` | i32 | 0 | reserve slot index |

JSON serialization (tagged enum):
```json
// Board square
{ "type": "board", "row": 1, "col": 2, "boardIndex": 0 }
// Reserve slot
{ "type": "reserve", "index": 0, "boardIndex": 0 }
```

### `log`

| Function |
|----------|
| `log::debug(msg)` |
| `log::info(msg)` |
| `log::warn(msg)` |
| `log::error(msg)` |

---

## 7. Board Orientation

Each player sees the board from their own perspective. Orientation controls how the PixiJS renderer rotates/flips the board for that player's slot.

| Value | Degrees | Description |
|-------|---------|-------------|
| `"normal"` | 0° | Board as-is (row 0 at top) |
| `"flipped"` | 180° | Upside-down (standard black view in chess) |
| `"clockwise"` | 90° CW | Rotated clockwise (e.g. east player in 4-player) |
| `"counterclockwise"` | 90° CCW | Rotated counter-clockwise (e.g. west player in 4-player) |

**Resolution order** (highest wins):
1. `player.orientation` in `init()` result — per-player explicit override
2. `teams[player.team].orientations` entry with matching `board` — team-level default
3. Built-in default: team `0` → `"normal"`, team `1` → `"flipped"`, all others → `"normal"`

The engine exposes resolved orientation via `playersJson()`:
```json
[
  { "id": 0, "name": "White", "board": 0, "color": "white", "team": 0, "home_board": 0, "orientation": "normal" },
  { "id": 1, "name": "Black", "board": 0, "color": "black", "team": 1, "home_board": 0, "orientation": "flipped" }
]
```

The UI additionally provides a **rotate button** in the side panel that cycles the local view through all four orientations, overriding the script default at runtime (user preference, not persisted).


| Guarantee | Enforcement |
|-----------|-------------|
| Move is legal | Engine calls `valid_moves(state, player_id)` via Rhai; move must be in returned list. |
| Non-Move actions are state-consistent | Script validates state conditions in `handle_action`. Engine passes them through. |
| UI element IDs unique | Engine throws on duplicate keys in `derive_ui` return. |
| State immutability | Engine never mutates state map. Script owns all transitions. |
| Deterministic replay | `handle_action` is pure: same `(player, action)` → same state. |
| Game-over is terminal | Once `is_game_over` returns `true`, engine reads `state.outcome` and stops calling script functions. |
