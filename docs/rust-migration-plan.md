# Rust Engine Migration Plan: API Spec Rewrite

## Source of Truth

- **New spec**: `specs/scripting-api.md`
- **Retired spec** (for reference): `specs/scripting-api-v1-retired.md`

This document maps the spec changes to concrete Rust code changes.
No backward compatibility — all old functions and concepts are removed.

---

## 1. Script Function Changes

### 1.1 `handle_action(state, player, action) → #{}` (replaces `on_move`)

**What changes**:
- Old: `on_move(state, player, from, to, piece)` — typed signature with 5 positional args
- New: `handle_action(state, player, action)` — generic reducer, dispatch on `action.type`

**Rust impact** (`lib.rs`):
- Replace `engine.call_fn("on_move", ...)` with `engine.call_fn("handle_action", ...)`
- Signature to call: `(state: Dynamic, player: PlayerId, action: Action) → Dynamic`
- The Action struct already has `.type`, `.from`, `.to`, `.piece` — need to add `.element_id` for `Interact` actions
- In `run_handle_move` / `run_submit_action`: extract `action.type` from the Action, validate via `valid_actions`, then pass the Action object directly to `handle_action`

### 1.2 `valid_actions(state) → [{player: Player, actions: [Action]}]` (replaces per-player)

**What changes**:
- Old: `valid_actions(state, player) → [Action]` — takes a player arg, returns actions for one player
- New: `valid_actions(state) → [{player, actions}]` — no player arg, returns ALL players

**Rust impact** (`lib.rs`):
- Change `compute_valid_actions` to call `valid_actions(state)` instead of `valid_actions(state, player)`
- Parse return as `Vec<rhai::Map>` where each entry has `"player"` (PlayerId) and `"actions"` (Array of Action)
- In `submitAction`: validate against the specific player's action list: `actions_by_player[player].contains(action)`
- Active players = entries with non-empty `actions` list
- Game over = ALL players have empty `actions` lists

### 1.3 `check_game_over(state)` — **REMOVED**

**What changes**:
- Old: Separate `check_game_over(state)` called by engine after every state change
- New: Script sets `state.outcome` inside `handle_action`; engine reads it when `valid_actions` returns all-empty

**Rust impact** (`lib.rs`):
- Remove `call_check_game_over()` method
- In `submitAction`: after `handle_action` returns, call `valid_actions(new_state)`. If all empty → read `state.outcome` (default: draw)
- Remove the `check_game_over` Rhai call from the engine flow entirely

### 1.4 `get_ui(state, player) → #{}` — **no closures**

**What changes**:
- Old: `get_ui` elements had `on_click`/`on_select` closures
- New: Pure data elements — all interactivity is via `Interact`/`SelectPiece` actions in `valid_actions`

**Rust impact** (`lib.rs`):
- Remove `cached_ui` field from `ChessvariantEngine` (no closures to cache)
- Remove `FnPtr` imports and all closure-extraction logic from `run_get_ui`
- `serialize_ui_to_json` becomes a pure serialization pass — no handler extraction
- Remove `run_ui_interaction` entirely — all interactions go through `submitAction`

### 1.5 `init(player_count) → #{}` — **no `active_players`/`game_over`**

**What changes**:
- Old: `init` returned `active_players` and `game_over` keys
- New: Active players derived from `valid_actions`; game outcome via `state.outcome`

**Rust impact** (`lib.rs`):
- Remove `populate_teams` logic that reads `active_players`
- After `init`, call `valid_actions(state)` to determine who is active
- `activePlayersJson()` now queries the cached `valid_actions` result
- No more `active_players` key in state — it's engine-internal, not from script

---

## 2. WASM Endpoint Changes

### 2.1 `engine.submitAction(player_json, action_json) → result_json` (replaces `handleMove` + `uiInteraction`)

**New method** replacing both old endpoints:
```rust
pub fn submit_action(&mut self, player_json: String, action_json: String) -> Result<String, CvError>
```

Flow:
1. Parse `player` and `action` from JSON
2. Validate: action must exist in this player's entry from `valid_actions(state)`
3. Call `handle_action(state, player, action)` → new state
4. Call `valid_actions(new_state)` → determine active players; if all empty → game over, read `state.outcome`
5. Call `get_ui(new_state, player)` → serialize UI data (no closures)
6. Return `{ valid_actions, ui, game_over }`

**Remove**: `handleMove`, `handle_move_js`, `ui_interaction_js`, `run_handle_move`, `run_ui_interaction`

### 2.2 `engine.validActionsJson() → string` (no player arg)

**What changes**:
- Old: `validActionsJson(player_json)` — per-player
- New: `validActionsJson()` — all players

**Rust impact**:
- Remove `player_json` parameter
- Call `valid_actions(state)` — returns `[{player, actions}, ...]`
- Serialize to JSON

### 2.3 `engine.activePlayersJson()` — **REMOVED**

Derived from `validActionsJson` — entries with non-empty `actions` lists are active.

### 2.4 `engine.reservePileJson()` — **REMOVED**

Reserve is now a `ReservePile` UI element returned by `get_ui`.

---

## 3. Struct & Type Changes

### 3.1 `Action` (in `game/actions.rs`)

