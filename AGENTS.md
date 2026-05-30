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

## Bebop Schemas

Bebop schemas live in `src/api/bebop/schemas/protocols/schemas/`. After editing `.bop` files, regenerate with `yarn bebop`.

## Temporary Scripts

Always create and run temporary scripts inside `/tmp/`. Never litter the workspace root with utility scripts.

## Git Commits

- Commit messages in **English**, plain text, no prefix
- Group related changes logically; separate unrelated changes into different commits
- Never commit secrets
