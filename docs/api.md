# Chess Variants Script API — Version 1

Scripts are written in [Rhai](https://rhai.rs/) and executed inside the WASM engine.
The engine calls well-known functions to drive the game loop. The game **state** is a
free-form Rhai map — the script defines its own schema; the engine just serialises it.

---

## Lifecycle

```
init(player_count)
      │
      ▼
┌─────────────────────────────────┐
│  valid_actions(state)           │  ← optional, for UI highlights
│        │                        │
│  player submits action          │
│        │                        │
│  apply(state, player, action)   │  → new state
│        │                        │
│  game_over?  (state.game_over)  │  ← check after every apply
└─────────────────────────────────┘
```

---

## Required Functions

### `fn config()`

Pure static metadata, called once on load.

```rhai
fn config() {
  #{
    api_version:  1,          // integer — must match a version the engine supports
    name:         "My Variant",
    version:      "1.0.0",   // semver of the script itself
    min_players:  2,
    max_players:  4,
    board: #{
      type:    "rectangle",
      rows:    8,
      cols:    8,
      // optional: count: 2        — number of boards (Alice Chess, Bughouse)
      // optional: disabled_rects  — list of Rect(...) to cut from the board (4-player chess)
    },
    // optional: reserve_pile: true   — enables piece drop mechanics (Crazyhouse, Bughouse)

    // optional: check_protection: true
    //   When true: the engine filters any move from pseudo_moves / valid_actions
    //   that would leave the own king in check (uses is_square_attacked internally).
    //   When false (default): the king is just another piece that can be captured.
    //   Most chess variants use false; standard FIDE chess uses true.
    check_protection: false,

    // optional: pieces
    //   Declares custom or composite piece types. The engine uses this to
    //   auto-generate pseudo_moves for pieces not known to it.
    //   Standard pieces (pawn, knight, bishop, rook, queen, king) are always known.
    pieces: #{
      // combine(): union of two standard piece move sets
      "hawk":        combine("bishop", "knight"),  // S-Chess: Bishop + Knight leaper
      "elephant":    combine("rook",   "knight"),  // S-Chess: Rook   + Knight leaper
      "amazon":      combine("queen",  "knight"),  // Queen + Knight leaper

      // leaper(): jumps to fixed offsets, ignores blocking pieces entirely
      "camel":       leaper([[3,1],[3,-1],[-3,1],[-3,-1],[1,3],[1,-3],[-1,3],[-1,-3]]),
      "alfil":       leaper([[2,2],[2,-2],[-2,2],[-2,-2]]),

      // modify(): standard piece with a behavioural modifier
      "lame_rook":   modify("rook",  #{ max_steps: 3 }),         // slides at most 3 squares
      "super_queen": modify("queen", #{ jump_over: ["king"] }),  // can jump over own king
    },
  }
}
```

---

### `fn init(player_count)`

Returns the initial game state (any Rhai map).

```rhai
fn init(player_count) {
  #{
    board:     /* ... */,
    turn:      0,          // convention: player index whose turn it is
    game_over: (),         // () = game still running
    // ... any other fields the variant needs
  }
}
```

---

### `fn apply(state, player_index, action)`

Applies an action and returns the new state. **Throw a string error** for illegal moves —
the engine will reject the action and the state remains unchanged.

```rhai
fn apply(state, player_index, action) {
  if player_index != state.turn {
    throw "not your turn";
  }
  // ... validate and apply
  // Set state.game_over = Winner(player_index) | Draw() when the game ends.
  new_state
}
```

The engine checks `state.game_over != ()` after every successful `apply` call.

---

## Optional Functions

### `fn pseudo_moves(state, from) → [Coords]`

Returns all squares the piece at `from` can reach **without check filtering**.
The engine uses this function as a callback inside `is_square_attacked`.

If `pieces` is declared in `config()`, the engine auto-generates `pseudo_moves` for
all listed pieces — you only need to define it manually for truly custom movement that
can't be expressed as `combine(...)`.

```rhai
fn pseudo_moves(state, from) {
  let p = board_get(state.board, from);
  switch p.type {
    "pawn"   => pawn_moves(state.board, from, p.color),
    "rook"   => rook_moves(state.board, from, p.color),
    "knight" => knight_moves(state.board, from, p.color),
    "bishop" => bishop_moves(state.board, from, p.color),
    "queen"  => queen_moves(state.board, from, p.color),
    "king"   => king_moves(state.board, from, p.color),
    // For pieces not listed in config.pieces, fall back to the engine:
    _        => engine_pseudo_moves(state, from),
  }
}
```

When `pseudo_moves` (or `pieces` in config) is defined, the engine provides:

```rhai
// Engine-provided builtins unlocked by pseudo_moves:
is_square_attacked(state, coords, by_color)   // → bool
leaves_king_in_check(state, from, to)         // → bool: would this move expose own king?
engine_valid_actions(state)                   // → [{player, action}]
                                              //   auto-generated from pseudo_moves
                                              //   + check filter if check_protection: true
engine_pseudo_moves(state, from)              // → [Coords]
                                              //   fallback when partially overriding pseudo_moves
```

---

### `fn valid_actions(state, player)`

Returns all currently legal actions for the given player. Called by the engine
once per player to determine active players and game-over state. Used by the UI
for move highlighting.

Override this to **add special moves** (castling, en passant, drops) on top:

```rhai
fn valid_actions(state, player) {
  let base = engine_valid_actions(state, player);   // standard moves with optional check filter
  base + castling_actions(state, player)
       + en_passant_actions(state, player)
}
```

For variants with **multiple active players**, the engine calls this function
for each player in `state.players` independently:

```rhai
fn valid_actions(state, player) {
  if player.color != state.turn { return []; }
  engine_valid_actions_for(state, player)
}
```

Return type: `Array` of `Action`.

---

## Game Over

Set `state.game_over` to one of the engine-provided constructors:

| Constructor | Meaning |
|---|---|
| `Winner(player_index)` | Single winner |
| `Winners([0, 1])` | Team win (multiple winners) |
| `Draw()` | Draw |

---

## Action Types

Actions are constructed with engine-provided functions (PascalCase constructors):

| Constructor | Use case |
|---|---|
| `Move(from, to)` | Move a piece on the board |
| `Drop(piece, to)` | Place a piece from reserve onto the board |
| `Choose(tag, value)` | Open-ended choice: promotion, gating, etc. |

Access inside `apply`:

```rhai
if action.type == "move" {
  let from = action.from;   // Coords
  let to   = action.to;     // Coords
}
if action.type == "drop" {
  let piece = action.piece; // Piece
  let to    = action.to;    // Coords
}
if action.type == "choose" {
  let tag   = action.tag;   // String
  let value = action.value; // String
}
```

---

## Function Tiers

| Tier | Define this | What it unlocks |
|---|---|---|
| 1 | `config`, `init`, `apply` | Playable game, no highlights |
| 2a | `pieces` in config | Engine auto-generates `pseudo_moves` for listed pieces |
| 2b | `fn pseudo_moves(state, from)` | Manual override or fully custom pieces |
| 2a or 2b | → enables → | `is_square_attacked`, `engine_valid_actions` builtins |
| 3 | `fn valid_actions(state, player)` | UI highlights; override to add castling, en passant, drops |

Most scripts only need Tier 1 + 2a + 3, e.g.:
```rhai
fn config() { #{ ..., pieces: #{ "hawk": combine("bishop","knight") }, check_protection: true } }
fn init(n)  { ... }
fn apply(state, player, action) { ... }
fn valid_actions(state, player) { engine_valid_actions(state, player) + castling_actions(state, player) }
```

---

## Engine-Provided Types

### `Coords`

```rhai
Coords(row, col)                // board_index defaults to 0
Coords(row, col, board_index)   // for multi-board variants
```

Fields: `.row`, `.col`, `.board_index`

### `Piece`

```rhai
Piece("white", "pawn")    // generic constructor
King("white")             // shorthand constructors
Queen("white")
Rook("white")
Bishop("white")
Knight("white")
Pawn("white")
Piece("white", "hawk")    // custom piece types as strings
```

Fields: `.color` (string), `.type` (string)

Piece data can carry custom payload:
```rhai
Piece("white", "pawn", #{ moved: false })   // third arg: custom data
piece.data                                   // access it
```

### `Rect`

```rhai
Rect(row, col, height, width)   // for disabled_rects in board config
```

---

## Engine-Provided Board Helpers

All board helpers treat the board as **immutable** — they return a new board.

```rhai
// Read
board_get(board, coords)              // → Piece | ()
board_find(board, piece)              // → [Coords]  – find all matching pieces

// Write (return new board)
board_set(board, coords, piece)       // place piece (or () to clear)
board_move_piece(board, from, to)     // move piece, clears source

// Geometry
ray(board, from, [dr, dc])
// Returns [{ coords: Coords, piece: Piece | () }] along direction until board edge.
// Stops AFTER the first occupied square (includes it for captures).

xray(board, from, [dr, dc])
// Returns [{ coords: Coords, piece: Piece | () }] along direction until board edge.
// Does NOT stop at occupied squares — all squares are returned.
// Named after the chess tactic: a piece "sees through" another piece.
// Use with a for/break loop for full control over stop logic.
//
// Example — piece that jumps over own king:
//   for sq in xray(board, from, dir) {
//     if sq.piece == ()                                          { squares.push(sq.coords); }
//     else if sq.piece.type == "king" && sq.piece.color == color { continue; }  // jump over
//     else if sq.piece.color != color                            { squares.push(sq.coords); break; }
//     else                                                       { break; }
//   }

jump(board, from, [[dr,dc], ...])
// Returns [{ coords: Coords, piece: Piece | () }] for each offset that is on the board.

// Utility
board_rows(board)    // → int
board_cols(board)    // → int
board_count(board)   // → int  (number of boards in multi-board state)
board_empty(rows, cols)  // → empty board
```

---

## Engine-Provided Standard Piece Move Functions

These return **pseudo-legal** destination squares (no check filtering).
All respect board boundaries and friendly-piece blocking.

```rhai
// Each takes: (board, from: Coords, color: String) → [Coords]
pawn_moves(board, from, color)      // forward push + captures; no en passant
rook_moves(board, from, color)
knight_moves(board, from, color)
bishop_moves(board, from, color)
queen_moves(board, from, color)     // = rook_moves + bishop_moves
king_moves(board, from, color)      // single square, no castling

// For raw ray casting:
ray(board, from, [dr, dc])          // one direction, stops after first occupied square
xray(board, from, [dr, dc])         // one direction, passes through all pieces
jump(board, from, [[dr,dc], ...])   // multi-offset jump (leaper)
```

**Composition** — custom pieces via `+` (array union):

```rhai
fn hawk_moves(board, from, color) {
  bishop_moves(board, from, color) + knight_moves(board, from, color)
}
```

**Declarative** — via `pieces` in config (engine generates move functions automatically):

| Declarator | Description |
|---|---|
| `combine("X", "Y")` | Union of two piece move sets |
| `leaper([[dr,dc], ...])` | Jumps to fixed offsets (ignores blocking pieces) |
| `modify("X", #{ key: val })` | Standard piece with a modifier |

Available `modify` options:

| Key | Type | Effect |
|---|---|---|
| `max_steps` | `int` | Limit slide distance (e.g. `3` → moves at most 3 squares) |
| `jump_over` | `[String]` | Treat pieces of these types as transparent (jump over them) |

```rhai
pieces: #{
  "hawk":        combine("bishop", "knight"),
  "camel":       leaper([[3,1],[3,-1],[-3,1],[-3,-1],[1,3],[1,-3],[-1,3],[-1,-3]]),
  "lame_rook":   modify("rook",  #{ max_steps: 3 }),
  "super_queen": modify("queen", #{ jump_over: ["king"] }),
}
// No manual pseudo_moves needed for any of these.
```

---

## Multi-Board Variants

Set `count` in the board config. Coords with `board_index` address the right board.

```rhai
board: #{ type: "rectangle", rows: 8, cols: 8, count: 2 }

let piece = board_get(state.board, Coords(0, 0, 1));  // board 1, top-left
```

---

## Reserve Pile

Enable with `reserve_pile: true` in config. The reserve is indexed by player:

```rhai
state.reserve[player_index]          // → [Piece]
reserve_add(reserve, player, piece)  // → new reserve
reserve_remove(reserve, player, piece_type) // → new reserve (removes first match)
```

---

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Type constructors | PascalCase | `Coords(...)`, `King("white")`, `Move(...)`, `Winner(0)` |
| Engine helper functions | snake_case | `board_get(...)`, `ray(...)`, `xray(...)` |
| Script-local functions | snake_case | `fn legal_moves(state, player)` |
| State fields | snake_case | `state.en_passant`, `state.castle_rights` |

---

## Versioning

`api_version` is an **integer**. The engine maintains handlers for all known versions.
A script with an unknown `api_version` is rejected at load time with a clear error.

Additive changes (new optional helpers, new optional config fields) do **not** bump the
version. Breaking changes (renamed functions, changed signatures) require a new version.

---

## Complete Minimal Example

```rhai
fn config() {
  #{
    api_version: 1,
    name: "Minimal Chess",
    version: "1.0.0",
    min_players: 2,
    max_players: 2,
    board: #{ type: "rectangle", rows: 8, cols: 8 },
  }
}

fn init(player_count) {
  #{
    board:     standard_start_position(),  // engine helper
    turn:      0,
    game_over: (),
  }
}

fn apply(state, player, action) {
  if player != state.turn { throw "not your turn"; }
  if action.type != "move"  { throw "only moves allowed"; }

  let board = board_move_piece(state.board, action.from, action.to);
  let next  = (state.turn + 1) % 2;
  #{ ...state, board: board, turn: next }
}
```
