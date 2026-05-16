# Script API — Implementation Status

## Tier 1: Playable Game (`config` / `init` / `apply`) — ✅ Done

| Function | Status |
|---|---|
| `config()` / `init()` / `apply()` lifecycle | ✅ |
| `ChessvariantEngine::new()`, `apply()`, `state()` | ✅ |
| `Coords(row,col)`, `Coords(row,col,board_index)` | ✅ |
| `Piece(color,type)`, `King/Queen/Rook/Bishop/Knight/Pawn(color)` | ✅ |
| `board_get/set/move_piece/find/rows/cols/count/empty` | ✅ |
| `ray`, `xray`, `jump` | ✅ |
| `pawn/rook/knight/bishop/queen/king_moves` | ✅ |
| `Move(from,to)`, `Drop(piece,to)`, `Choose(tag,value)` | ✅ |
| `Winner(n)`, `Winners([n])`, `Draw()` | ✅ |
| `standard_start_position()` | ✅ |
| `Rect(r1,c1,r2,c2)`, `Rectangle(rows,cols)` | ✅ |
| `combine("X","Y")` — registered, stored in config | ✅ |
| `merge(base, updates)` — map-spread workaround | ✅ |

## Tier 2: Check Detection + Pseudo-Moves — ❌ Not yet implemented

| Function | Notes |
|---|---|
| `leaper([[dr,dc], ...])` | Config declarator: fixed-offset jumper |
| `modify("X", #{opts})` | Config declarator: standard piece with modifiers (`max_steps`, `jump_over`) |
| `engine_pseudo_moves(state, from)` | Fallback when `pseudo_moves` is partially overridden |
| `is_square_attacked(state, coords, by_color)` | Bool: is a square under attack? |
| `leaves_king_in_check(state, from, to)` | Bool: would this move expose the own king? |
| `engine_valid_actions(state)` | Core of Tier 3 — all legal actions for all active players |
| `engine_valid_actions_for(state, player)` | Same, scoped to one player (Bughouse) |

Also missing:
- **`pieces` config is not yet interpreted**: `combine`/`leaper`/`modify` are stored but the engine does not use them to auto-generate `pseudo_moves`.
- **`check_protection: true` is not yet enforced**: the flag is parsed but no move filter is applied.

## Tier 3: Reserve Pile (Bughouse / Crazyhouse) — ❌ Not yet implemented

| Function | Notes |
|---|---|
| `reserve_add(reserve, player, piece)` | Add a piece to a player's reserve |
| `reserve_remove(reserve, player, piece_type)` | Remove first matching piece from reserve |

## Docs fix needed

The "Complete Minimal Example" at the bottom of `docs/api.md` still uses the unsupported
spread syntax `#{ ...state, ... }` — needs to be updated to `merge(state, #{ ... })`.

## Suggested order of implementation

1. `leaper` + `modify` — register declarators (data only, straightforward)
2. `engine_pseudo_moves(state, from)` — call script's `pseudo_moves` if defined, else derive from `pieces` config
3. `is_square_attacked` + `leaves_king_in_check` — use `engine_pseudo_moves` internally
4. `engine_valid_actions` + enforce `check_protection`
5. `reserve_add` / `reserve_remove`
6. Fix the Minimal Example in `docs/api.md`