Add new constructors and field:
```rust
pub struct Action {
    pub kind: String,           // "move", "select_piece", "interact"
    pub from: Option<Coords>,
    pub to: Option<Coords>,
    pub piece: Option<Piece>,   // used by "select_piece"
    pub element_id: Option<String>, // used by "interact"  ← NEW
}

impl Action {
    pub fn rhai_move(from: Coords, to: Coords) -> Self { ... }
    pub fn rhai_select_piece(piece: Piece) -> Self { ... }       // NEW
    pub fn rhai_interact(element_id: String) -> Self { ... }     // NEW
}
```

Register `SelectPiece` and `Interact` as Rhai constructors in `register_builtins`.

`Action` needs a `get_element_id` property for Rhai scripts to read `.element_id`.

### 3.2 `VariantConfig` (in `game/variant_config.rs`)

Remove these fields:
- `reserve_pile: bool`
- `check_protection: bool`
- `pieces: Option<Dynamic>`
- `promotion_pieces: Vec<String>`

Keep: `name`, `version`, `api_version`, `colors`, `allowed_player_count`, `board`

### 3.3 `ChessvariantEngine` (in `lib.rs`)

Remove fields:
- `cached_ui: rhai::Map` (no closures)
- `cached_valid_actions: Option<(String, Vec<Action>)>` → replace with `Option<Vec<PlayerActions>>`

New field:
```rust
pub(crate) cached_valid_actions: Option<Vec<PlayerActions>>,
```
Where:
```rust
struct PlayerActions {
    player: PlayerId,
    actions: Vec<Action>,
}
```

---

## 4. Module & Builtin Changes

### 4.1 Remove `engine::valid_actions` from helpers

In `modules/builtins.rs`:
- Remove `register_engine_helpers` registration of `engine::valid_actions`
- Remove `check_protection` parameter from the helpers module
- Remove `engine_valid_actions_impl` import

Scripts use `engine::is_square_attacked` and `engine::pseudo_moves` directly inside their own `valid_actions(state)`.

### 4.2 Add `engine::is_legal` helper (replaces `check_protection` config flag)

In `modules/builtins.rs` `register_engine_helpers`:
- Add `engine::is_legal(board, from, to, color)` function
- Logic: apply move to a temp board, check if king of `color` is attacked by opponent
  - Reuse existing `is_king_in_check` and `apply_move_to_board` from `engine_builtins.rs`

```rust
FuncRegistration::new("is_legal")
    .set_into_module(&mut m,
        move |board: BoardState, from: Coords, to: Coords, color: String| -> bool {
            let Some(from_bc) = from.as_board_coords() else { return false; };
            let Some(to_bc) = to.as_board_coords() else { return false; };
            let mut temp = board.clone();
            engine_builtins::apply_move_to_board(&mut temp, &from_bc, &to_bc);
            !engine_builtins::is_king_in_check(&temp, &color, &custom_pieces)
        },
    );
```

### 4.3 Remove `combine` from global constructors

In `lib.rs` `register_builtins`:
- Remove `engine.register_fn("combine", |p1, p2| ...)`

### 4.3 Remove `check_protection` from VariantConfig flow

In `lib.rs` `new()`:
- Remove `check_protection` from config parsing
- `register_engine_helpers` no longer passes config

### 4.4 New constructors

Register in `lib.rs` `register_builtins`:
```rust
engine.register_fn("SelectPiece", Action::rhai_select_piece);
engine.register_fn("Interact", Action::rhai_interact);
```

---

## 5. Changes by File

| File | Changes |
|------|---------|
| `rust/src/lib.rs` | Major rewrite: new `submitAction`, remove `handleMove`/`uiInteraction`/`check_game_over`; new `valid_actions` flow; remove `cached_ui`; new action validation against per-player lists |
| `rust/src/game/actions.rs` | Add `element_id` field, `rhai_select_piece`, `rhai_interact`, `get_element_id` property |
| `rust/src/game/variant_config.rs` | Remove `reserve_pile`, `check_protection`, `pieces`, `promotion_pieces` |
| `rust/src/modules/builtins.rs` | Remove `engine::valid_actions` registration, `check_protection` param |
| `rust/src/game/ui.rs` | Remove `MoveResult` (replaced by `SubmitActionResult`) — or simplify |
| `rust/src/game/engine_builtins.rs` | `engine_valid_actions_impl` can be removed (scripts build their own) |
| `rust/tests/variant_integration.rs` | Rewrite for new endpoints |
| `variants/*.rhai` | Rewrite all scripts to new API |
| `rust/tests/scripts/*.rhai` | Rewrite test scripts to new API |
| `specs/scripting-api-v1-retired.md` | Archived old spec (already done) |

---

## 6. Sequence

1. Add `element_id` to `Action`, add `SelectPiece`/`Interact` constructors
2. Update `VariantConfig` — remove obsolete fields
3. Implement `submitAction` endpoint with new `valid_actions` structure
4. Remove old endpoints (`handleMove`, `uiInteraction`, `check_game_over`)
5. Remove `cached_ui`, closure extraction, `FnPtr` usage
6. Update `validActionsJson` to no-arg, all-players format
7. Remove `activePlayersJson`, `reservePileJson`
8. Clean up modules (remove `engine::valid_actions`, `combine`, `check_protection`)
9. Rewrite test scripts and variant scripts
10. Test
