# Chess Variant Scripting API

**Version**: 2.0
**Single Source of Truth** for the Rhai scripting interface.
All agents (Plan, Build, Sonnet) MUST reference this document when working on engine/script features.

---

## 1. Philosophy

- **Script owns all state and logic.** The engine provides primitives (board ops, piece
  movement, coordinates) and dispatches interactions. The script decides what happens.
- **Scoped events.** No global event bus. Every interaction (move, button click,
  piece selection) has a typed, localized handler. Handlers are inline closures on
  the UI element or Action object that triggered them.
- **Every value is a native type.** No JSON parsing in scripts. `Coords`, `Piece`,
  `PlayerId` flow as typed values from engine to script and back.
- **UI is a pure function of state.** `get_ui(state, player)` returns what the
  player should see. Side-effect free. Callable anytime.

---

## 2. Script Lifecycle Functions

| Order | Function | Signature | Mandatory? | When Called |
|-------|----------|-----------|------------|-------------|
| 1 | `config()` | `() -> #{}` | **YES** | Engine construction |
| 2 | `init(player_count)` | `(i32) -> #{}` | **YES** | Engine construction |
| 3 | `valid_actions(state, player)` | `(#{}, PlayerId) -> [Action]` | NO (returns `[]` if absent) | Frontend requests legal moves |
| 4 | `on_move(state, player, from, to, piece)` | `(#{}, PlayerId, Coords, Coords, Piece) -> #{}` | **YES** | Player makes a move |
| 5 | `get_ui(state, player)` | `(#{}, PlayerId) -> #{}` | NO (returns `#{}` if absent) | After every state change; anytime on poll/refresh |
| 6 | `check_game_over(state)` | `(#{}) -> #{}` | NO | After every state change (auto-called by engine) |

There is **no** `handle_event`, `on_select`, `on_event`, or `on_drop` function.
There is **no** `on("name", handler)` registration.

---

## 3. State Shape

State is a Rhai `Map` (object literal `#{}`). The engine reads these keys:

```rhai
#{
    board: BoardState,           // native — one board or array of boards
    players: [                   // one entry per player
        #{ board: 0, color: "white", team: 0 },
        // ...
    ],
    active_players: [Player("white")],  // ordered turn queue
    game_over: (),               // () = not over; else Winner(idx), Winners(arr), or Draw()
    // ── Variants may add any keys ──
    pending_promotion: (...),    // optional, variant-specific
    reserve: [...],              // optional
    // ...
}
```

**Key rule**: The engine NEVER modifies any state key except `game_over` (set by
`check_game_over`). The script has full ownership of state.

---

## 4. `on_move` — The Move Handler

```rhai
fn on_move(state, player, from, to, piece) {
    // state   — current game state map (#{})
    // player  — PlayerId { board_index, color, team }
    // from    — Coords (board square or reserve slot)
    // to      — Coords (always a board square)
    // piece   — Piece { color, piece_type }
    //
    // Returns: new state map (#{})

    let board = board_move_piece(state.board, from, to);
    let state = merge(state, #{ board: board });
    end_turn(state)   // or however the variant advances turns
}
```

### Engine Behavior on Move

1. Frontend sends `handleMove(player_json, from_coords, to_coords, piece?)`
2. Engine reads the piece:
   - Board move (from.type == "board"): `board_get(state.board, from)`
   - Reserve drop (from.type == "reserve"): `piece` from the frontend call
3. Engine calls `on_move(state, player, from, to, piece)` → new state
4. Engine stores new state, **discards all previous UI handlers**
5. Engine calls `get_ui(new_state, player)` → extracts and stores handlers, serializes UI to JSON
6. Engine calls `check_game_over(new_state)` → may attach `game_over` to state

**There is no `on_drop`.** Reserve placements go through the same `on_move`.
The `from` coordinate's `.type` field distinguishes `"board"` from `"reserve"`.

---

## 5. `get_ui` — UI State

```rhai
fn get_ui(state, player) -> #{
    // Returns a MAP of UI elements keyed by element ID (string).
    //
    // Each value is a map with a `type` field and optional handler closures.
    //
    // The engine extracts handler closures and stores them in an internal
    // handler registry keyed by element ID.
    // The engine serializes non-closure fields to JSON for the frontend.
}
```

