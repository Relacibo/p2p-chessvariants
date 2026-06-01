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
| `api_version` | i32 | YES | Must be `1` |
| `name` | string | YES | Variant display name |
| `version` | string | YES | Variant script version |
| `colors` | [string] | YES | Player color identifiers (e.g. `["white","black"]`) |
| `allowed_player_count` | i32 | YES | Exact player count (simplest form: a single number). Also accepts `[i32]` for discrete values or `#{ min, max, step }` for a range. |
| `board` | #{type,rows,cols,count?,disabled_rects?} | YES | Board layout config |

### `init(player_count)`

```
(i32) -> #{}
```

**Mandatory.** Returns the initial game state. Called once at engine construction.

The returned map must contain at least:

```rhai
#{
    board: Board,         // native — one board or array of boards
    players: [            // one entry per player
        #{ board: i32, color: string, team: i32 },
        // ...
    ],
    // ... any additional custom state keys
}
```

Variants may add any keys. There is **no** `active_players` key (derived at runtime
from `valid_actions`) and **no** `game_over` key (game ends when `valid_actions`
returns all-empty; the outcome is communicated via `state.outcome`).

The state returned here is also the starting point for `get_ui` — if you need
UI-related state (e.g. `state.pending_promotion`, `state.reserve`), initialise those
keys here.

### `valid_actions(state)`

```
(#{}) -> [#{player: Player, actions: [Action]}]
```

**Mandatory.** Returns an array — one entry per player — mapping each `Player` to
the list of legal actions they may submit right now.

```rhai
fn valid_actions(state) {
    [
        #{ player: Player(0, "white"), actions: [engine::Move(from, to), ...] },
        #{ player: Player(0, "black"), actions: [] },
        // one entry per player in state.players
    ]
}
```

- A player whose `actions` list is empty cannot act right now.
- The engine derives the active players from this array (entries with non-empty lists).
- Explicit turn tracking (`active_players`) is therefore not needed — it emerges
  from the action availability.
- Called after every `handle_action` and once after `init` to establish who acts
  first.
- **Must cover all players** in `state.players`. Missing players are treated as
  having no legal actions.
- When **every** player's `actions` list is empty the game is over. The engine
  reads `state.outcome` for the result (see `handle_action` below).

### `handle_action(state, player, action)`

```
(#{}, Player, Action) -> #{}
```

**Mandatory.** The single action reducer. Called when any player submits any action.

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | `#{}` | Current game state |
| `player` | `Player` | Player submitting the action (`.board`, `.color`, `.team`) |
| `action` | `Action` | The submitted action (see Section 2) |

Returns the new game state. Dispatch on `action.type`:

```rhai
fn handle_action(state, player, action) {
    if action.type == "move" {
        // action.from  : Coords
        // action.to    : Coords
    } else if action.type == "select_piece" {
        // action.piece : Piece
    } else if action.type == "interact" {
        // action.element_id : string
    } else if action.type == "cancel" {
        // no payload — abort pending action
    }

    // Signal game over by setting state.outcome before returning.
    // The engine reads this when valid_actions becomes all-empty.
    // if checkmate { state.outcome = engine::Winner(0); }
    // if draw      { state.outcome = engine::Draw();    }

    state
}
```

**Safety guarantee**: The engine validates that the submitted action is present in
the `actions` list for the submitting player in `valid_actions(state)` **before**
calling `handle_action`. The script does not need to re-validate legality.

**Game-over outcome**: When the script determines the game is ending (e.g. checkmate,
no legal moves next turn), it sets `state.outcome` to one of the engine-provided
outcome values before returning. The engine reads `state.outcome` once
`valid_actions` returns all-empty:

| Constructor | Meaning |
|-------------|---------|
| `engine::Winner(player_index)` | Single winner by player index |
| `engine::Winners(["white","red"])` | Multiple winners by color |
| `engine::Draw()` | Draw |

If `state.outcome` is not set when `valid_actions` goes all-empty, the engine
treats the result as a draw.

### `get_ui(state, player)`

```
(#{}, Player) -> #{}
```

