# TODO — Piece Definition Storage & Script Cleanup

## 1. Statischer Speicher für Piece Definitions (Engine)

**Problem**: Piece definitions werden aktuell in `init()` gebaut und im `state`-Map abgelegt.
Das ist suboptimal, weil sie unveränderlich sind und mit jedem `handle_action`-Return
durchgereicht werden müssen.

**Lösung**: Persistenten `Scope` in `ChessvariantEngine` einführen.
Module-level `let PIECE_DEFS = #{ ... }` wird beim Engine-Start einmal evaluiert
und steht allen Funktionen zur Verfügung.

**Konkrete Änderungen**:

1. `ChessvariantEngine` um `scope: Scope` erweitern (in `rust/src/lib.rs`)
2. Konstruktor: `engine.compile_into_scope(&mut self.scope, &script)` statt `engine.compile()`
3. Alle `call_fn`-Aufrufe verwenden `&mut self.scope` statt `Scope::new()`
4. `register_builtins` muss VOR `compile_into_scope` aufgerufen werden (Engine muss
   Typen kennen, bevor das Skript kompiliert wird)

```rust
pub fn new(script: String, player_count: i32) -> Result<Self, CvError> {
    let mut engine = Engine::new();
    register_builtins(&mut engine);

    let mut scope = Scope::new();
    let ast = engine.compile_into_scope(&mut scope, &script)?;
    // Module-level let PIECE_DEFS = #{ ... } ist jetzt in scope ausgewertet

    let dynamic_config = engine.call_fn::<Dynamic>(&mut scope, &ast, "config", ())?;
    let variant_config: VariantConfig = dynamic_config.try_into()?;

    register_engine_helpers(&mut engine);
    let game_state = engine.call_fn::<Dynamic>(&mut scope, &ast, "init", (player_count,))?;

    Ok(Self { engine, ast, scope, game_state, variant_config })
}
```

5. Danach können `init()`, `valid_moves()`, `handle_action()` etc. direkt auf
   die module-level `PIECE_DEFS` zugreifen, ohne sie im state speichern zu müssen.

---

## 2. Compound-Key Piece Definitions (Script)

**Pattern**: Eine einzige flache Map. Lookup: erst `"pawn::white"`, dann Fallback `"pawn"`.

```rhai
// Module-level — wird einmal evaluiert, persistent im Scope
let PIECE_DEFS = #{
    "king": [
        #{ type: "jump", offsets: [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]] },
    ],
    "queen": [
        #{ type: "slide", dirs: [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] },
    ],
    // ... rook, bishop, knight wie gehabt ...

    // "pawn" ohne Farbe: leer oder kein Eintrag (fällt durch zu Farbspezifisch)
    "pawn": [],

    // Farbspezifisch: "pawn::white", "pawn::black"
    "pawn::white": [
        #{ type: "jump", offsets: [[-1, 0]], condition: |s,f,t| engine::board::get(s.board, t) == () },
        #{ type: "jump", offsets: [[-2, 0]], condition: |s,f,t| f.row == 6 && ... },
        #{ type: "jump", offsets: [[-1, -1], [-1, 1]], condition: |s,f,t| { /* enemy + en passant */ } },
    ],
    "pawn::black": [
        #{ type: "jump", offsets: [[1, 0]], condition: ... },
        // ...
    ],
};

// Lookup
fn get_piece_defs(piece) {
    let key = piece.type + "::" + piece.color;
    if key in PIECE_DEFS { return PIECE_DEFS[key]; }
    if piece.type in PIECE_DEFS { return PIECE_DEFS[piece.type]; }
    [];
}
```

---

## 3. Rhai-Skripte fixen (nutzt das compound-key Pattern)

Betroffene Dateien:
- `variants/chess.rhai`
- `variants/simple_chess.rhai`
- `variants/seirawan_chess.rhai`
- `variants/4player.rhai`
- `variants/bughouse.rhai`
- `rust/tests/scripts/chess.rhai`
- `rust/tests/scripts/simple_chess.rhai`
- `rust/tests/scripts/king_capture.rhai`

