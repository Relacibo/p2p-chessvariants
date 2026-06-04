# TODO — Lobby Slots & Player Count

## 1. Slots: `player.name ?? player.id` umbenennen

**Aktuell**: Die Lobby-Slots zeigen vermutlich die User-ID oder einen generischen
Platzhalter an. Stattdessen soll der **Display-Name** des Spielers priorisiert werden.

**Änderungen**:
- In `ActiveLobbyView.tsx` (oder wo auch immer die Slot-Liste gerendert wird):
  `player.name || player.id` als Anzeigename verwenden.
- In `playersJson()` (Rust `lib.rs`) wird bereits `"name"` und `"id"` ausgegeben.
  Das Frontend muss nur `player.name || `Slot ${player.id}`` o.Ä. nutzen.
- Im `LobbyView.tsx`: Wo Spieler-Namen angezeigt werden, von `player.id` auf
  `player.name ?? player.id` umstellen.
- Eventuell im `p2pLobbyService`: Beim Joinen den Display-Namen mitgeben,
  damit er an alle Peers verteilt wird.

**Betroffene Dateien**:
- `src/features/lobby/ActiveLobbyView.tsx`
- `src/features/lobby/LobbyView.tsx`
- `src/features/chessboard/useChessGame.ts` (syncState verarbeitet `allPlayers`)
- `src/features/arena/ArenaView.tsx` (wo playerAssignments verarbeitet werden)

## 2. Player Count anzeigen & Check implementieren

**Player count ist ein Enum** (nicht nur eine Zahl). Die Variant-Konfiguration
definiert einen von drei Typen (`AllowedPlayerCount` in `rust/src/game/variant_config.rs`):

```rust
pub enum AllowedPlayerCount {
    Exact(u32),                       // z.B. 4 → genau 4 Spieler
    Discrete(Vec<u32>),               // z.B. [2, 4] → nur 2 oder 4 Spieler
    Range { min: u32, max: u32, step: Option<u32> }, // z.B. 2..4 (step=1)
}
```

**Feature**: Zeige an, wie viele Spieler in der Lobby sind, und verhindere,
dass mehr Spieler joinen als der Variant erlaubt.

**Änderungen**:

### Frontend
- `ActiveLobbyView.tsx`: Player-count Badge, z.B.:
  - `Exact(4)`: `"2 / 4 players"` — Lobby ist "voll", wenn `players.length == 4`
  - `Discrete([2,4])`: `"2 / 4 players"` oder `"2 / 2–4 players"`.
    Check: Join nur, wenn `players.length + 1` in `[2, 4]` enthalten ist
    ODER die nächste erlaubte Zahl erreicht wird.
  - `Range { min: 2, max: 6, step: 2 }`: `"2 / 2–6 players (step 2)"`.
    Check: nach Join muss `players.length + 1` ≤ `max` sein,
    und der Host kann bei `step`-Zwischenschritten das Spiel starten.
- `LobbyView.tsx`: Join-Check — `players.length < max_players` (wobei
  `max_players` je nach Enum-Typ interpretiert wird).
- `ArenaView.tsx`: `allowedPlayerCount` aus `variantConfig` lesen und als
  Label/Progress anzeigen.

### Engine (Rust)
- `variant_config.allowed_player_count` ist bereits implementiert.
- WASM-Methoden: `min_players()`, `max_players()` funktionieren bereits,
  geben aber für alle Enum-Varianten ein flaches i32. Für `Discrete` wäre
  eine zusätzliche Methode `allowed_player_counts() -> Vec<i32>` sinnvoll,
  sowie `player_count_step() -> Option<i32>`.
- `player_count()` → `max_players()` (aktuell), könnte aber `number_of_players`
  heißen und die tatsächliche Anzahl in der Lobby zurückgeben.

### WebRTC / P2P
- `p2pLobbyService`: Der Host muss Joins ablehnen, wenn `max_players` erreicht ist.
  Bei `Exact` und `Discrete` ist die Grenze hart, bei `Range` ist sie weich
  (Host kann bei `min` starten, aber bis `max` warten).
- `joinLobbyByPeer` / `joinLobbyById`: Player-Count-Check vor Annahme der
  Peer-Verbindung.

**Betroffene Dateien**:
- `src/features/lobby/ActiveLobbyView.tsx`
- `src/features/lobby/LobbyView.tsx`
- `src/features/arena/ArenaView.tsx`
- `src/api/p2pLobbyService.ts`
- `src/features/lobby/lobbySlice.ts`
- `rust/src/lib.rs` (ggf. `allowed_player_counts()` Methode)
- `rust/src/game/variant_config.rs` (Referenz, Enum ist schon da)