**Optional** (returns `#{}` if absent). Returns UI elements for a specific player.

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | `#{}` | Current game state |
| `player` | `Player` | Player whose UI is being requested |

Returns a **map keyed by stable, unique string element IDs**. Each value is a
UI element map (see Section 3). The engine serializes the entire return value
to JSON for the frontend.

- **Pure data — no closures.** There are no `on_click` or `on_select` handlers.
  Interactions are expressed as actions in `valid_actions` instead.
- Called after every `handle_action` and on any UI poll/refresh.
- Must be a pure function of `state` and `player`.
- Returns `#{}` if there is nothing to show.
- **Element ID uniqueness**: The engine detects duplicate keys and throws an error.
  Use descriptive, namespaced IDs (e.g. `"promo_pick"`, `"reserve_pile"`,
  `"draw_offer_btn"`).

---

## 2. Action Types

Actions are submitted by players and validated against `valid_actions` before
`handle_action` is called. Every action has a `type` discriminator field.

### `Move`

```rhai
engine::Move(from, to)
// from : Coords  — board square or ReserveCoords(i)
// to   : Coords  — destination board square
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"move"` | Discriminator |
| `from` | `Coords` | Source square. `.type == "reserve"` for reserve drops |
| `to` | `Coords` | Destination square (always a board square) |

Reserve drops use `from = engine::ReserveCoords(i)`.

### `SelectPiece`

```rhai
engine::SelectPiece(piece)
// piece : Piece
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"select_piece"` | Discriminator |
| `piece` | `Piece` | The piece chosen by the player |

Used for promotion, gating, or any scenario where the player must choose a piece
type. If the player may abort, include `Cancel()` in `valid_actions` alongside the
`SelectPiece` actions.

**Auto-spawn behaviour**: The frontend automatically displays a piece selection
dialog when the player's `valid_actions` list contains at least one `SelectPiece`
action. The dialog lists all pieces from the `SelectPiece` actions (deduplicated
by `color` + `pieceType`). A cancel button is shown only when a `Cancel` action
is also present. The dialog hides automatically as soon as `valid_actions` no
longer contains any `SelectPiece` action.

Scripts should **not** return a `piece_selection` UI element from `get_ui` — the
dialog is fully driven by `valid_actions`.

### `Interact`

```rhai
engine::Interact(element_id)
// element_id : string
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"interact"` | Discriminator |
| `element_id` | string | ID of the UI element being activated |

A button is interactive if and only if the
corresponding `engine::Interact(element_id)` is present in the player's
`valid_actions` list.

### `Cancel`

```rhai
engine::Cancel()
// no arguments
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"cancel"` | Discriminator |

Used to abort a multi-step action sequence (e.g. promotion, gating) without
committing any state change. Only valid when returned by `valid_actions`.
See Section 4 for the pending-action pattern.

---

## 3. UI Element Types

Returned by `get_ui` as values in the element map. Elements are **pure data** —
there are no handler closures. All interactivity is expressed via `valid_actions`.

### `Button`

```rhai
#{
    type: "button",
    label: string,
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"button"` | YES | Discriminator |
| `label` | string | YES | Button text |

Clicking sends an `Interact(element_id)` action (where `element_id` is the map key
under which this element was returned by `get_ui`). The button is enabled only when
the corresponding `Interact` action is present in the player's `valid_actions`.

### `Banner`

```rhai
#{
    type: "banner",
    text: string,
    style: "info" | "warning" | "error",   // default: "info"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"banner"` | YES | Discriminator |
| `text` | string | YES | Banner message |
| `style` | string | NO | `"info"`, `"warning"`, or `"error"` |

Non-interactive. No corresponding action type.

### `ReservePile`

```rhai
#{
    type: "reserve_pile",
    pieces: [Piece, ...],
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"reserve_pile"` | YES | Discriminator |
| `pieces` | array of `Piece` | YES | Pieces currently in the reserve |

Displays the player's reserve. Pieces in the reserve can be dragged/clicked to
generate `Move(ReserveCoords(i), to)` actions; these must be present in
`valid_actions` to be legal. The script controls if, when, and how the reserve
is shown via `get_ui`.