**Bekannte Probleme in den Scripts** (Stand: aktuelle Arbeitskopie):
- `let mut` → `let` (Rhai kennt kein `mut`)
- `match` → `switch`
- `///` doc comments → `//` comments
- Module-level `let`/`const` ist aktuell nicht in `call_fn` sichtbar → wird durch
  persistenten Scope (Punkt 1) gelöst
- Closures mit Multistatement-Bodies brauchen geschweifte Klammern: `|s,f,t| { stmts }`

**Getestetes Arbeitsmuster** (funktioniert mit aktuellem Engine):
- Closures in Maps, die von `build_*_defs()` zurückgegeben und im state gespeichert werden
- `switch comp.type { "jump" => ..., "slide" => ..., _ => [] }`
- Condition-Closures direkt aufrufen: `comp.condition(state, from, t)` (kein `.call()`)

---

## 4. Abschließende Tests

```bash
cd rust && cargo test --lib          # Unit-Tests (sollten alle grün sein)
cd rust && cargo test                # Integration-Tests (nach Script-Fixes grün)
yarn lint:rust                       # Clippy/Rustfmt
```

---

## 5. Lib.rs Refactoring (Done) & Broken Integration Tests

### Was wurde gemacht
- **`PlayerRef` entfernt** → `i32` als Player-ID über WASM. Die `PlayerRef`-Struct mit
  board+color backward compat ist weg. Frontend sendet jetzt `"0"` statt `"{\"id\":0}"`.
- **`player_ref_to_player_id`** → **`pub fn resolve_player(state, id) -> Result<Player>`**
  mit `?`-Operator, kein sentinel `Player::new_by_id(0)` mehr.
- **`rhai_dynamic_to_json` + `rhai_map_to_json`** → **`fn dynamic_to_json(&Dynamic) -> Value`**
  via `serde_json::to_value(value)` (Rhai's serde feature). Rekursiv, kein manuelles
  Type-Dispatch mehr.
- **`get_player_map`** → `Option<Dynamic>` mit `?`-Operator, kein leeres Map als Fallback.
- **`state_json`** → `let else` + `?` statt 3-fach `if let`.
- **`extract_outcome_from_state`** → 40 Zeilen auf 6 reduziert, delegiert an `dynamic_to_json`.
- **Orientation-Resolution** extrahiert in `fn resolve_orientation`.
- **`player_field_i32` / `player_field_string` / `player_from_map`** DRY helpers.
- **AGENTS.md** um Rust-Styleguide ergänzt (no sentinel values, `?` prefer over `let else`,
  no manual type-dispatch für JSON, no backward compat).
- **Frontend**: `ArenaView.tsx` sendet `String(id)` statt `JSON.stringify({id: id})`.

### Gebrochene Integration-Tests (7 von 15)
```
test_simple_chess_pawn_e2_e4          — Internal("illegal move")
test_simple_chess_turn_alternates     — Internal("illegal move")
test_simple_chess_initial_turn_is_white — Internal("illegal move")
test_simple_chess_initial_game_not_over — Internal("illegal move")
test_chess_ruy_lopez_kingside_castling — Internal("illegal move")
test_chess_stalemate                  — Internal("illegal move")
test_chess_pawn_promotion             — Internal("illegal move")
```
- **Ursache**: `compute_valid_moves_for_player` findet keine legalen Moves.
  Vermutlich schon vor dem Refactoring gebrochen (andere Agent-Änderungen).
  `cargo check` kompiliert clean, das Refactoring selbst ist nicht die Ursache.
- **Debug-Ansatz**: `compute_valid_moves_for_player` debuggen — prüfen ob
  `valid_moves` aus dem Rhai-Script korrekt aufgerufen wird und Moves zurückgibt.
