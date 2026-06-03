# Chess Variant Scripting API v3

**Single Source of Truth** for the Rhai scripting interface.
All agents (Plan, Build) MUST reference this document.

`api_version` in `config()` must be `3`.

---

## 1. Script Functions

### `config()`

```
() -> #{}
```

**Mandatory.** Returns the variant configuration map.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `api_version` | i32 | YES | Must be `3` |
| `name` | string | YES | Variant display name |
| `version` | string | YES | Variant script version |
| `colors` | [string] | YES | Player color identifiers |
| `allowed_player_count` | i32, [i32], or #{min,max,step?} | YES | Player count constraint |
| `board` | #{type,rows,cols,count?,disabled_rects?} | YES | Board layout config |

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
            #{ board: 0, color: "white", team: 0, orientation: "normal" },
            #{ board: 0, color: "black", team: 1, orientation: "flipped" },
        ],
        turn: "white",
    }
}
```

**4-player chess** — using team-level orientation:
```rhai
fn init(player_count) {
    #{
        board: /* ... */,
        players: [
            #{ board: 0, color: "north", team: 0 },
            #{ board: 0, color: "east",  team: 1 },
            #{ board: 0, color: "south", team: 2 },
            #{ board: 0, color: "west",  team: 3 },
        ],
        teams: [
            #{ id: 0, orientations: [#{ board: 0, orientation: "normal" }] },
            #{ id: 1, orientations: [#{ board: 0, orientation: "clockwise" }] },
            #{ id: 2, orientations: [#{ board: 0, orientation: "flipped" }] },
            #{ id: 3, orientations: [#{ board: 0, orientation: "counterclockwise" }] },
        ],
        turn: "north",
    }
}
```

### `valid_moves(state, player)`

```
(#{}, Player) -> [Move]
```

**Mandatory.** Returns all legal `Move` actions for the given player.
**Only `Move` actions.** No `SelectPiece`, `Interact`, or `Cancel`.

```rhai
fn valid_moves(state, player) {
    if "outcome" in state { return []; }
    if player.color != state.turn { return []; }

    let moves = [];
    for r in 0..8 {
        for c in 0..8 {
            let piece = engine::board::get(state.board, Coords(r, c));
            if piece != () && piece.color == player.color {
                let from = Coords(r, c);
                let dests = moves_for_piece(state.board, from, piece.type, player.color);
                for to in dests {
                    if !is_king_in_check(state, from, to, player) {
                        moves.push(Move(from, to));
                    }
                }
            }
        }
    }
    moves
}
```

- Returns `[]` if the player has no legal moves.
- Engine caches result per player. Cache invalidated after every `handle_action`.

### `is_game_over(state, all_valid_moves)`

```
(#{}, [ #{ player: Player, moves: [Move] } ]) -> bool
```

**Mandatory.** Called after `valid_moves` has been computed for **all** players.

`all_valid_moves` is an array where each entry has the player and their legal moves:

```rhai
[
    #{ player: #{ board: 0, color: "white", team: 0 }, moves: [Move, Move] },
    #{ player: #{ board: 0, color: "black", team: 0 }, moves: [] },
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
        if entry.player.color == state.turn && entry.moves.len == 0 {
            return true;
        }
    }
    false
}
```

- Returns `true` → engine reads `state.outcome` for the result.
- Returns `false` → game continues, valid_moves are cached for all players.
- Outcome constructors: `Winner(idx)`, `Winners(["color",...])`, `Draw()` — set by `handle_action`.

### `handle_action(state, player, action)`

```
(#{}, Player, Action) -> #{}
```

**Mandatory.** The single action reducer. Dispatches on `action.type`:

```rhai
fn handle_action(state, player, action) {
    if action.type == "move" {
        // action.from, action.to — engine guarantees legality (see §6)
        state.board = engine::board::move_piece(state.board, action.from, action.to);
        state.turn = if state.turn == "white" { "black" } else { "white" };
    }
    if action.type == "interact" && action.element_id == "summon_btn" {
        // Example: "Summon" button places a pawn in the center of the board.
        // Can only be used once per player (guarded by state.summoned flag).
        let spawn = Coords(3, 3); // d5-ish
        state.board = engine::board::set(state.board, spawn, Piece(player.color, "pawn"));
        state.summoned = true;
    }
    if action.type == "select_piece" {
        // action.piece — user picked from PiecePicker UI element
        // Script must validate: is state.pending active?
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
| `player` | `Player` | Submitting player (`.board`, `.color`, `.team`) |
| `action` | `Action` | See Section 2 |

**Game-over:** Set `state.outcome` before returning. Engine reads it when `is_game_over` returns `true`.

### `get_ui(state, player)`

```
(#{}, Player) -> #{}
```

**Optional** (returns `#{}` if absent). Returns UI elements for the given player.
Pure function of `state` and `player`.

```rhai
fn get_ui(state, player) {
    let ui = #{};

    // "Summon" button: available once per game, lets the player spawn a pawn
    // in the center. Pressing it emits Interact("summon_btn").
    if player.color == state.turn && !state.summoned {
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
| `from` | `Coords` | Board square or `ReserveCoords(i)` |
| `to` | `Coords` | Destination board square |

Returned by `valid_moves`. Reserve drops use `from = ReserveCoords(i)`.

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
| `element_id` | string | Matches key in `get_ui` return map |

Emitted when the user clicks a `Button` UI element. **Not** returned by `valid_moves`.

### `Cancel`

```rhai
Cancel()
```

No payload. Emitted when the user dismisses a `PiecePicker` without selecting.
**Not** returned by `valid_moves`.

---

## 3. UI Element Types

Returned by `get_ui` as values in the element map. Pure data — no closures.

### `Button`

```rhai
#{ type: "button", label: string }
```

| Field | Type | Required |
|-------|------|----------|
| `type` | `"button"` | YES |
| `label` | string | YES |

Clicking emits `Interact(element_id)`.

### `Banner`

```rhai
#{ type: "banner", text: string, style: "info" | "warning" | "error" }
```

| Field | Type | Required |
|-------|------|----------|
| `type` | `"banner"` | YES |
| `text` | string | YES |
| `style` | string | NO (default `"info"`) |

Non-interactive.

### `ReservePile`

```rhai
#{ type: "reserve_pile", pieces: [Piece, ...] }
```

| Field | Type | Required |
|-------|------|----------|
| `type` | `"reserve_pile"` | YES |
| `pieces` | [Piece] | YES |

Dragging/clicking a reserve piece produces `Move(ReserveCoords(i), to)` when the target is a valid board square.

### `PiecePicker`

```rhai
#{ type: "piece_picker", pieces: [Piece, ...] }
```

| Field | Type | Required |
|-------|------|----------|
| `type` | `"piece_picker"` | YES |
| `pieces` | [Piece] | YES |

The frontend renders a modal/dialog listing the pieces.
Clicking a piece emits `SelectPiece(piece)`. Dismissing emits `Cancel()`.
Shown when present in `get_ui`; hidden when absent.

---

## 4. Engine Flow

### Constructor

```
new ChessvariantEngine(script, player_count)
→ calls config() → validates api_version=3 → calls init() → returns engine
```

### Submit Action — Phase 1 (synchronous, immediate)

```
player submits (player_json, action_json)
  │
  ├─ action is Move AND cached_valid_moves is None?
  │   → call valid_moves(state, player) via Rhai
  │   → move not in returned list? → reject
  │
  ├─ action is Move AND cached_valid_moves is Some?
  │   → action must be in player's moves list
  │   → not found? → reject
  │
  ├─ action is non-Move (SelectPiece, Interact, Cancel)?
  │   → pass through unconditionally
  │
  ▼
handle_action(state, player, action) → new_state
  │
  ├─ cached_valid_moves = None   [invalidate]
  ├─ get_ui(new_state, player) → serialize to JSON
  │
  ▼
Return { board_state, ui, game_over: null? } to frontend
```

### Phase 2a — local player first

```
valid_moves(new_state, local_player)  → [Move, ...]
  → postMessage { _phase: "validMoves", player, moves } to frontend
  → store in engine cache (partial)
```

### Phase 2b — remaining players

```
for each player in state.players except local:
    valid_moves(new_state, player) → [Move, ...]
    → store in engine cache
```

### Phase 2c — game over check

```
all_valid_moves = collected from Phase 2a + 2b
is_game_over(new_state, all_valid_moves) → bool
  │
  ├─ true  → read new_state.outcome
  │          → postMessage { _phase: "gameOver", result: { type, player? } }
  │
  └─ false → commit valid_moves cache
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
// Returns cached valid_moves for a single player (Phase 2a caller).
```

### UI Refresh

```
engine.getUiJson(player_json) → string
// Calls get_ui(state, player). Does not modify state or cache.
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
| `pseudo_moves` | `(Board, Coords, piece_type, color) -> [Coords]` | Pseudo-moves for any piece type |
| `is_king_in_check` | `(State, Coords, Coords, Player) -> bool` | Would move leave own king in check? Uses team info from `state.players` to identify enemies. **Only simulates a simple from→to relocation** — does not model castling, en passant, or other special moves. |
| `merge` | `(base: #{}, updates: #{}) -> #{}` | Shallow merge |
| `standard_start_position` | `() -> Board` | 8×8 standard chess |

### `engine` — Constructors

| Function | Purpose |
|----------|---------|
| `Coords(r, c)` | Board square |
| `Coords(r, c, board)` | Board square on board `board` |
| `ReserveCoords(i)` | Reserve slot |
| `Move(from, to)` | Move action |
| `SelectPiece(piece)` | SelectPiece action |
| `Interact(element_id)` | Interact action |
| `Cancel()` | Cancel action |
| `Piece(color, type)` | Piece |
| `Player(color)` | Player by color |
| `Player(board, color)` | Player by board + color |
| `Winner(idx)` | Game outcome |
| `Winners([colors])` | Game outcome |
| `Draw()` | Game outcome |

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
  { "board": 0, "color": "white", "team": 0, "orientation": "normal" },
  { "board": 0, "color": "black", "team": 1, "orientation": "flipped" }
]
```

The UI additionally provides a **rotate button** in the side panel that cycles the local view through all four orientations, overriding the script default at runtime (user preference, not persisted).


| Guarantee | Enforcement |
|-----------|-------------|
| Move is legal | Engine validates: cached `valid_moves` fresh → action must be in list. Cache stale → `valid_moves(state, player)` called via Rhai; move must be in returned list. |
| Non-Move actions are state-consistent | Script validates state conditions in `handle_action`. Engine passes them through. |
| UI element IDs unique | Engine throws on duplicate keys in `get_ui` return. |
| State immutability | Engine never mutates state map. Script owns all transitions. |
| Deterministic replay | `handle_action` is pure: same `(player, action)` → same state. |
| Game-over is terminal | Once `is_game_over` returns `true`, engine reads `state.outcome` and stops calling script functions. |
