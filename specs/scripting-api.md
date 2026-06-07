# Chess Variant Scripting API

**Single Source of Truth** for the Rhai scripting interface.
All agents (Plan, Build) MUST reference this document.

`api_version` in `config()` must be `1`.

## Conventions

| Rule | Applies to |
|------|------------|
| **snake_case** for all multi-word identifiers | Rhai map keys, script-defined function names (`valid_moves`, `handle_action`), config fields, JSON wire format |
| **lowercase** for single-word identifiers | Primitive field names, discriminator values (`"move"`, `"board"`) |
| **PascalCase** for engine type constructors | `Move`, `SelectPiece`, `Coords`, `ReserveCoords`, `Piece`, `Player`, `InProgress`, `Winner`, `Draw` — idiomatic like Rust enum variants; these are the only non-snake_case callables |
| **Data fields** (`Piece.data`, `Player.data`, `state.data`) are **free-form** Rhai maps — keys pass through unchanged, no validation | `Piece("white","king")`, `player["color"]`, `state["turn"]` |

The engine serialization layer (`#[serde(rename_all = "snake_case")]`) ensures **all** engine→frontend JSON uses snake_case.
When the frontend receives e.g. `{ piece_type: "king", board_index: 0, winning_team: 1 }`, every field name matches the convention exactly.
A casing mismatch is a **compile error** (TypeScript) or a **Zod validation error** (runtime) — never a silent rendering failure.

---

## 1. Data Model

These are the objects the engine passes into the script functions in Section 2.

### State

The engine passes `state` as a typed struct with **property access** for well-known fields and **indexer access** (`state["key"]`) for variant-defined data.

| Access | Fields | Example |
|--------|--------|---------|
| **Property** | `board`, `players` | `state.board`, `state.players` |
| **Indexer** | `turn`, `castling_rights`, `en_passant`, … | `state["turn"]`, `state["castling_rights"]` |

Indexer reads/writes go directly to `state.data` (opaque to Rust). There is no `outcome` field — game-over is determined solely by `derive_game_progress()`.

Scripts update state with individual assignments and return it:
```rhai
state.board = new_board;
state["turn"] = next;
return state;
```

### Player

The engine passes each player as the **same map the script returned in `setup_players()`'s `players` array**, looked up by `id`. Whatever fields `setup_players` stored are visible here.

| Access | Fields | Example |
|--------|--------|---------|
| **Property** | `id`, `name`, `team`, `home_board` | `player.id`, `player.team` |
| **Indexer** | variant data (`color`, board assignments, …) | `player["color"]` |

A typical player map: `#{ id, name, team, home_board?, orientation?, data? }`. Color and board assignments live in `data` and are read via `player["color"]`.

### Piece

| Access | Fields | Example |
|--------|--------|---------|
| **Property** | `type`, `color` | `piece.type`, `piece.color` |
| **Indexer** | variant data | `piece["key"]` |

Constructed with `Piece(color, type)`.

### Coords

An **opaque Rhai type** with property getters only. Constructed with `Coords(r, c)` / `Coords(r, c, board)` (board squares) or `ReserveCoords(i)` (reserve slots).

| Getter | Board square | Reserve slot |
|--------|--------------|--------------|
| `.type` | `"board"` | `"reserve"` |
| `.row` | row (i32) | `0` |
| `.col` | col (i32) | `0` |
| `.board_index` | board index (i32) | board index (i32) |
| `.index` | `0` | slot index (i32) |

### GameProgress

Returned by `derive_game_progress()`. Constructed via `InProgress()`, `Draw()`, or `Winner(team_id)`. There is no `outcome` field in state.

| Variant | Rhai constructor | JSON |
|---------|-----------------|------|
| `InProgress` | `InProgress()` | `{ "progress": "in_progress" }` |
| `Draw` | `Draw()` | `{ "progress": "draw" }` |
| `Decisive` | `Winner(team_id)` | `{ "progress": "decisive", "winning_team": 0 }` |

`Winner(team_id)` takes a **team ID** (from `state.players[].team`), never a player ID.

---

## 2. Script Functions