### Parameters

- `state` — current game state map
- `player` — the **PlayerId of the player asking**. Used to show different UI to
  different players (e.g. only the active player sees a promotion dialog).

### Return Value

A Rhai map. Keys are **stable string element IDs** (e.g. `"promo"`, `"draw_btn"`,
`"check_banner"`). The engine will use these IDs to dispatch UI interactions back
to the correct handler closure.

```rhai
fn get_ui(state, player) {
    #{
        promo: #{ type: "piece_selection", ... },
        check_banner: #{ type: "banner", ... },
        draw_btn: #{ type: "button", ... },
    }
}
```

### Call Semantics

- Called **after every state change** (after `on_move`, after any UI interaction handler)
- Also callable **anytime** (page refresh, UI poll) via dedicated WASM endpoint
- Must be a **pure function** of `(state, player)` — no side effects
- Returns `#{}` if there is nothing to show
- The engine **discards all stored handlers from the previous call** before invoking
  `get_ui`. Only handlers returned by the current `get_ui` call are valid.

---

## 6. UI Element Types

### 6.1 `Button`

A clickable button. When clicked by the player, the engine invokes the stored
handler closure.

```rhai
#{
    type: "button",
    label: "Offer Draw",
    on_click: |state| {
        merge(state, #{ draw_offered_by: current_player(state) })
    }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string `"button"` | YES | Discriminator |
| `label` | string | YES | Button text |
| `on_click` | closure `fn(state) -> #{}` | YES | Invoked when clicked. Receives current state, returns new state. |

The `on_click` closure is **stripped** from the JSON sent to the frontend.

### 6.2 `PieceSelection`

A choice dialog for selecting a piece (promotion, gating, etc.). Shows the available
pieces; the player picks one. The engine invokes the handler with the selected piece.

```rhai
#{
    type: "piece_selection",
    title: "Promote pawn",
    pieces: [
        Piece("white", "queen"),
        Piece("white", "rook"),
        Piece("white", "bishop"),
        Piece("white", "knight"),
    ],
    on_select: |state, piece| {
        let pp = state.pending_promotion;
        let board = board_set(state.board, pp.to, piece);
        merge(state, #{ board: board, pending_promotion: () })
    }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string `"piece_selection"` | YES | Discriminator |
| `title` | string | YES | Dialog title |
| `pieces` | array of `Piece` | YES | Selectable pieces (each with `.color` and `.type`) |
| `on_select` | closure `fn(state, piece) -> #{}` | YES | Invoked when player selects a piece. Receives current state and the chosen `Piece`. Returns new state. |

The `on_select` closure is **stripped** from the JSON sent to the frontend.

#### Gating "skip" (Seirawan)

To allow a player to decline gating, include a sentinel piece with `.type = "none"`:

```rhai
pieces: [
    Piece(player_color, "none"),      // "Skip gating"
    Piece(player_color, "hawk"),
    Piece(player_color, "elephant"),
],
```

The `on_select` handler checks `piece.type`:

```rhai
on_select: |state, piece| {
    let pg = state.pending_gate;
    if piece.type == "none" {
        // No piece placed — just end turn
        return end_turn(merge(state, #{ pending_gate: () }));
    }
    let board = board_set(state.board, pg.vacated, piece);
    end_turn(merge(state, #{ board: board, pending_gate: () }))
}
```

This keeps a single `PieceSelection` element type instead of needing a separate
`Button` + `PieceSelection` combination.

### 6.3 `Banner`

Non-interactive notification message.

```rhai
#{
    type: "banner",
    text: "White is in check!",
    style: "warning"   // "info" | "warning" | "error"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string `"banner"` | YES | Discriminator |
| `text` | string | YES | Banner message text |
| `style` | string | NO (default: `"info"`) | `"info"`, `"warning"`, or `"error"` |

No handler closure — banners cannot be interacted with.

---

## 7. Handler Model — Engine Perspective

### 7.1 Lifecycle

```
State change occurs (on_move returns, or UI handler returns)
    │
    ▼
