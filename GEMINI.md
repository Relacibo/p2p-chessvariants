# Gemini Project Instructions for P2P Chessvariants

## Protocols & Submodules
- **Bebop Protocol Definitions:** The Bebop schema definitions (`*.bop` files) are located in a separate repository that is integrated as a **Git submodule** (under `src/api/bebop/schemas/protocols/`).
- Whenever you make changes to or read from the protocol definitions, remember that you may need to commit and push changes in the submodule repository first, and then update the submodule reference in the main repository.
