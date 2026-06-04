# Chess Variant Scripting API v2

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

### Piece Definitions — Script-Only

> **v2 change**: Piece definitions are entirely script-defined. The engine provides **only unbiased geometry helpers** (`engine::moves::jump`, `engine::moves::slide`, `engine::moves::pawn_push`, and the per-type convenience wrappers `engine::moves::rook`, `::knight`, `::bishop`, `::queen`, `::king`). There is no `pieces()` function recognized by the engine, no `PieceDefinitionMap`, and no `pseudo_moves()` engine function.

Scripts define piece movement using a **two-level map structure**:

- **Type-level** (`PIECE_DEFS`): color-independent components (king, queen, rook, bishop, knight)
- **Color-specific** (`COLOR_PIECE_DEFS`): per-color components (pawns with color-dependent direction)

These maps are populated by builder functions called from `init()` and stored in the game state:

```rhai
fn build_piece_defs() {
    #{
        king: [
            #{ type: "jump", offsets: [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]] },
        ],
        queen: [
            #{ type: "slide", dirs: [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] },
        ],
        rook: [
            #{ type: "slide", dirs: [[0,1],[0,-1],[1,0],[-1,0]] },
        ],
        bishop: [
            #{ type: "slide", dirs: [[1,1],[1,-1],[-1,1],[-1,-1]] },
        ],
        knight: [
            #{ type: "jump", offsets: [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]] },
        ],
    }
}

fn build_color_piece_defs() {
    #{
        white: #{
            pawn: [
                // Single forward push — target must be empty
                #{ type: "jump", offsets: [[-1, 0]],
                   condition: |state, from, to|
                       engine::board::get(state.board, to) == ()
                },
                // Double forward push — from start line, both squares empty
                #{ type: "jump", offsets: [[-2, 0]],
                   condition: |state, from, to|
                       from.row == 6
                       && engine::board::get(state.board, Coords(from.row - 1, from.col)) == ()
                       && engine::board::get(state.board, to) == ()
                },
                // Diagonal captures — enemy piece or en passant
                #{ type: "jump", offsets: [[-1, -1], [-1, 1]],
                   condition: |state, from, to| {
                       let target = engine::board::get(state.board, to);
                       let my     = engine::board::get(state.board, from);
                       let is_enemy = (target != () && target.color != my.color);
                       let is_ep    = (state.en_passant != () && to == state.en_passant);
                       is_enemy || is_ep
                   }
                },
            ],
        },
        black: #{
            pawn: [
                #{ type: "jump", offsets: [[1, 0]],
                   condition: |state, from, to|
                       engine::board::get(state.board, to) == ()
                },
                // ... double push and captures with opposite direction
            ],
        },
    }
}
```

#### Component types and `condition` closures

Each component is an object map with fields:

| field | type | required | description |
|-------|------|----------|-------------|
| `type` | string | YES | `"jump"` or `"slide"` |
| `offsets` | `[[i32,i32]]` | for `"jump"` | Leap offset pairs |
| `dirs` | `[[i32,i32]]` | for `"slide"` | Ray direction vectors |
| `condition` | closure `\|state,from,to\| -> bool` | NO | Pseudo-legal constraint filter |

**Conditions** are Rhai closures that receive the game state, source coordinate, and destination. They are called by the script's `get_pseudo_dests()` function to filter pseudo-legal destinations. Conditions can access `engine::board::get` and any state keys (e.g., `state.en_passant`).

#### Required script helpers

Every variant script must implement (or copy) these helper functions:

```rhai
// Lookup: tries color-specific then type-level
fn get_piece_defs(piece, state) {
    if piece.color in state.color_piece_defs && piece.type in state.color_piece_defs[piece.color] {
        return state.color_piece_defs[piece.color][piece.type];
    }
    if piece.type in state.piece_defs { return state.piece_defs[piece.type]; }
    [];
}

// Generate pseudo-legal destinations using geometry helpers + conditions
fn get_pseudo_dests(board, from, state) {
    let piece = engine::board::get(board, from);
    if piece == () { return []; }
    let comps = get_piece_defs(piece, state);
    if comps == () || comps.len == 0 { return []; }
    let dests = [];
    for comp in comps {
        let raw = switch comp.type {
            "jump"  => engine::moves::jump(board, from, comp.offsets, piece.color),
            "slide" => engine::moves::slide(board, from, comp.dirs, piece.color),
            _ => [],
        };
        if comp.condition != () { raw = raw.filter(|t| comp.condition(state, from, t)); }
        for d in raw { dests.push(d); }
    }
    dests
}

// Attack detection
fn sq_attacked_by(board, square, enemy_colors, state) {
    if enemy_colors == () || enemy_colors.len == 0 { return false; }
    for r in 0..board.rows { for c in 0..board.cols {
        let pos = Coords(r, c); let piece = engine::board::get(board, pos);
        if piece != () && enemy_colors.contains(piece.color) {
            let dests = get_pseudo_dests(board, pos, state);
            for d in dests { if d == square { return true; } }
        }
    }}
    false
}

fn is_in_check(board, king_color, enemy_colors, state) {
    let king_pos = engine::board::find(board, Piece(king_color, "king"));
    if king_pos == () || king_pos.len == 0 { return false; }
    sq_attacked_by(board, king_pos[0], enemy_colors, state)
}
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
    piece_defs: #{/* from build_piece_defs() */},
    color_piece_defs: #{/* from build_color_piece_defs() */},
    players: [
        #{
            id: i32,
            name?: string,
            home_board?: i32,
            data?: #{},
            board: i32,
            color: string,
            team: i32,
            orientation?: string,
        },
    ],
    teams?: [ #{ id: i32, orientations: [ #{ board: i32, orientation: string } ] } ],
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
        piece_defs: build_piece_defs(),
        color_piece_defs: build_color_piece_defs(),
        // Variant-defined keys: e.g. turn: 0, turn_order, castling_rights, …
    }
}
```

