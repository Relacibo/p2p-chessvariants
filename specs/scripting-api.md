# Chess Variant Scripting API

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
| `allowed_player_count` | `i32` \| `[i32]` \| `#{min: i32, max: i32, step?: i32}` | YES | Exact count, list of allowed values, or ranged constraint |
| `board` | #{type,rows,cols,count?,disabled_rects?} | YES | Board layout config |

---

### `init_static(player_count)`

```
(i32) -> #{}
```

**Optional.** Called once after `config()` and before `init()`. Returns a map of key-value pairs that are registered as global variables (via Rhai global module), visible to all subsequent function calls without being stored in game state.

Use this for static data that never changes and should not be serialized to the frontend — primarily `PIECE_DEFS` (piece movement definitions).

```rhai
fn init_static(player_count) {
    #{
        PIECE_DEFS: #{ "king": [...], "pawn:white": [...], ... },
        // other static data...
    }
}
```

**PIECE_DEFS schema:** Each key is `"{type}"` (all colors) or `"{type}:{color}"` (color-specific, takes precedence). Each value is an array of movement components:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"jump"` or `"slide"` | Movement class |
| `offsets` | `[[i32,i32]]` | Leap vectors (for jump) |
| `dirs` | `[[i32,i32]]` | Direction vectors (for slide) |
| `condition` | `\|s, f, t\| -> bool` (optional) | Filter destinations via `engine::board::get` and state keys |

Scripts use `engine::moves::jump`/`slide` to generate candidates, filter with conditions, then validate moves via king-safety checks.

**4-player chess** — each color gets its own pawn direction:
```rhai
fn init_static(player_count) {
    #{
        PIECE_DEFS: #{
            // ... standard pieces (king, queen, etc.) ...
            "pawn:yellow": [
            #{ type: "jump", offsets: [[1, 0]], condition: |s,f,t| engine::board::get(s.board, t) == () },
            #{ type: "jump", offsets: [[2, 0]], condition: |s,f,t| f.row == 1 && ... },
            #{ type: "jump", offsets: [[1,-1],[1,1]], condition: |s,f,t| { /* enemy capture */ } },
        ],
        "pawn:green": [
            #{ type: "jump", offsets: [[0,-1]], condition: ... },
            #{ type: "jump", offsets: [[0,-2]], condition: ... },
            #{ type: "jump", offsets: [[-1,-1],[1,-1]], condition: ... },
        ],
        "pawn:red":    [ /* moves north */ ],
        "pawn:blue":   [ /* moves east */ ],
        }
    }
}
```

### `init(player_count)`

**Mandatory.** Returns the initial game state.

```rhai
#{
    board: Board,
    players: [
        #{
            id: i32,
            name?: string,
            home_board?: i32,
            data?: #{},
            team: i32,
            orientation?: string,
        },
    ],
    teams?: [ #{ id: i32, orientations: [ #{ board: i32, orientation: string } ] } ],
    // custom state keys (turn, en_passant, castling_rights, …)
    // NOTE: piece definitions are NOT in state — they come from init_static()
}
```

**Orientation values:** `"normal"` | `"flipped"` | `"clockwise"` | `"counterclockwise"`

**Resolution order** (highest wins):
1. `player.orientation` (if present)
2. `teams[player.team].orientations` entry matching `player.home_board` (if `teams` present and `home_board` set)
3. Default: team 0 → `"normal"`, team 1 → `"flipped"`, others → `"normal"`

**Standard 1v1** — using player-level orientation directly:
```rhai
fn init(player_count) {
    #{
        board: engine::standard_start_position(),
        players: [
            #{ id: 0, name: "White", team: 0, orientation: "normal",  data: #{ color: "white" } },
            #{ id: 1, name: "Black", team: 1, orientation: "flipped", data: #{ color: "black" } },
        ],
        // Variant-defined keys: e.g. turn: 0, turn_order, castling_rights, …
        // NOTE: piece definitions are NOT in state — they come from init_static()
    }
}
```

---

### `valid_moves(state, player)`

```
(#{}, #{}) -> [Move]
```

**Mandatory.** Returns all legal `Move` actions for the given player.
**Only `Move` actions.** No `SelectPiece`, `Interact`, or `Cancel`.

The engine passes the player as a map `#{ id, name, team, orientation?, data? }`. Scripts that need color or board assignments store them in `data`.

```rhai
fn valid_moves(state, player) {
    if "outcome" in state { return []; }
    if player.id != state.turn { return []; }

    let candidates = [];
    for r in 0..8 {
        for c in 0..8 {
            let from = Coords(r, c);
            let piece = engine::board::get(state.board, from);
            if piece != () && piece.color == player.data.color {
                let dests = get_pseudo_dests(state.board, from, state);
                for to in dests {
                    candidates.push(Move(from, to));
                }
            }
        }
    }

    candidates.filter(|m| {
        try { handle_action(state, player, m); true }
        catch(err) { false }
    })
}
```

- Uses script-level `get_pseudo_dests()` instead of engine `pseudo_moves()`.
- Returns `[]` if the player has no legal moves.
- **Rhai COW semantics:** `handle_action(state, player, m)` receives a copy-on-write clone of `state`; the original `state` in `valid_moves` is never mutated, making the `try/catch` pattern safe.
- **try/catch caveat:** The `catch` block catches all `throw` calls from `handle_action` (e.g. `"not your turn"`, `"move leaves king in check"`), but also silently swallows any script errors. For debugging, add `log::error(err)` inside the `catch` block during development.

### `derive_game_progress(state, all_valid_moves)`

```
(#{}, [ #{ player: Player, moves: [Move] } ]) -> GameProgress
```

**Mandatory.** Called after `valid_moves` has been computed for **all** players.
Returns a `GameProgress` enum value directly (no `bool`).

**`GameProgress` variants:**

| Rhai constructor | Rust variant | JSON |
|------------------|-------------|------|
| `InProgress()` | `GameProgress::InProgress` | `{ "progress": "in_progress" }` |
| `Draw()` | `GameProgress::Draw` | `{ "progress": "draw" }` |
| `Winner(team_id)` | `GameProgress::Decisive { winning_team }` | `{ "progress": "decisive", "winningTeam": 0 }` |

```rhai
fn derive_game_progress(state, all_valid_moves) {
    if "outcome" in state { return state.outcome; }
    for entry in all_valid_moves {
        if entry.moves.len > 0 { return InProgress(); }
    }
    Draw()
}
```

The function **must** be defined in every script. The engine will return an error if the
function is missing — there is no fallback.

### `handle_action(state, player, action)`

```
(#{}, #{}, Action) -> #{}
```

**Mandatory.** The single action reducer. Dispatches on `action.type`.

**Contract:** `handle_action` is responsible for ALL legality enforcement:
- Turn order, piece ownership, no self-capture
- **King safety** — use script-level `is_in_check()` after applying the move

The engine passes the player as a map `#{ id, name, team, orientation?, data? }`. Scripts that need color or board assignments store them in `data`.

```rhai
fn handle_action(state, player, action) {
    if action.type == "move" {
        if state.turn != player.id { throw "not your turn"; }
        let piece = engine::board::get(state.board, action.from);
        if piece == () { throw "no piece at source square"; }
        if piece.color != player.data.color { throw "not your piece"; }

        let new_board = engine::board::move_piece(state.board, action.from, action.to);

        // King safety
        let enemy_colors = state.players
            .filter(|p| p.team != player.team)
            .map(|p| p.data.color);
        if is_in_check(new_board, player.data.color, enemy_colors, state) {
            throw "move leaves king in check";
        }

        state.board = new_board;
        state.turn = /* next player */;
    }
    if action.type == "select_piece" {
        // action.piece — user picked from PiecePicker UI element
    }
    if action.type == "cancel" {
        // user dismissed PiecePicker without selecting
    }
    state
}
```

### `derive_ui(state, player)`

```
(#{}, #{}) -> #{}
```

**Optional** (returns `#{}` if absent). Returns UI elements for the given player.
Pure function of `state` and the player map.

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

Other fields (`piece`, `element_id`) are `()` on `Move` actions.
Returned by `valid_moves`. Moves are compared by structural equality of their `from` and `to` fields.

### `SelectPiece`

```rhai
SelectPiece(piece)
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"select_piece"` | Discriminator |
| `piece` | `Piece` | Chosen piece |

Other fields (`from`, `to`, `element_id`) are `()` on `SelectPiece` actions.

### `Interact`

```rhai
Interact(element_id)
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"interact"` | Discriminator |
| `element_id` | `String` | UI element identifier |

Other fields (`from`, `to`, `piece`) are `()` on `Interact` actions.

### `Cancel`

```rhai
Cancel()
```

All payload fields (`from`, `to`, `piece`, `element_id`) are `()` on `Cancel` actions.

---

## 3. UI Element Types

### `Button`
```rhai
#{ type: "button", label: string, disabled?: bool }
```

### `Banner`
```rhai
#{ type: "banner", text: string, style?: "info" | "warning" | "error" }
```

### `ReservePile`
```rhai
#{ type: "reserve_pile", pieces: [Piece, ...], board_index?: i32 }
```

### `PiecePicker`
```rhai
#{ type: "piece_picker", pieces: [Piece, ...], cancelable?: bool, title?: string }
```

---

## 4. Engine Flow

### Constructor

```
new ChessvariantEngine(script, player_count)
→ calls config() → validates api_version=1
→ calls register_engine_helpers()
→ calls init_static(player_count) → registers return values as global module
→ calls init(player_count) → returns engine
```

### Submit Action — Phase 1 (synchronous, immediate)

```
player submits (player_json, action_json)
  │
  ├─ action is Move?
  │   → call valid_moves(state, player) via Rhai
  │   → move not in returned list? → reject
  │
  ├─ action is non-Move (SelectPiece, Interact, Cancel)?
  │   → pass through unconditionally
  │
  ▼
handle_action(state, player, action) → new_state
  │
  ├─ derive_ui(new_state, player) → serialize to JSON
  │
  ▼
Return { board_state, ui, game_over: null? } to frontend
```

### Phase 2a — local player first
```
valid_moves(new_state, local_player) → [Move, ...]
```

### Phase 2b — remaining players
```
for each player in state.players except local:
    valid_moves(new_state, player) → [Move, ...]
```

### Phase 2c — game over check
```
all_valid_moves = collected from Phase 2a + 2b
derive_game_progress(new_state, all_valid_moves) → GameProgress
```

---

## 5. Built-in Modules

### `engine::board` — Board Operations

| Function | Signature |
|----------|-----------|
| `get` | `(Board, Coords) -> Piece \| ()` |
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

> **Note:** `jump`, `ray`, and `xray` in `engine::board` are **trace** functions — they report what is at each square without color filtering. For move generation (filtering out friendly pieces), use `engine::moves::jump` and `engine::moves::slide`.

### `engine::moves` — Pure-Geometry Move Generators

The engine provides **unbiased geometry helpers**. All piece-specific rules (pawn direction, capture conditions, en passant) are defined in the script via conditions.

#### Generic helpers (composable by scripts)

| Function | Signature | Description |
|----------|-----------|-------------|
| `jump` | `(Board, Coords, [[i32,i32]], color) -> [Coords]` | Generic leaper. Returns in-bounds destination squares not occupied by a same-colored piece. No blocking — each offset is independent. |
| `slide` | `(Board, Coords, [[i32,i32]], color) -> [Coords]` | Generic rider. Rays in each direction, stops before same-colored piece, includes first enemy. |
| `pawn_push` | `(Board, Coords, color, dr, dc, start_line) -> [Coords]` | Convenience: forward single/double push + diagonal captures perpendicular to `(dr,dc)`. `start_line=-1` disables double push. |

#### Per-type convenience wrappers (optional sugar)

| Function | Signature |
|----------|-----------|
| `rook` | `(Board, Coords, color) -> [Coords]` |
| `knight` | `(Board, Coords, color) -> [Coords]` |
| `bishop` | `(Board, Coords, color) -> [Coords]` |
| `queen` | `(Board, Coords, color) -> [Coords]` |
| `king` | `(Board, Coords, color) -> [Coords]` |

There is **no** `engine::moves::pawn` function. Pawn movement is defined entirely in the script via components with conditions.

### `engine` — Helpers

| Function | Signature | Purpose |
|----------|-----------|---------|
| `merge` | `(base: #{}, updates: #{}) -> #{}` | Shallow map merge |
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
| `InProgress()` | Game state — returns `GameProgress` |
| `Winner(team_id)` | Game outcome — returns `GameProgress` |
| `Draw()` | Game outcome — returns `GameProgress` |

#### `GameProgress` type

Returned by `InProgress()`, `Winner()`, and `Draw()` constructors. Stored in `state.outcome`.

| Variant | Rhai constructor | JSON |
|---------|-----------------|------|
| `InProgress` | `InProgress()` | `{ "progress": "in_progress" }` |
| `Draw` | `Draw()` | `{ "progress": "draw" }` |
| `Decisive` | `Winner(team_id)` | `{ "progress": "decisive", "winningTeam": 0 }` |

`Winner(team_id)` takes a **team ID** (from `state.players[].team`), never a player ID.

Coords is an **opaque Rhai type** with getters: `.type` (`"board"` for board squares, `"reserve"` for `ReserveCoords`), `.row`, `.col`, `.board_index`, `.index`. Board squares: `.row`/`.col` are i32, `.index` returns `()`. `ReserveCoords`: `.index` is i32, `.row`/`.col` return `()`.

### `log`

| Function |
|----------|
| `log::debug(msg)` |
| `log::info(msg)` |
| `log::warn(msg)` |
| `log::error(msg)` |

---

## 6. Board Orientation

| Value | Degrees | Description |
|-------|---------|-------------|
| `"normal"` | 0° | Board as-is (row 0 at top) |
| `"flipped"` | 180° | Upside-down |
| `"clockwise"` | 90° CW | Rotated clockwise |
| `"counterclockwise"` | 90° CCW | Rotated counter-clockwise |

---

## 7. Guarantees

| Guarantee | Enforcement |
|-----------|-------------|
| Move is legal | Engine calls `valid_moves(state, player)` via Rhai; move must be in returned list. |
| Non-Move actions are state-consistent | Script validates state conditions in `handle_action`. Engine passes them through. |
| UI element IDs unique | Engine throws on duplicate keys in `derive_ui` return. |
| State immutability | Engine never mutates state map. Script owns all transitions. |
| Deterministic replay | `handle_action` is pure: same `(player, action)` → same state. |
| Game-over is terminal | Once `derive_game_progress` returns `Draw` or `Decisive`, the engine reads the result directly and stops calling script functions. |
| Piece definitions are script-owned | Engine provides only unbiased geometry helpers. All piece rules, conditions, and direction are in the script. |