Engine discards ALL previously stored handlers
    │
    ▼
Engine calls get_ui(state, player)
    │
    ▼
For each element in the returned map:
  - If element has on_click or on_select → store closure in handler_registry[element_id]
  - Strip closure fields → serialize rest to JSON → send to frontend
    │
    ▼
Frontend renders UI (no closures visible, only data)
    │
    ▼
Player interacts (e.g. clicks button with id "draw_btn")
    │
    ▼
Frontend calls engine.uiInteraction(player, element_id, value?)
    │
    ▼
Engine looks up handler_registry[element_id]
  - Button: calls handler(state) → new state
  - PieceSelection: calls handler(state, value) → new state
    │
    ▼
Engine stores new state → loop back to top (discard handlers, get_ui, ...)
```

### 7.2 Handler Storage

The engine maintains an internal `HashMap<String, StoredHandler>`:

```
handler_registry = {
    "promo"     → StoredHandler::Select(closure),
    "draw_btn"  → StoredHandler::Click(closure),
    // "check_banner" has no handler → not stored
}
```

This registry is **completely replaced** after every `get_ui` call. No handlers
persist across state changes.

### 7.3 Frontend-Visible JSON

After stripping closures, the frontend receives a JSON object keyed by element ID:

```json
{
  "promo": {
    "type": "piece_selection",
    "title": "Promote pawn",
    "pieces": [
      { "color": "white", "type": "queen" },
      { "color": "white", "type": "rook" },
      { "color": "white", "type": "bishop" },
      { "color": "white", "type": "knight" }
    ]
  },
  "draw_btn": {
    "type": "button",
    "label": "Offer Draw"
  },
  "check_banner": {
    "type": "banner",
    "text": "Check!",
    "style": "warning"
  }
}
```

Closures (`on_click`, `on_select`) are **never** included in the JSON.

---

## 8. `check_game_over`

```rhai
fn check_game_over(state) -> state
```

Same semantics as the current API. Receives state, may attach one of:

```rhai
state.game_over = Winner(player_index)     // single winner by player index
state.game_over = Winners(["white","red"]) // multiple winners by color
state.game_over = Draw()                   // draw
```

Returns the (possibly modified) state. If the function is not defined by the script,
the engine skips it (no-op).

Automatically called by the engine after **every** state change (after `on_move`,
after UI interaction handler, after page-refresh `get_ui` poll results in a state
change — though the poll itself does not trigger state changes).

---

## 9. `valid_actions`

```rhai
fn valid_actions(state, player) -> [Action]
```

Same semantics as the current API. Returns an array of `Action` objects built via
`Move(from, to)`. Each action has:

```
Action {
    type: "move",
    from: Coords,    // board coords or ReserveCoords(i)
    to: Coords,      // destination (board coords)
}
```

**Returns `[]`** when:
- The game is in a pending UI state (promotion, gating)
- The player is not active
- The game is over

If the function is not defined by the script, the engine returns an empty array.

---

## 10. Engine WASM Endpoints (Frontend–Engine Protocol)

### 10.1 Constructor

```
new ChessvariantEngine(script_content: string, player_count: number) → engine
```

Calls `config()` and `init(player_count)` internally. Validates player count.

### 10.2 Move

```
engine.handleMove(player_json: string, from_json: string, to_json: string, piece_json?: string) → result_json: string
```

1. Parses player, from, to, optional piece from JSON
2. If piece not provided: reads it via `board_get(state.board, from)`
3. Calls `on_move(state, player, from, to, piece)` → new state
4. Calls `get_ui(new_state, player)` → stores handlers, serializes UI
5. Calls `check_game_over(new_state)`
6. Returns JSON: `{ "ui": {...}, "game_over": null | {...} }`

### 10.3 UI Interaction

```
engine.uiInteraction(player_json: string, element_id: string, value?: string) → result_json: string
```

1. Looks up stored handler by `element_id`
2. For `Button` (on_click): calls `handler(state)` → new state
3. For `PieceSelection` (on_select): deserializes value as `Piece`, calls `handler(state, piece)` → new state
4. Calls `get_ui(new_state, player)` → stores handlers, serializes UI
5. Calls `check_game_over(new_state)`
6. Returns JSON: `{ "ui": {...}, "game_over": null | {...} }`

Throws if `element_id` is not in the handler registry (stale interaction, race condition
from rapid clicks — frontend should discard and re-poll).

### 10.4 UI Poll / Refresh

```
engine.getUiJson(player_json: string) → ui_json: string
```

1. Calls `get_ui(state, player)` → stores handlers, serializes UI
2. Returns JSON: `{ "ui": {...} }`

Does **not** modify state. Does **not** call `check_game_over`. Used for page
refresh or periodic UI polling.

### 10.5 State Queries (existing, unchanged)

```
engine.boardStateJson() → string
engine.activePlayersJson() → string
engine.playersJson() → string
engine.validActionsJson(player_json) → string
engine.reservePileJson() → string
engine.variantConfigJson() → string
engine.name() → string
```

### 10.6 Other (existing, unchanged)

```
engine.setLogLevel(level: string) → void
```

---

## 11. Complete Example — Minimal Chess

```rhai
fn config() {
    #{
        api_version: 1, name: "Chess", version: "2.0",
        colors: ["white", "black"], allowed_player_count: 2,
        board: #{ type: "rectangle", rows: 8, cols: 8 },
        check_protection: true,
        promotion_pieces: ["queen", "rook", "bishop", "knight"],
    }
}