| Function | Required | Signature |
|----------|----------|-----------|
| `config()` | YES | `() -> #{}` |
| `setup_players(variant_config, player_count)` | YES | `(VariantConfig, i32) -> #{}` |
| `init(variant_config, setup)` | YES | `(VariantConfig, #{}) -> #{board, data}` |
| `valid_moves(state, player)` | YES | `(State, Player) -> [Move]` |
| `derive_game_progress(state, all_valid_moves)` | YES | `(State, [#{player, moves}]) -> GameProgress` |
| `handle_action(state, player, action)` | YES | `(State, Player, Action) -> State` |
| `derive_ui(state, player)` | optional | `(State, Player) -> #{}` |

### `config()`

Returns the variant configuration map.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `api_version` | i32 | YES | Must be `1` |
| `name` | string | YES | Variant display name |
| `version` | string | YES | Variant script version |
| `colors` | [string] | YES | Player color identifiers |
| `allowed_player_count` | `i32` \| `[i32]` \| `#{min: i32, max: i32, step?: i32}` | YES | Exact count, list of allowed values, or ranged constraint |
| `board` | #{type,rows,cols,count?,disabled_rects?} | YES | Board layout config |

### `setup_players(variant_config, player_count)`

Returns the player roster and optional team configurations. Called once during engine initialisation, before `init()`.

```rhai
#{
    players: [   // mandatory — must be a non-empty array
        #{
            id: i32,                  // mandatory
            name?: string,            // optional
            home_board?: i32,         // optional (default 0)
            data?: #{},               // optional
            team?: i32,               // optional (default 0)
            orientations?: [          // optional — per-board overrides
                #{ board: i32, orientation: string },
            ],
        },
    ],
    teams?: [   // optional
        #{ id: i32, orientations: [#{ board: i32, orientation: string }] },
    ],
}
```

**`variant_config`** is a typed Rhai custom type with property access:
- `config.name` — variant display name (string)
- `config.version` — script version (string)
- `config.api_version` — API version (i32)
- `config.colors` — player color identifiers (array of strings)
- `config.board` — board layout: `.rows`, `.cols`, `.count` (all i32)

**Orientation values:** `"normal"` | `"flipped"` | `"clockwise"` | `"counterclockwise"`

**Orientation is resolved per-board during init.** For each board, the engine resolves:

1. `player.orientations` array entry matching the board (explicit, per-board)
2. `teams[player.team].orientations` entry matching the board
3. Default: team 0 → `"normal"`, team 1 → `"flipped"`, others → `"normal"`

The resolved `orientations` array (one entry per board) is stored in the engine and available via `playersJson()`.

### `init(variant_config, setup)`

Returns the initial board and variant-specific data. Receives the `variant_config` (same typed object) and the `setup` map returned by `setup_players()`. The engine already extracted `players` and `teams` from `setup` — this function only provides the board and game data.

```rhai
#{
    board: Board,
    data: #{
        // variant-specific keys (turn, castling_rights, en_passant, turn_order, reserves, …)
    },
}
```

The `board` can be a single `BoardState` or an array of `BoardState` for multi-board variants (e.g. Bughouse). The `data` map becomes `state.data` and is accessed via indexer syntax: `state["turn"]`, `state["castling_rights"]`.

The engine injects `teams` from `setup_players()` into `data["teams"]` so scripts can access `state["teams"]` as before.

**Standard 1v1** — using player-level orientations directly:
```rhai
fn setup_players(config, player_count) {
    #{
        players: [
            #{ id: 0, name: "White", team: 0, orientations: [#{ board: 0, orientation: "normal"  }], data: #{ color: "white" } },
            #{ id: 1, name: "Black", team: 1, orientations: [#{ board: 0, orientation: "flipped" }], data: #{ color: "black" } },
        ]
    }
}

fn init(config, setup) {
    #{
        board: engine::standard_start_position(),
        data: #{ turn: 0, castling_rights: #{ wk: true, wq: true, bk: true, bq: true }, en_passant: () },
    }
}
```

