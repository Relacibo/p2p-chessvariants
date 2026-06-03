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
  - `scripting-api.md` — Rhai scripting API v2 (`on_move`, `get_ui`, UI elements, handler model)

## Code Style

### General
- All code comments, variable names, and documentation are in **English**
- Chat language follows the user's language (German, English, etc.)

### Rust
- Follow standard Rust conventions (clippy warnings resolved, `rustfmt`)
- Use `Result<T, CvError>` for fallible operations; prefer `?` over `unwrap`/`expect`
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

**All UI elements returned by `get_ui()` belong in the PixiJS canvas, not as HTML/Mantine overlays.**

- `src/features/chessboard/PixiBoard.ts` (`rebuildReservePiles`, `rebuildUiElements`) — renders `reserve_pile`, `piece_picker`, `button`, `banner` inside PixiJS
- `src/features/chessboard/PixiChessboard.tsx` — React↔PixiJS bridge, passes `uiMap` to the board
- `src/features/chessboard/PieceSelectionDialog.tsx` — **DEPRECATED**: currently renders `piece_picker` as HTML overlay; must be migrated into `PixiBoard.ts`
- `DevBoardView.tsx` — must derive piece picker state from `uiMap` (already correct) but delegate ALL rendering to PixiJS (no HTML overlays)

**When implementing a new `get_ui` element type (or fixing rendering of existing ones):**
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

## Git Commits

- Commit messages in **English**, plain text, no prefix
- Group related changes logically; separate unrelated changes into different commits
- Never commit secrets