fn init(player_count) {
    #{
        board: standard_start_position(),
        players: [
            #{ board: 0, color: "white", team: 0 },
            #{ board: 0, color: "black", team: 1 },
        ],
        active_players: [Player("white")],
        pending_promotion: (),
        game_over: (),
    }
}

fn valid_actions(state, player) {
    if state.pending_promotion != () { return []; }
    engine_valid_actions(state, player)
}

fn on_move(state, player, from, to, piece) {
    if !state.active_players.contains(player) {
        throw `${player.color} is not active`;
    }

    let board = board_move_piece(state.board, from, to);
    let state = merge(state, #{ board: board });

    if piece.type == "pawn" && to.row == promo_row(player.color) {
        return merge(state, #{
            pending_promotion: #{ player: player.color, to: to }
        });
    }

    end_turn(state)
}

fn get_ui(state, player) {
    if state.pending_promotion != ()
       && state.pending_promotion.player == player.color {
        return #{
            promo: #{
                type: "piece_selection",
                title: "Promote pawn",
                pieces: [
                    Piece(player.color, "queen"),
                    Piece(player.color, "rook"),
                    Piece(player.color, "bishop"),
                    Piece(player.color, "knight"),
                ],
                on_select: |state, piece| {
                    let pp = state.pending_promotion;
                    let board = board_set(state.board, pp.to, piece);
                    end_turn(merge(state, #{ board: board, pending_promotion: () }))
                }
            }
        };
    }
    #{}
}

fn end_turn(state) {
    let current = state.active_players[0];
    let next = Player(if current.color == "white" { "black" } else { "white" });
    merge(state, #{ active_players: [next] })
}

fn promo_row(color) {
    if color == "white" { 0 } else { 7 }
}

fn check_game_over(state) {
    for p in state.players {
        if board_find(state.board, Piece(p.color, "king")).len() == 0 {
            let winner_idx = 1 - p.board;  // other player's board index
            return merge(state, #{ game_over: Winner(winner_idx) });
        }
    }
    state
}
```

---

## 12. Complete Example — Seirawan Chess (Gating + Promotion)

```rhai
fn config() {
    #{
        api_version: 1, name: "Seirawan Chess", version: "2.0",
        colors: ["white", "black"], allowed_player_count: 2,
        board: #{ type: "rectangle", rows: 8, cols: 8 },
        check_protection: true,
        pieces: #{
            "hawk": combine("bishop", "knight"),
            "elephant": combine("rook", "knight"),
        },
        promotion_pieces: ["queen","rook","bishop","knight","hawk","elephant"],
    }
}