Piece definitions are **not** part of state — see [Script-Level Declarations](#3-script-level-declarations).

### `valid_moves(state, player)`

Returns all legal `Move` actions for the given player.
**Only `Move` actions** — no `SelectPiece`, `Interact`, or `Cancel`. Returns `[]` if the player has no legal moves.

```rhai
fn valid_moves(state, player) {
    if player.id != state["turn"] { return []; }

    let color = player["color"];
    let candidates = [];
    for r in 0..8 {
        for c in 0..8 {
            let from = Coords(r, c);
            let piece = engine::board::get(state.board, from);
            if piece != () && piece.color == color {
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

- Uses a script-level `get_pseudo_dests()` helper; legality is delegated to `handle_action`.
- **Rhai COW semantics:** `handle_action(state, player, m)` receives a copy-on-write clone of `state`; the original `state` in `valid_moves` is never mutated, making the `try/catch` pattern safe.
- **try/catch caveat:** The `catch` block catches all `throw` calls from `handle_action` (e.g. `"not your turn"`, `"move leaves king in check"`), but also silently swallows any script errors. For debugging, add `log::error(err)` inside the `catch` block during development.

### `derive_game_progress(state, all_valid_moves)`

Called after `valid_moves` has been computed for **all** players. Returns a [`GameProgress`](#gameprogress) value directly (no `bool`, no `outcome` shortcut) — this function is the single source of truth for game-over.

```rhai
fn derive_game_progress(state, all_valid_moves) {
    for entry in all_valid_moves {
        if entry.moves.len > 0 { return InProgress(); }
    }
    Draw()
}
```

The function **must** be defined in every script. The engine returns an error if it is missing — there is no fallback.

### `handle_action(state, player, action)`

The single action reducer. Dispatches on `action.type`.

**Contract:** `handle_action` is responsible for ALL legality enforcement:
- Turn order, piece ownership, no self-capture
- **King safety** — use a script-level `is_in_check()` after applying the move

```rhai
fn handle_action(state, player, action) {
    let color = player["color"];

    if action.type == "move" {
        if state["turn"] != player.id { throw "not your turn"; }
        let piece = engine::board::get(state.board, action.from);
        if piece == () { throw "no piece at source square"; }
        if piece.color != color { throw "not your piece"; }

        let new_board = engine::board::move_piece(state.board, action.from, action.to);

        // King safety
        let enemy_colors = state.players
            .filter(|p| p.team != player.team)
            .map(|p| p["color"]);
        if is_in_check(new_board, color, enemy_colors, state) {
            throw "move leaves king in check";
        }

        state.board = new_board;
        state["turn"] = /* next player */;
        return state;
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

**Optional** (returns `#{}` if absent). Pure function of `state` and the player map; returns the [UI elements](#5-ui-element-types) for the given player.

---

## 3. Script-Level Declarations

Beyond the functions above, a script may declare top-level `let` values. After `run_ast_with_scope()` evaluates the script, the engine extracts **all** top-level scope variables and registers them as a global module, making them visible to every function call without being stored in game state. This is also what lets closures inside those values (e.g. `condition: |s,f,t| ...`) resolve engine helpers.

This mechanism is generic — `PIECE_DEFS` is simply the **conventional name** used here. Omission is fine: scripts that don't need it just skip it.

### The `PieceDefs` type

A Rust-side custom type exposed as a global constructor `PieceDefs()`. Replaces the old string-keyed `PIECE_DEFS` map. Stores per-piece movement components with built-in color-aware lookup that returns `()` (Rhai's unit / `None` equivalent) when nothing matches.

**Constructor:**
- `PieceDefs()` — empty collection
- `PieceDefs([entry, ...])` — from an array of entry maps

**Entry map format** (`#{ type, color?, def }`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | YES | Piece type, e.g. `"king"`, `"pawn"` |
| `color` | string | optional | Color identifier; if absent, entry applies to all colors |
| `def` | `[component]` | YES | Array of movement components (see below) |

**Component map format** (`#{ type, offsets?, dirs?, condition? }`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"jump"` or `"slide"` | YES | Movement class |
| `offsets` | `[[i32,i32]]` | for `"jump"` | Leap vectors |
| `dirs` | `[[i32,i32]]` | for `"slide"` | Direction vectors |
| `condition` | `\|s, f, t\| -> bool` | optional | Filter destinations via `engine::board::get` and state keys |

**Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `get(piece)` | `(Piece) -> [component] \| ()` | Lookup by piece; precedence: color-specific → type-only → `()` |
| `get(selector)` | `(#{type, color?}) -> [component] \| ()` | Lookup by explicit selector map |
| `insert(type, def)` | `(&str, [component])` | Set/overwrite color-agnostic definitions |
| `insert(type, color, def)` | `(&str, &str, [component])` | Set/overwrite color-specific definitions |

**Precedence:** `get(piece)` first looks for `(piece_type, piece_color)`, then falls back to `piece_type` alone. Returns `()` when nothing is defined. Type-only and color-specific entries for the same type are **mutually exclusive** — the constructor rejects mixed entries.

**Example:**

```rhai
let PIECE_DEFS = PieceDefs([
    // Color-agnostic: all colors share this definition
    #{ type: "king",   def: [#{ type: "jump", offsets: [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]] }] },
    #{ type: "queen",  def: [#{ type: "slide", dirs: [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] }] },
    #{ type: "rook",   def: [#{ type: "slide", dirs: [[0,1],[0,-1],[1,0],[-1,0]] }] },
    #{ type: "bishop", def: [#{ type: "slide", dirs: [[1,1],[1,-1],[-1,1],[-1,-1]] }] },
    #{ type: "knight", def: [#{ type: "jump", offsets: [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]] }] },

    // Color-specific: each color gets its own definition
    #{ type: "pawn", color: "white", def: [
         #{ type: "jump", offsets: [[-1, 0]],        condition: |s,f,t| engine::board::get(s.board, t) == () },
         #{ type: "jump", offsets: [[-2, 0]],        condition: |s,f,t| f.row == 6 && engine::board::get(s.board, Coords(f.row-1, f.col)) == () && engine::board::get(s.board, t) == () },
         #{ type: "jump", offsets: [[-1,-1],[-1,1]], condition: |s,f,t| { let target = engine::board::get(s.board, t); let my = engine::board::get(s.board, f); target == () || target.color != my.color } },
    ]},
    #{ type: "pawn", color: "black", def: [
         #{ type: "jump", offsets: [[1, 0]],        condition: |s,f,t| engine::board::get(s.board, t) == () },
         #{ type: "jump", offsets: [[2, 0]],        condition: |s,f,t| f.row == 1 && engine::board::get(s.board, Coords(f.row+1, f.col)) == () && engine::board::get(s.board, t) == () },
         #{ type: "jump", offsets: [[1,-1],[1,1]],  condition: |s,f,t| { let target = engine::board::get(s.board, t); let my = engine::board::get(s.board, f); target == () || target.color != my.color } },
    ]},
]);

// Usage in get_pseudo_dests — no helper function needed:
fn get_pseudo_dests(board, from, state) {
    let piece = engine::board::get(board, from);
    if piece == () { return []; }
    let comps = PIECE_DEFS.get(piece);   // ← color-aware lookup, returns () if unknown
    if comps == () { return []; }
    // ... dispatch comp.type to engine::moves::jump / slide ...
}
```

**4-player chess** — each color gets its own pawn direction:
```rhai
let PIECE_DEFS = PieceDefs([
    // ... standard pieces (king, queen, etc.) ...
    #{ type: "pawn", color: "yellow", def: [ /* moves south */ ] },
    #{ type: "pawn", color: "green",  def: [ /* moves west  */ ] },
    #{ type: "pawn", color: "red",    def: [ /* moves north */ ] },
    #{ type: "pawn", color: "blue",   def: [ /* moves east  */ ] },
]);
```

**Procedural construction** (alternative to the array literal):
```rhai
let defs = PieceDefs();
defs.insert("king", [#{ type: "jump", offsets: [[1,0],...] }]);
defs.insert("pawn", "white", [#{ type: "jump", offsets: [[-1,0]], ... }]);
defs.insert("pawn", "black", [#{ type: "jump", offsets: [[1,0]], ... }]);
```

---

## 4. Action Types

Every action has a `type` discriminator field. Unused payload fields are `()`.

### `Move`

```rhai
Move(from, to)
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"move"` | Discriminator |
| `from` | `Coords` | Board square or `ReserveCoords(i)` |
| `to` | `Coords` | Destination board square |

Returned by `valid_moves`. Moves are compared by structural equality of their `from` and `to` fields. `piece` and `element_id` are `()`.

### `SelectPiece`

```rhai
SelectPiece(piece)
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"select_piece"` | Discriminator |
| `piece` | `Piece` | Chosen piece |

`from`, `to`, `element_id` are `()`.

### `Interact`

```rhai
Interact(element_id)
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"interact"` | Discriminator |
| `element_id` | `String` | UI element identifier |

`from`, `to`, `piece` are `()`.

### `Cancel`

```rhai
Cancel()
```

All payload fields (`from`, `to`, `piece`, `element_id`) are `()`.

---

## 5. UI Element Types

Returned by `derive_ui`.

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

## 6. Engine Flow

### Constructor

```
new StatelessChessvariantEngine(script)
→ compile(script) → AST
→ register_builtins() + register_engine_helpers()
→ run_ast_with_scope(scope, AST) — installs fn/let/const declarations into scope
→ extract all scope variables → register as global module   (see §3)
→ calls config() → validates api_version=1

.init(player_count)
→ validates player_count against allowed_player_count
→ calls setup_players(variant_config, player_count) → extracts players + optional teams
→ calls init(variant_config, setup) → extracts board + data
→ injects teams into data["teams"]
→ builds GameState from parts → returns ChessvariantEngine
```

### P2P Host → Peers

```
Host:
  StatelessChessvariantEngine::new(script)
  → .init(player_count) → setup_players() + init()
  → broadcasts setup (players + teams) to peers

Peer:
  StatelessChessvariantEngine::new(script)
  → .init_from_setup_json(setup_json) → skips setup_players(), runs init() with received setup
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

## 7. Built-in Modules

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
| `ray` | `(Board, Coords, [i32,i32]) -> [#{coords, piece}]` |
| `xray` | `(Board, Coords, [i32,i32]) -> [#{coords, piece}]` |
| `jump` | `(Board, Coords, [[i32,i32]]) -> [#{coords, piece}]` |

> **Note:** `jump`, `ray`, and `xray` in `engine::board` are **trace** functions — they report what is at each square without color filtering. For move generation (filtering out friendly pieces), use `engine::moves::jump` and `engine::moves::slide`.

### `engine::moves` — Pure-Geometry Move Generators

The engine provides **unbiased geometry helpers**. All piece-specific rules (pawn direction, capture conditions, en passant) are defined in the script via conditions (see the [`PieceDefs` type](#the-piece_defs-type)).

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
| `merge` | `(base: #{}, updates: #{}) -> #{}` | Shallow map merge (for sub-maps like castling_rights; not for state updates — use property/indexer assignments) |
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
| `InProgress()` | `GameProgress::InProgress` |
| `Draw()` | `GameProgress::Draw` |
| `Winner(team_id)` | `GameProgress::Decisive` (takes a team ID) |

See [Data Model](#1-data-model) for the property getters on `Coords` and the `GameProgress` JSON mapping.

### `log`

| Function |
|----------|
| `log::debug(msg)` |
| `log::info(msg)` |
| `log::warn(msg)` |
| `log::error(msg)` |

---

## 8. Board Orientation

| Value | Degrees | Description |
|-------|---------|-------------|
| `"normal"` | 0° | Board as-is (row 0 at top) |
| `"flipped"` | 180° | Upside-down |
| `"clockwise"` | 90° CW | Rotated clockwise |
| `"counterclockwise"` | 90° CCW | Rotated counter-clockwise |

---

## 9. Guarantees

| Guarantee | Enforcement |
|-----------|-------------|
| Move is legal | Engine calls `valid_moves(state, player)` via Rhai; move must be in returned list. |
| Non-Move actions are state-consistent | Script validates state conditions in `handle_action`. Engine passes them through. |
| UI element IDs unique | Engine throws on duplicate keys in `derive_ui` return. |
| State immutability | Engine never mutates state. Script owns all transitions via property (`state.board =`) and indexer (`state["turn"] =`) assignments. |
| Deterministic replay | `handle_action` is pure: same `(player, action)` → same state. |
| Game-over is terminal | Once `derive_game_progress` returns `Draw` or `Decisive`, the engine reads the result directly and stops calling script functions. |
| Piece definitions are script-owned | Engine provides only unbiased geometry helpers. All piece rules, conditions, and direction are in the script. |
