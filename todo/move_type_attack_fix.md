# move_type + attack dests fix

## Problem
`is_square_attacked` / `sq_attacked_by` ruft `get_pseudo_dests` und zählt Bauern-Vorwärtsschübe fälschlich als Angriffe.
→ König kann nicht auf Felder ziehen, die ein Bauer nur betreten (nicht schlagen) kann.

## API-Design
Neues Feld `move_type` in PieceDefs-Komponenten:
- `"both"` (default) — zählt als Zug UND Angriff
- `"move"` — nur nicht-schlagende Züge (z.B. Bauern-Vorwärtsschub)
- `"capture"` — nur Schlagzüge (z.B. Bauern-Diagonale)

```rhai
#{ type: "jump", offsets: [[-1, 0]], move_type: "move", condition: ... }
#{ type: "jump", offsets: [[-1,-1],[-1,1]], move_type: "capture", condition: ... }
```

---

## Tasks

### 1. Rust: `moves.rs`
- [ ] `jumps()`: neuen Parameter `move_type: &str` → filtert nach "move" (nur leere Felder) / "capture" (nur Gegner) / sonst beides
- [ ] `slides()`: gleicher Parameter
- [ ] `rhai_jump()`: neuen Parameter durchreichen, mit `"both"` als default für Rückwärtskompatibilität
- [ ] `rhai_slide()`: gleiches

### 2. Rust: `builtins.rs`
- [ ] `jump`-Registrierung: neue Signatur mit `move_type`-Parameter (optional, default `"both"`)
- [ ] `slide`-Registrierung: gleiches

### 3. Rhai: `chess.rhai`
- [ ] `get_pseudo_dests`: `comp.move_type ?? "both"` an `engine::moves::jump`/`slide` weitergeben
- [ ] Neue Funktion `get_attack_dests`: wie `get_pseudo_dests`, aber Komponenten mit `move_type == "move"` überspringen, und `engine::moves::jump`/`slide` mit `move_type` aus der Komponente aufrufen
- [ ] `is_square_attacked`: `get_attack_dests` statt `get_pseudo_dests` aufrufen
- [ ] Bauern-PIECE_DEFS: `move_type: "move"` auf Vorwärtsschub, `move_type: "capture"` auf Diagonale

### 4. Rhai: `seirawan_chess.rhai`
- [ ] Gleiche Änderungen wie chess.rhai (get_pseudo_dests, get_attack_dests, is_square_attacked, Bauern-PIECE_DEFS)

### 5. Rhai: `bughouse.rhai`
- [ ] `get_pseudo_dests`: `comp.move_type ?? "both"` weitergeben (kein is_square_attacked vorhanden)

### 6. Rhai: `4player.rhai`
- [ ] `get_pseudo_dests`: `comp.move_type ?? "both"` weitergeben (kein is_square_attacked vorhanden)

### 7. Template: `VariantEditorContent.tsx`
- [ ] `EMPTY_TEMPLATE`: Bauern mit move_type, neue `get_attack_dests`, `sq_attacked_by` fixt

### 8. Build + Commit
- [ ] `yarn build` oder zumindest `cargo check` + `npx tsc --noEmit`
- [ ] Commit mit Beschreibung