fn init(player_count) {
    #{
        board: standard_start_position(),
        players: [
            #{ board: 0, color: "white", team: 0 },
            #{ board: 0, color: "black", team: 1 },
        ],
        active_players: [Player("white")],
        hand: [
            #{ player: "white", held: ["hawk", "elephant"] },
            #{ player: "black", held: ["hawk", "elephant"] },
        ],
        gating_available: [
            #{ player: "white", cols: [0,1,2,3,4,5,6,7] },
            #{ player: "black", cols: [0,1,2,3,4,5,6,7] },
        ],
        pending_promotion: (),
        pending_gate: (),
        game_over: (),
    }
}

// ── Helpers ──────────────────────────────────────────────────

fn promo_row(color) { if color == "white" { 0 } else { 7 } }
fn opponent_color(c) { if c == "white" { "black" } else { "white" } }
fn back_rank(c) { if c == "white" { 7 } else { 0 } }

fn is_gating_square(color, r, c) {
    r == back_rank(color) && c >= 0 && c <= 7
}

fn col_in_gating(gating_available, player_name, col) {
    for p in gating_available {
        if p.player == player_name { return p.cols.contains(col); }
    }
    true
}

fn remove_col(gating_available, player_name, col) {
    let ga = gating_available;
    for p in ga {
        if p.player == player_name {
            p.cols = p.cols.filter(|c| c != col);
        }
    }
    ga
}

fn remove_from_hand(hand, player_name, piece_type) {
    let h = hand;
    for p in h {
        if p.player == player_name {
            let idx = p.held.index_of(piece_type);
            if idx >= 0 { p.held.remove(idx); }
        }
    }
    h
}

fn has_hand_piece(state, player_name, piece_type) {
    for p in state.hand {
        if p.player == player_name { return p.held.contains(piece_type); }
    }
    false
}

fn gate_pieces(state, player_color) {
    let pieces = [Piece(player_color, "none")];
    if has_hand_piece(state, player_color, "hawk") {
        pieces.push(Piece(player_color, "hawk"));
    }
    if has_hand_piece(state, player_color, "elephant") {
        pieces.push(Piece(player_color, "elephant"));
    }
    pieces
}

fn promotion_pieces_for(state, player_color) {
    let pieces = [
        Piece(player_color, "queen"),
        Piece(player_color, "rook"),
        Piece(player_color, "bishop"),
        Piece(player_color, "knight"),
    ];
    if has_hand_piece(state, player_color, "hawk") {
        pieces.push(Piece(player_color, "hawk"));
    }
    if has_hand_piece(state, player_color, "elephant") {
        pieces.push(Piece(player_color, "elephant"));
    }
    pieces
}

