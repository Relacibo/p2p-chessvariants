# TODO — Flip Board Button hat keine Wirkung (außer Bughouse)

**Symptom**: Der Rotate-Button (Board-Orientation) tut in Standard-Chess und
4-Player-Chess nichts, funktioniert aber in Bughouse.

**Ursache**: `usedOrientations` in `DevBoardView.tsx` wird aus `allPlayers`
abgeleitet. Bughouse setzt `orientation` explizit auf den Spielern
(`"normal"` / `"flipped"`) → `usedOrientations = ["normal", "flipped"]` →
Rotation funktioniert. Chess und 4-Player setzen keine `orientation` auf den
Spielern → alle defaulten zu `"normal"` → `usedOrientations = ["normal"]` →
Zyklus von 1 Element ist ein No-Op.

## Mögliche Lösungen

### A) Orientation pro Spieler obligatorisch machen
- In `init()` jedes Variant-Skripts ein `orientation`-Feld auf jedem Player
  vorschreiben (analog zu Bughouse).
- Engine-seitig: `orientation` als Pflichtfeld im `Player`-Struct oder in
  `player_from_map()` validieren, mit Fallback auf sinnvollen Default.

### B) Orientation pro Team obligatorisch machen
- Wie 4-Player-Chess es bereits tut: Teams haben `orientations`, aber die
  Engine/der Frontend-Code wertet sie nicht für `allPlayers` aus.
- Engine: Team-Orientations beim Serialisieren auf die Spieler mergen.
- Frontend: `variantConfigJson()` oder `playersJson()` müsste die gemergten
  Orientations liefern.

### C) Default-Orientations pro Spieler setzen
- Im Engine-Code (`player_from_map()` oder `players_json()`): Wenn kein
  `orientation`-Feld im Rhai-Map, einen Default setzen (nicht "normal" für
  alle, sondern z.B. basierend auf `home_board` oder `team`).
- Für 2-Spieler-Varianten: Spieler 0 → "normal", Spieler 1 → "flipped".
- Für 4-Spieler-Varianten: je nach Home-Position eine der 4 Orientations.

### D) Status Quo akzeptieren
- Wenn das gewollt ist: Der Rotate-Button rotiert nur durch die tatsächlich
  von Spielern genutzten Orientations. Varianten ohne explizite Orientations
  haben nur "normal" → kein Rotieren möglich. Ist das by design?

## Betroffene Dateien
- `src/features/dev-board/DevBoardView.tsx` — `usedOrientations`, `orientationByBoard`
- `rust/src/lib.rs` — `player_from_map()`, `players_json()`
- `rust/src/game/state.rs` — `Player` struct (hat kein `orientation`-Feld)
- Variant-Skripte: `chess.rhai`, `4player.rhai`, `bughouse.rhai`
- `src/features/arena/ArenaView.tsx` — ähnliche `orientationByBoard`-Logik