**4-player chess** — each color gets its own pawn direction:
```rhai
fn build_color_piece_defs() {
    #{
        yellow: #{ pawn: [
            #{ type: "jump", offsets: [[1, 0]], condition: |s,f,t| engine::board::get(s.board, t) == () },
            #{ type: "jump", offsets: [[2, 0]], condition: |s,f,t| f.row == 1 && ... },
            #{ type: "jump", offsets: [[1,-1],[1,1]], condition: |s,f,t| { /* enemy capture */ } },
        ]},
        green:  #{ pawn: [
            #{ type: "jump", offsets: [[0,-1]], condition: ... },
            #{ type: "jump", offsets: [[0,-2]], condition: ... },
            #{ type: "jump", offsets: [[-1,-1],[1,-1]], condition: ... },
        ]},
        red:    #{ pawn: [ /* moves north */ ] },
        blue:   #{ pawn: [ /* moves east */ ] },
    }
}
```

---

### `valid_moves(state, player_id)`

```
(#{}, i32) -> [Move]
```

**Mandatory.** Returns all legal `Move` actions for the given player (identified by `player_id`).
**Only `Move` actions.** No `SelectPiece`, `Interact`, or `Cancel`.

```rhai
fn valid_moves(state, player_id) {
    if "outcome" in state { return []; }
    let player = state.players.find(|p| p.id == player_id);
    if player_id != state.turn { return []; }

    let candidates = [];
    for r in 0..8 {
        for c in 0..8 {
            let from = Coords(r, c);
            let piece = engine::board::get(state.board, from);
            if piece != () && piece.color == player.color {
                let dests = get_pseudo_dests(state.board, from, state);
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

- Uses script-level `get_pseudo_dests()` instead of engine `pseudo_moves()`.
- Returns `[]` if the player has no legal moves.

### `is_game_over(state, all_valid_moves)`

```
(#{}, [ #{ player: Player, moves: [Move] } ]) -> bool
```

**Mandatory.** Called after `valid_moves` has been computed for **all** players.

```rhai
fn is_game_over(state, all_valid_moves) {
    if "outcome" in state { return true; }
    for entry in all_valid_moves {
        if entry.moves.len > 0 { return false; }
    }
    true
}
```

### `handle_action(state, player_id, action)`

```
(#{}, i32, Action) -> #{}
```

**Mandatory.** The single action reducer. Dispatches on `action.type`.

**Contract:** `handle_action` is responsible for ALL legality enforcement:
- Turn order, piece ownership, no self-capture
- **King safety** — use script-level `is_in_check()` after applying the move

```rhai
fn handle_action(state, player_id, action) {
    let player = state.players.find(|p| p.id == player_id);
    if action.type == "move" {
        if state.turn != player_id { throw "not your turn"; }
        let piece = engine::board::get(state.board, action.from);
        if piece == () { throw "no piece at source square"; }
        if piece.color != player.color { throw "not your piece"; }

        let new_board = engine::board::move_piece(state.board, action.from, action.to);

        // King safety
        let enemy_colors = state.players
            .filter(|p| p.team != player.team)
            .map(|p| p.color);
        if is_in_check(new_board, player.color, enemy_colors, state) {
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

### `derive_ui(state, player_id)`

```
(#{}, i32) -> #{}
```

**Optional** (returns `#{}` if absent). Returns UI elements for the given player.
Pure function of `state` and `player_id`.

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
valid_moves(new_state, local_player_id) → [Move, ...]
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

> **Removed in v2**: `pseudo_moves` (both forms), `is_square_attacked`, `is_in_check`, `pieces()` — all replaced by script-side equivalents using the generic geometry helpers.

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
| `Winner(idx)` | Game outcome — returns `GameResult` |
| `Winners([colors])` | Game outcome — returns `GameResult` |
| `Draw()` | Game outcome — returns `GameResult` |

#### `GameResult` type

Returned by `Winner()`, `Winners()`, and `Draw()` constructors. Stored in `state.outcome`.

| Field | Type | Available on | Description |
|-------|------|-------------|-------------|
| `type` | string | all | `"winner"`, `"winners"`, or `"draw"` |
| `player` | i32 | `Winner` only | Winning player ID |
| `players` | [i32] | `Winners` only | Winning player IDs |

Serialized as `{ type, player?, players? }` in JSON output.

Coords is an **opaque Rhai type** with getters: `.type`, `.row`, `.col`, `.board_index`, `.index`.

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
| Move is legal | Engine calls `valid_moves(state, player_id)` via Rhai; move must be in returned list. |
| Non-Move actions are state-consistent | Script validates state conditions in `handle_action`. Engine passes them through. |
| UI element IDs unique | Engine throws on duplicate keys in `derive_ui` return. |
| State immutability | Engine never mutates state map. Script owns all transitions. |
| Deterministic replay | `handle_action` is pure: same `(player, action)` → same state. |
| Game-over is terminal | Once `is_game_over` returns `true`, engine reads `state.outcome` and stops calling script functions. |
| Piece definitions are script-owned | Engine provides only unbiased geometry helpers. All piece rules, conditions, and direction are in the script. |