fn end_turn(state) {
    let c = state.active_players[0];
    let n = Player(if c.color == "white" { "black" } else { "white" });
    merge(state, #{ active_players: [n] })
}

// ── valid_actions ────────────────────────────────────────────

fn valid_actions(state, player) {
    if state.pending_promotion != () || state.pending_gate != () { return []; }
    engine_valid_actions(state, player)
}

// ── on_move ──────────────────────────────────────────────────

fn on_move(state, player, from, to, piece) {
    if !state.active_players.contains(player) {
        throw `${player.color} is not active`;
    }

    // Validate move legality
    let legal = engine_valid_actions(state, player)
        .filter(|a| a.from == from)
        .map(|a| a.to);
    if !legal.contains(to) { throw "illegal move"; }

    let board = board_move_piece(state.board, from, to);
    let state = merge(state, #{ board: board });

    // Promotion trigger
    if piece.type == "pawn" && to.row == promo_row(player.color) {
        return merge(state, #{
            pending_promotion: #{ player: player.color, to: to }
        });
    }

    // Gating trigger
    if is_gating_square(player.color, from.row, from.col) {
        let has_any = has_hand_piece(state, player.color, "hawk")
                   || has_hand_piece(state, player.color, "elephant");
        if has_any {
            let ga = remove_col(state.gating_available, player.color, from.col);
            return merge(state, #{
                pending_gate: #{ player: player.color, vacated: from },
                gating_available: ga,
            });
        }
        // Column permanently used — remove it
        let ga = remove_col(state.gating_available, player.color, from.col);
        return end_turn(merge(state, #{ gating_available: ga }));
    }

    end_turn(state)
}

// ── get_ui ───────────────────────────────────────────────────

fn get_ui(state, player) {
    let ui = #{};
    let player_color = player.color;

    // Promotion dialog
    if state.pending_promotion != ()
       && state.pending_promotion.player == player_color {
        ui.promo = #{
            type: "piece_selection",
            title: "Promote pawn",
            pieces: promotion_pieces_for(state, player_color),
            on_select: |state, piece| {
                let pp = state.pending_promotion;
                let hand = state.hand;
                if piece.type == "hawk" || piece.type == "elephant" {
                    hand = remove_from_hand(hand, pp.player, piece.type);
                }
                let board = board_set(state.board, pp.to, piece);
                end_turn(merge(state, #{
                    board: board,
                    hand: hand,
                    pending_promotion: (),
                }))
            }
        };
        return ui;
    }

    // Gating dialog
    if state.pending_gate != ()
       && state.pending_gate.player == player_color {
        let pieces = gate_pieces(state, player_color);
        // Only show dialog if there are actual choices (> "none")
        if pieces.len() > 1 {
            ui.gate = #{
                type: "piece_selection",
                title: "Gate a piece?",
                pieces: pieces,
                on_select: |state, piece| {
                    let pg = state.pending_gate;
                    let board = state.board;
                    let hand = state.hand;
                    if piece.type != "none" {
                        board = board_set(board, pg.vacated, piece);
                        hand = remove_from_hand(hand, pg.player, piece.type);
                    }
                    end_turn(merge(state, #{
                        board: board,
                        hand: hand,
                        pending_gate: (),
                    }))
                }
            };
        }
    }

    ui
}

// ── check_game_over ──────────────────────────────────────────

