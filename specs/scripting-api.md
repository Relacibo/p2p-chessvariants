# Chess Variant Scripting API

**Single Source of Truth** for the Rhai scripting interface.
All agents (Plan, Build) MUST reference this document.

`api_version` in `config()` must be `1`.

## Conventions

| Rule | Applies to |
|------|------------|
| **snake_case** for all multi-word identifiers | Rhai map keys, function names, config fields, JSON wire format |
| **lowercase** for single-word identifiers | Primitive field names, discriminator values (`"move"`, `"board"`) |
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

The engine passes each player as the **same map the script returned in `init()`'s `players` array**, looked up by `id`. Whatever fields `init` stored are visible here.

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
| `init(player_count)` | YES | `(i32) -> State` |
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

### `init(player_count)`

Returns the initial game state.

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
}
```

Piece definitions are **not** part of state — see [Script-Level Declarations](#3-script-level-declarations).

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
    }
}
```

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

Beyond the functions above, a script may declare top-level `let`/`const` values. After `run_ast_with_scope()` evaluates the script, the engine extracts **all** top-level scope variables and registers them as a global module, making them visible to every function call without being stored in game state. This is also what lets closures inside those values (e.g. `condition: |s,f,t| ...`) resolve engine helpers.

This mechanism is generic — there is no special `PIECE_DEFS` concept in the engine. `PIECE_DEFS` is simply the **conventional name** scripts use for their per-piece movement data. Omission is fine: scripts that don't need it (e.g. simple test scripts) just skip it.

### The `PIECE_DEFS` convention

```rhai
const PIECE_DEFS = #{
    "king": [...],
    "pawn:white": [...],
    // ...
};
```

Each key is `"{type}"` (all colors) or `"{type}:{color}"` (color-specific, takes precedence). Each value is an array of movement components:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"jump"` or `"slide"` | Movement class |
| `offsets` | `[[i32,i32]]` | Leap vectors (for jump) |
| `dirs` | `[[i32,i32]]` | Direction vectors (for slide) |
| `condition` | `\|s, f, t\| -> bool` (optional) | Filter destinations via `engine::board::get` and state keys |

Scripts feed these into [`engine::moves::jump`/`slide`](#enginemoves--pure-geometry-move-generators) to generate candidates, filter with conditions, then validate via king-safety checks.

**4-player chess** — each color gets its own pawn direction:
```rhai
const PIECE_DEFS = #{
    // ... standard pieces (king, queen, etc.) ...
    "pawn:yellow": [
        #{ type: "jump", offsets: [[1, 0]],        condition: |s,f,t| engine::board::get(s.board, t) == () },
        #{ type: "jump", offsets: [[2, 0]],        condition: |s,f,t| f.row == 1 && ... },
        #{ type: "jump", offsets: [[1,-1],[1,1]],  condition: |s,f,t| { /* enemy capture */ } },
    ],
    "pawn:green": [ /* moves west  */ ],
    "pawn:red":   [ /* moves north */ ],
    "pawn:blue":  [ /* moves east  */ ],
};
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
new ChessvariantEngine(script, player_count)
→ compile(script) → AST
→ register_builtins() + register_engine_helpers()
→ run_ast_with_scope(scope, AST) — installs fn/let/const declarations into scope
→ extract all scope variables → register as global module   (see §3)
→ calls config() → validates api_version=1
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

The engine provides **unbiased geometry helpers**. All piece-specific rules (pawn direction, capture conditions, en passant) are defined in the script via conditions (see the [`PIECE_DEFS` convention](#the-piece_defs-convention)).

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
