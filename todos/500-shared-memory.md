## Shared Memory (WASM ↔ JS)
*Ziel: Kopierfreies Canvas-Rendering über ein flaches Byte-Array.*

### Rust (`lib.rs`)
* [ ] **Flat Vektor:** Spielfeld intern als `Vec<u8>` anlegen (Größe: `rows * cols`).
* [ ] **WASM-Pointer:** `get_board_memory_ptr() -> *const u8` exportieren.
* [ ] **Metadaten:** `get_rows()` und `get_cols()` für das Frontend bereitstellen.

### TypeScript / PixiJS
* [ ] **Buffer-Sicht:** Über `new Uint8Array(wasmMemory, ptr, len)` direkt in den WASM-RAM schauen.
* [ ] **ID-Mapping:** `u8`-IDs per JSON-Lookup in Asset-Names übersetzen (z.B. `1` → `"white_pawn"`).
* [ ] **Math-Schleife:** Render-Schleife auf flachen Index umstellen: `index = r * cols + c`.
