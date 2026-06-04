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

**Feature**: Zeige an, wie viele Spieler in der Lobby sind (z.B. "2/4 players"),
und verhindere, dass mehr Spieler joinen als der Variant erlaubt.

**Änderungen**:

### Frontend
- `ActiveLobbyView.tsx`: `{players.length}/{maxPlayers}` Badge anzeigen.
- `LobbyView.tsx`: Beim Join-Check prüfen, ob `players.length >= maxPlayers`.
  Wenn ja: "Lobby is full" Meldung statt Join-Button.
- `ArenaView.tsx`: `playerCount`/`maxPlayers` aus `lobbyStatus` oder `variantConfig`
  anzeigen.

### Engine (Rust)
- `variant_config` hat bereits `allowed_player_count` (min/max/exact).
  `max_players()` und `min_players()` sind als Wasm-Methoden verfügbar.
- Evtl. eine `playerCount`-Validierung in `handle_action` (wenn es eine
  "join"-Aktion gibt) oder auf Rust-Ebene in der Lobby-Logik.

### WebRTC / P2P
- `p2pLobbyService` müsste peer connections limitieren oder ablehnen,
  wenn `max_players` erreicht ist. Aktuell geschieht das Join über
  `joinLobbyByPeer` oder `joinLobbyById` — kein Player-Count-Check vorhanden.

**Betroffene Dateien**:
- `src/features/lobby/ActiveLobbyView.tsx`
- `src/features/lobby/LobbyView.tsx`
- `src/api/p2pLobbyService.ts`
- `src/features/lobby/lobbySlice.ts`
- `rust/src/lib.rs` (ggf. für playerCount-Abfrage)