---

## 4. Action Flow & Turn Sequences

### Turn as an Action Sequence

A **turn** is not a single move but a sequence of `(player, action)` pairs that
advance the game from one state to the next stable point. The engine records the
full sequence for network sync and replay.

Example — pawn promotion in Crazyhouse:

```
Turn record:
  1. ("white", Move(e7 → e8))          // pawn reaches promotion square
  2. ("white", SelectPiece(queen))     // white picks the promotion piece
```

After step 1, `valid_actions(state)["white"]` contains four `SelectPiece` actions
and `valid_actions(state)["black"]` is empty — so white must act again before black
can move. After step 2, it is black's turn.

**Replay**: submit each `(player, action)` pair in the recorded order. Because
`handle_action` is a pure function of `(state, player, action)`, replay is
deterministic.

### Pending-Action Pattern (no rollback needed)

Multi-step turns (promotion, gating, etc.) use a **pending** pattern. The first
action does NOT commit to the board — it merely records the intent in custom
state keys. Subsequent actions commit or cancel:

```rhai
fn handle_action(state, player, action) {
    if action.type == "move" && needs_promotion(state, action) {
        // DO NOT apply the move yet — store it as pending
        return merge(state, #{
            pending_move: action,
            pending: "promotion",
        });
    }
    if action.type == "select_piece" && state.pending == "promotion" {
        // Now commit: apply the stored move AND the chosen piece
        let b = engine::board::move_piece(state.board,
            state.pending_move.from, state.pending_move.to);
        b = engine::board::set(b, state.pending_move.to, action.piece);
        return merge(state, #{ board: b, pending: (), pending_move: () });
    }
    if action.type == "cancel" {
        // Abort: forget the pending move, return to stable state
        // Nothing was committed — no rollback needed
        return merge(state, #{ pending: (), pending_move: () });
    }
    // ...
}
```

```rhai
fn valid_actions(state) {
    if state.pending == "promotion" {
        // Only the current player may select or cancel
        return [
            #{ player: current, actions: [
                SelectPiece(Piece("white", "queen")),
                SelectPiece(Piece("white", "rook")),
                SelectPiece(Piece("white", "bishop")),
                SelectPiece(Piece("white", "knight")),
                Cancel(),                               // ← universal abort
            ] },
            #{ player: opponent, actions: [] },
        ];
    }
    // normal turn: only the player whose turn it is gets moves
    // ...
}
```

**Key property**: No board mutation occurs until the player commits. Cancel resets
the pending flags without needing a backup board or undo logic. The turn switch
happens automatically when `valid_actions` gives the next player non-empty actions.

### Engine Flow per Action

```
Player submits (player, action)
    │
    ▼
Engine validates: action ∈ valid_actions(state)[player]
    │  invalid → error returned, state unchanged
    ▼
handle_action(state, player, action) → new_state
    │  script may set new_state.outcome here
    ▼
valid_actions(new_state) → [{player, actions}, ...]
    │  all actions empty? → game over, read new_state.outcome for result
    ▼
get_ui(new_state, player) → UI data (serialized to JSON for frontend)
    │
    ▼
Return { valid_actions, ui, game_over } to frontend
```

---

## 5. Engine WASM Endpoints

All game logic runs in the Rust engine (WASM). The frontend is a thin
presentation layer.

### Constructor

```
new ChessvariantEngine(script_content: string, player_count: number) → engine
```

Calls `config()` and `init(player_count)`. Validates player count. Calls
`valid_actions(initial_state)` to establish the first active players.

### Submit Action

```
engine.submitAction(player_json, action_json) → result_json
```

1. Deserializes player and action.
2. **Validates**: action must be in the `actions` list for this player in `valid_actions(state)`. If not → error.
3. Calls `handle_action(state, player, action)` → new state.
4. Calls `valid_actions(new_state)` → determines active players.
5. If all actions empty → game over; reads `new_state.outcome` for result (default: draw).
6. Calls `get_ui(new_state, player)` → serializes UI data.
7. Returns `{ "valid_actions": [...], "ui": {...}, "game_over": null | {...} }`.

### Valid Actions

