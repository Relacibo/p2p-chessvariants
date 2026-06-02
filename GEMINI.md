# Gemini Project Instructions for P2P Chessvariants

## Protocols & Submodules
- **Bebop Protocol Definitions:** The Bebop schema definitions (`*.bop` files) are located in a separate repository that is integrated as a **Git submodule** (under `src/api/bebop/schemas/protocols/`).
- Whenever you make changes to or read from the protocol definitions, remember that you may need to commit and push changes in the submodule repository first, and then update the submodule reference in the main repository.
- **Script Etiquette:** Whenever you need to write temporary scripts (e.g. Python scripts for complex text replacement) during Auto-Edit, ALWAYS create and execute them inside /tmp/ (e.g. cat << 'EOF' > /tmp/update.py). NEVER litter the workspace root with temporary oder utility scripts.

## Error Handling

**Never silence errors.** Do not write empty `catch` blocks, `.catch(() => {})`, or `catch { /* ignore */ }`.
Every `catch` must at minimum log with a descriptive context prefix (e.g. `console.error("[module] operation failed", e)`).
In Rust, never use `.unwrap()` or `.expect()` in library/engine code — propagate via `?`.
Silencing errors hides bugs and makes debugging impossible.
