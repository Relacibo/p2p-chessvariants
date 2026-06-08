# p2p-chessvariants

Chess variant engine with Rust backend (WASM) and TypeScript/React frontend.
Game rules are written in [Rhai](https://rhai.rs) scripts — no Rust changes needed
for new variants.

## Scripting

Variant authors write `.rhai` scripts defining piece movement, turn logic,
and UI elements. See **[specs/scripting-api.md](specs/scripting-api.md)** for
the full API reference (PieceDefs, `on_move`, `derive_ui`, etc.).

## Quick start

```bash
yarn install
yarn build        # compiles Rust→WASM + TypeScript + frontend bundle
yarn dev          # WASM build + Vite dev server (auto-rebuild on Rust changes)
yarn lint         # TypeScript + Rust checks
```

Open `http://localhost:5173/dev` for the development board with built-in
variant editor.

## Project structure

| Path | Purpose |
|------|---------|
| `rust/src/` | Engine: board, pieces, moves, state, Rhai integration |
| `variants/` | Rhai scripts (chess, bughouse, seirawan, 4-player) |
| `src/features/` | React components (chessboard, arena, variant-editor, lobby) |
| `specs/` | API specifications — **single source of truth** |
| `public/variants/` | Served copies of variant scripts |