```
engine.validActionsJson() → string
```

Returns `[{"player": {...}, "actions": [...]}, ...]` for **all** players. No player argument.
Does not modify state.

### UI Poll / Refresh

```
engine.getUiJson(player_json) → string
```

Calls `get_ui(state, player)` → `{ "ui": {...} }`. Does not modify state.

### State Queries

```
engine.boardStateJson()    → string
engine.playersJson()       → string
engine.variantConfigJson() → string
engine.name()              → string
```

---

## 6. Built-in Modules (Rhai)

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
| `is_square_attacked` | `(Board, Coords, attacker_color: string) -> bool` | Is the square attacked by any piece of the given color? |
| `pseudo_moves` | `(Board, Coords, piece_type: string, color: string) -> [Coords]` | Pseudo-moves for a given piece type and color. |
| `is_legal` | `(Board, Coords, Coords, color: string) -> bool` | Would moving piece from→to leave the player's own king in check? `false` = illegal, `true` = legal. |
| `merge` | `(base: #{}, updates: #{}) -> #{}` | Shallow merge two maps. |
| `standard_start_position` | `() -> Board` | 8×8 standard chess starting position. |

Check-filtering for king safety is typically done with `is_legal` inside the
script's `valid_actions(state)`:

```rhai
fn valid_actions(state) {
    let result = [];
    for p in state.players {
        let mut actions = [];
        let all_squares = engine::board::find(state.board, Piece(p.color, ""))
            .filter(|c| board_get(state.board, c).color == p.color);
        for from in all_squares {
            let piece = engine::board::get(state.board, from);
            let dests = engine::moves::pawn(state.board, from, p.color)  // ... etc per type
                .filter(|to| engine::is_legal(state.board, from, to, p.color));
            for to in dests {
                actions.push(engine::Move(from, to));
            }
        }
        result.push(#{ player: p, actions: actions });
    }
    result
}
```

### `engine` — Constructors

| Function | Returns | Usage |
|----------|---------|-------|
| `Coords(r, c)` | `Coords` | Board square (board_index 0). |
| `Coords(r, c, b)` | `Coords` | Board square on board `b`. |
| `ReserveCoords(i)` | `Coords` | Reserve slot `i` (`.type == "reserve"`). |
| `Player("color")` | `Player` | Player by color string. |
| `Player(board, "color")` | `Player` | Player by board index and color. |
| `Piece("color", "type")` | `Piece` | Piece with color and type. |
| `Move(from, to)` | `Action` | Move action. |
| `SelectPiece(piece)` | `Action` | SelectPiece action. |
| `Interact(element_id)` | `Action` | Interact action (button activation). |
| `Cancel()` | `Action` | Abort multi-step sequence (no payload). |
| `Winner(idx)` | `Dynamic` | Game-over: single winner by player index. |
| `Winners(arr)` | `Dynamic` | Game-over: multiple winners by color strings. |
| `Draw()` | `Dynamic` | Game-over: draw. |
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
| `Action` | — | `.type`, `.from`\*, `.to`\*, `.piece`\*, `.element_id`\*, `.cancel`† |

\* Field presence depends on action type: `Move` has `.from`/`.to`; `SelectPiece`
has `.piece`; `Interact` has `.element_id`.
† `Cancel` has no payload fields — all fields are `()`.

---

## 7. Safety Guarantees

The Rust engine enforces these guarantees. Scripts can rely on them.

| Guarantee | Enforcement |
|-----------|-------------|
| Submitted action is legal | Engine validates action is in the player's `actions` list from `valid_actions(state)` **before** calling `handle_action`. |
| Only active players can act | A player can only submit actions when their `actions` list in `valid_actions` is non-empty. |
| UI element IDs are unique | Engine detects duplicate keys in `get_ui` return value and throws. |
| State immutability | Engine never modifies the state map. The script owns all state transitions. |
| Deterministic replay | `handle_action` is a pure function: replaying the same `(player, action)` sequence always reproduces the same state. |
| Game-over is terminal | Once `valid_actions` returns all-empty, the engine reads `state.outcome` and stops calling any script function. |
