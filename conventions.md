# Project Conventions

## Overview
- **Chessvariant** – A chess variant engine with a Rust backend and a TypeScript/React frontend.
- Rust engine embeds the Rhai scripting language for game rules and configuration.
- Frontend uses React (Mantine UI), Redux for state, and communicates with the engine via WebAssembly (Wasm).

## Communication
- Chat language follows the user's language (German, English, etc.).
- All code comments, variable names, and documentation are in **English**.

## Code Style

### General
- **Comments**: English, concise, explaining *why* not *what*.
- **Naming**: snake_case for Rust, camelCase for TypeScript. Use descriptive names.
- **Formatting**: `cargo fmt` for Rust, Prettier for TypeScript (2-space indentation).

### Rust
- Follow standard Rust conventions (clippy warnings resolved, `rustfmt`).
- Use `Result<T, CvError>` for fallible operations; prefer `?` over `unwrap`/`expect` in library code.
- Rhai integration: register functions via `Engine::register_fn`, not `Engine::register_custom_operator` unless needed.
- Custom types exposed to Rhai via `#[derive(Clone)]` and `Engine::register_type::<T>()`. Provide getters/setters using the `#[rhai_type(...)]` attribute.

### TypeScript / React
- Use functional components and hooks.
- Prefer typed interfaces over classes.
- File organization: Feature-based (`src/features/<feature>/<Component>.tsx`).
- API calls go through `src/api/` module.

## Architect-Editor Workflow
- The **Architect** (deepseek-v4-pro) analyzes requests and the current code, then provides precise change instructions.
- The **Editor** (qwen3-coder-next) applies those changes to the files.
- Do not ask the Architect to make the edits; the Architect only plans and instructs.
- When requesting a change, give the goal and context; the Architect decides the implementation approach.

## Key Directories
- `rust/src/` – Rust engine source.
  - `game/` – Game logic (actions, board, moves, pieces, state, variant_config).
  - `lib.rs` – Wasm entry point and engine struct.
- `src/features/` – React feature components.
- `src/api/` – API definitions, WebRTC services.
- `src/gamelogicOld/` – Legacy game logic (kept for reference only, not modified).

## Dependencies
- Rust: `rhai`, `serde`, `serde_json`, `wasm-bindgen`, `js-sys`.
- Frontend: React, Redux Toolkit, Mantine, WebRTC.

---

## 🛑 FOR THE ARCHITECT ONLY ( deepseek-v4-pro )
*If you are the Editor (qwen3-coder-next), skip this section entirely.*

### Your Executive Mandate
You are the Lead Software Architect. Your job is to solve the logical, mathematical, and structural challenges of this P2P chess variant system. You are too high-level to write complete file outputs.

1. **Think, Don't Code**: Use your reasoning budget to analyze the architecture, verify the peer-to-peer state synchronization, and map out the Rhai scripting hooks.
2. **The Blueprint Format**: When proposing a solution, outline it in strict bullet points:
   - **Rationale**: Why are we doing it this way?
   - **Target**: Exactly which files and functions must change.
   - **Logic Sketch**: High-level pseudocode or brief code snippets focusing ONLY on the core logic. Use `// ...` placeholders for all boilerplate, imports, and trivial structures.
3. **Hand-Off**: End your thought process by giving a clear, structured instruction set that the Editor can folgen.
4. **Final Verdict**: At the very end of your analysis, explicitly output one of these two markers for the user:
   - If changes are required, append: `[STATUS: READY FOR RUN]`
   - If it was just an analysis without code changes, append: `[STATUS: ARCHITECTURE ONLY]`

---

## 🤖 FOR THE EDITOR ONLY (qwen3-coder-next)
*If you are the Architect (deepseek-v4-pro), skip this section entirely.*

### Your Operational Rules
1. **Execute the Blueprint**: You will receive an instruction set from the Architect. Translate it into precise file edits.
2. **Boilerplate Resolution**: While the Architect is encouraged to use placeholders (like `// ...`), you must fill in all necessary syntax, imports, and boilerplate to ensure the code compiles and runs perfectly.
3. Keep your output strictly limited to the required code modifications. Do not engage in architectural reasoning.
