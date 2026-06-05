# p2p-chessvariants Project

This is a chess variant engine with a Rust backend and TypeScript/React frontend. The engine embeds the Rhai scripting language for game rules and configuration.

## Build & Test

- **Build**: `yarn build` (compiles Rust to WASM, TypeScript, and bundles frontend)
- **Dev**: `yarn dev` (WASM + Vite dev server with auto-rebuild on Rust changes)
- **Lint**: `yarn lint` (TypeScript + Rust checks)
- **Bebop API**: `yarn bebop` (regenerates TypeScript types from schema)

Run `yarn lint:ts` after TypeScript changes, `yarn lint:rust` after Rust changes.

## Project Structure

- `rust/src/` — Rust engine source
  - `game/` — Game logic (actions, board, moves, pieces, state, variant_config)
  - `lib.rs` — Wasm entry point and engine struct
- `src/features/` — React feature components (feature-based organization)
- `src/api/` — API definitions, WebRTC services, Bebop schemas
- `src/gamelogicOld/` — Legacy game logic (reference only, do not modify)
- `specs/` — API specifications (single source of truth for interfaces)
  - `scripting-api.md` — Rhai scripting API v2 (`on_move`, `derive_ui`, UI elements, handler model)

## Code Style

### General
- All code comments, variable names, and documentation are in **English**
- Chat language follows the user's language (German, English, etc.)

### Rust
- Follow standard Rust conventions (clippy warnings resolved, `rustfmt`)
- Use `Result<T, CvError>` for fallible operations; prefer `?` over `unwrap`/`expect`
- **Never return sentinel values** (e.g. `Player::new_by_id(0)`, empty `Dynamic`). Use `Option<T>` or `Result<T>`.
- **Use `let else { return/continue }`** only for early exits where `?` is not available (e.g. pattern destructuring in loops).
- **Prefer `?`** over `let Some(x) = y else { return None }` when the function returns `Option` or `Result`.
- **No backward compat** — strictly ID-based lookups, no board+color fallbacks.
- **Rhai → JSON**: Use `serde_json::to_value(&dynamic)` via Rhai's built-in `serde` feature. No manual type-dispatch (`if value.is::<Map>() else if value.is::<Array>() ...`).
- **DRY helpers** for Rhai map access: extract `player_field_i32(map, key)` instead of repeating `.get().and_then().as_int().ok().unwrap_or(0)`.
- Rhai integration: register functions via `Engine::register_fn`, not `Engine::register_custom_operator` unless needed
- Custom types exposed to Rhai via `#[derive(Clone)]` and `Engine::register_type::<T>()`

### TypeScript / React
- Use functional components and hooks
- Prefer typed interfaces over classes
- API calls go through `src/api/` module
- Formatting: Prettier (2-space indentation)

## Layout Conventions

Every page component must call `useConfigureLayout` as its first hook:

```tsx
import useConfigureLayout from "../layout/hooks";

export default function MyPageView() {
  useConfigureLayout(() => ({ navPinned: true })); // or false
  // ...
}
```

- `navPinned: true` — sidebar always open on desktop (lobby, community, settings, home)
- `navPinned: false` — sidebar collapses on navigation (playground, login)

## Game UI Architecture

**All UI elements returned by `derive_ui()` belong in the PixiJS canvas, not as HTML/Mantine overlays.**

- `src/features/chessboard/PixiBoard.ts` (`rebuildReservePiles`, `rebuildUiElements`) — renders `reserve_pile`, `piece_picker`, `button`, `banner` inside PixiJS
- `src/features/chessboard/PixiChessboard.tsx` — React↔PixiJS bridge, passes `uiMap` to the board
- `src/features/chessboard/PieceSelectionDialog.tsx` — **DEPRECATED**: currently renders `piece_picker` as HTML overlay; must be migrated into `PixiBoard.ts`
- `DevBoardView.tsx` — must derive piece picker state from `uiMap` (already correct) but delegate ALL rendering to PixiJS (no HTML overlays)

**When implementing a new `derive_ui` element type (or fixing rendering of existing ones):**
- The visual representation lives in `PixiBoard.ts` (PixiJS sprites/graphics)
- Interaction (clicks/taps) is handled via PixiJS `pointerdown` events, NOT React `onClick`
- `DevBoardView.tsx` only wires the result (submits actions), never renders UI elements itself
- HTML overlays (`PieceSelectionDialog.tsx`) are temporary and must be eliminated

Bebop schemas live in `src/api/bebop/schemas/protocols/schemas/`. After editing `.bop` files, regenerate with `yarn bebop`.

## Temporary Scripts

Always create and run temporary scripts inside `/tmp/`. Never litter the workspace root with utility scripts.

## Error Handling

- **Never silence errors.** Do not write empty `catch` blocks, `.catch(() => {})`, or `catch { /* ignore */ }`.
- Every `catch` must at minimum `console.error(context, e)` with a descriptive context prefix (e.g. `"[lobby] auto-join failed"`).
- In Rust, never use `.unwrap()` or `.expect()` in library/engine code — propagate via `?` or return `Err(CvError::...)`.
- Silencing errors hides bugs and makes debugging impossible. Show errors to users where appropriate; always log them.

## No Sentinel Return Values (CRITICAL)

**Never return dummy/fallback values to mask failure or unimplemented logic.** Forbidden patterns:

- **Rust**: `Player::new_by_id(0)`, empty `Dynamic`/`Map`/`Array`, `0`/`-1`/`""` as error indicators, `Default::default()` as error sentinel.
- **TypeScript**: `null`/`undefined` returned silently, empty `[]`/`{}`/`""` as fallback for failures, `false` meaning "operation failed".

**Correct approaches (in order of preference):**
1. **Proper types**: `Option<T>` / `Result<T, E>` in Rust, typed errors or absence-aware returns in TypeScript. Propagate with `?`.
2. **`todo!()` / explicit throw**: If the logic is genuinely unimplemented and you don't know the right return value, use `todo!("description of what is needed")` in Rust, or `throw new Error("TODO: description")` in TypeScript. A crash with a clear message is **always** better than silent wrong behavior — a dummy value corrupts state in ways that are nearly impossible to debug.
3. **Never guess** a plausible-looking default.

## Git Commits

- Commit messages in **English**, plain text, no prefix
- Group related changes logically; separate unrelated changes into different commits
- Never commit secrets