fn check_game_over(state) {
    for p in state.players {
        if board_find(state.board, Piece(p.color, "king")).len() == 0 {
            let winner_color = opponent_color(p.color);
            let winner_idx = state.players
                .filter(|q| q.color == winner_color)
                .map(|q| q.board)[0];
            return merge(state, #{ game_over: Winner(winner_idx) });
        }
    }
    state
}
```

---

## 13. Migration from `handle_event` (v1 API)

### What Goes Away

- `handle_event(state, player, event)` — removed
- `#{ state: ..., ui: [...] }` return shape — removed
- `on_select`, `on_event`, `on(type, handler)`, `on_drop` — never existed, never will

### What Replaces It

| Old Pattern | New Pattern |
|---|---|
| `handle_event(state, player, event)` returning `#{ state, ui }` | `on_move(state, player, from, to, piece)` returning bare state |
| `if event.type == "move" { ... }` | Engine dispatches directly to `on_move` — no dispatch code needed |
| `if event.type == "promote" { ... }` | `get_ui` returns `PieceSelection` with `on_select` closure |
| `if event.type == "gate" { ... }` | `get_ui` returns `PieceSelection` with `on_select` closure |
| `return #{ state: ..., ui: [...] }` | `on_move` returns state only. `get_ui` returns UI map separately. |
| UI elements as arrays `[{ type: "choice", ... }]` | UI elements as map keyed by stable IDs `#{ promo: #{ type: "piece_selection", ... } }` |
| `players: ["white"]` filter on UI elements | `get_ui(state, player)` — filter by `player` parameter directly |

### Migration Steps per Script

1. Rename `handle_event` → `on_move`. Remove the `event` parameter; add `from, to, piece`.
2. Delete all `if event.type == "promote"`, `if event.type == "gate"` branches.
   Move their logic into `get_ui` as `PieceSelection` elements with `on_select` closures.
3. Remove `#{ state, ui }` return wrapper. `on_move` returns bare `state`.
4. Add `get_ui(state, player)` function returning a map of UI elements.
5. Remove all `event.from`, `event.to` dynamic field access — parameters are now typed.
6. The script no longer calls `end_turn` inside a `check_game_over` —
   `check_game_over` is only for setting `game_over` on the state.

---

## 14. Engine Rust Functions (Reference)

### Built-in Primitives (all available to scripts)

| Function | Signature | Purpose |
|----------|-----------|---------|
| `board_get` | `(BoardState, Coords) -> Piece` | Read piece at coords. Returns `()` if empty. |
| `board_set` | `(BoardState, Coords, Piece) -> BoardState` | Place piece at coords (returns new board, immutable). |
| `board_move_piece` | `(BoardState, Coords, Coords) -> BoardState` | Move piece from→to (returns new board). |
| `board_find` | `(BoardState, Piece) -> [Coords]` | Find all coords with matching piece. |
| `board_rows` | `(BoardState) -> i32` | Board height. |
| `board_cols` | `(BoardState) -> i32` | Board width. |
| `board_count` | `(BoardState) -> i32` | Total number of pieces on board. |
| `ray` | `(BoardState, Coords, [i32,i32]) -> [{coords, piece}]` | Ray trace in direction. |
| `xray` | `(BoardState, Coords, [i32,i32]) -> [{coords, piece}]` | X-ray (through pieces). |
| `jump` | `(BoardState, Coords, [[i32,i32]]) -> [{coords, piece}]` | Knight-style jump moves. |
| `pawn_moves` | `(BoardState, Coords, String) -> [Coords]` | Pseudo-legal pawn moves. |
| `rook_moves` | `(BoardState, Coords, String) -> [Coords]` | Pseudo-legal rook moves. |
| `knight_moves` | `(BoardState, Coords, String) -> [Coords]` | Pseudo-legal knight moves. |
| `bishop_moves` | `(BoardState, Coords, String) -> [Coords]` | Pseudo-legal bishop moves. |
| `queen_moves` | `(BoardState, Coords, String) -> [Coords]` | Pseudo-legal queen moves. |
| `king_moves` | `(BoardState, Coords, String) -> [Coords]` | Pseudo-legal king moves. |
| `engine_valid_actions` | `(state, player) -> [Action]` | All legal moves (check-filtered if check_protection: true). |
| `is_square_attacked` | `(BoardState, Coords, String) -> bool` | Is a square attacked by a color? |
| `pseudo_moves` | `(BoardState, Coords, String, String) -> [Coords]` | Pseudo-moves for a piece type+color. |
| `merge` | `(base: #{}, updates: #{}) -> #{}` | Shallow merge two maps. |
| `combine` | `(String, String) -> #{}` | Declare combined piece (config only). |
| `standard_start_position` | `() -> BoardState` | 8×8 standard chess starting position. |

### Constructors

| Function | Returns | Usage |
|----------|---------|-------|
| `Coords(r, c)` | `Coords` | Board square (board_index 0). |
| `Coords(r, c, b)` | `Coords` | Board square on board `b`. |
| `ReserveCoords(i)` | `Coords` | Reserve slot `i` (type = "reserve"). |
| `Player("color")` | `PlayerId` | Player by color string. |
| `Player(board, "color")` | `PlayerId` | Player by board index and color. |
| `Piece("color", "type")` | `Piece` | Piece with color and type. |
| `Move(from, to)` | `Action` | Move action (for `valid_actions` return). |
| `Winner(idx)` | `Dynamic` | Game-over: single winner by player index. |
| `Winners(arr)` | `Dynamic` | Game-over: multiple winners by color strings. |
| `Draw()` | `Dynamic` | Game-over: draw. |

### Logging

| Function | Purpose |
|----------|---------|
| `log::debug(msg)` | Debug-level log message (only visible with log level debug). |
| `log::info(msg)` | Info-level log message. |
| `log::warn(msg)` | Warning-level log message. |
| `log::error(msg)` | Error-level log message. |

### Native Types (accessible in scripts)

| Type | Fields |
|------|--------|
| `Coords` | `.type` (string: `"board"` or `"reserve"`), `.row`, `.col`, `.board_index`, `.index` |
| `PlayerId` | `.board`, `.color`, `.team` |
| `Piece` | `.color`, `.type` (via `.piece_type` getter in Rhai) |
| `Action` | `.type`, `.from`, `.to` |
| `BoardState` | opaque — use board_* functions |
