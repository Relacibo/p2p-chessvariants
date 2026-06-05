# setup_players + init Redesign

## Rust Engine
- [ ] rust/src/lib.rs: Register VariantConfig + BoardScriptConfig as Rhai custom types (getters for name, version, api_version, colors, board { rows, cols, count })
- [ ] rust/src/lib.rs: Rewrite StatelessChessvariantEngine::init() — three-phase flow: validate player_count → setup_players(variant_config, player_count) → init(variant_config, setup) → combine into GameState
- [ ] rust/src/lib.rs: ChessvariantEngine::new(script, player_count) combined constructor (L372-374) — update Wasm binding to accept setup data instead of player_count, or split into two-step init
- [ ] rust/src/game/state.rs: Replace from_init_map() with from_parts(board, players, data) — no more implicit leftover-key collection. Remaining callers of from_init_map must be updated or removed.
- [ ] rust: Run cargo test + cargo clippy after refactor, fix all failures

## Variant Scripts — add setup_players(), rewrite init()
- [ ] variants/chess.rhai: Extract players into setup_players(variant_config, player_count); init(variant_config, setup) returns { board, data: { turn, castling_rights, en_passant } }
- [ ] variants/seirawan_chess.rhai: Same pattern — 2 players in setup_players, minimal data in init
- [ ] variants/4player.rhai: 4 players + teams[] in setup_players; board + { turn, turn_order } in init data
- [ ] variants/bughouse.rhai: 4 cross-team players in setup_players; [board0, board1] + { reserves, turn_order, current_turn } in init data

## Test Scripts — mirror variant changes
- [ ] rust/tests/scripts/chess.rhai: Same changes as variants/chess.rhai
- [ ] rust/tests/scripts/king_capture.rhai: Minimal setup_players (2 players) + init with custom board in data

## Spec
- [ ] specs/scripting-api.md: Add setup_players section (between PIECE_DEFS and init), rewrite init section (new signature, explicit data key), update engine flow diagram, remove teams? from init return shape

## Lobby / Engine Init Pipeline — propagate setup data instead of playerCount
### Data flow: Host assigns players → broadcasts game-start → peers init engine
- [ ] rust/src/lib.rs: ChessvariantEngine::new(script, player_count) → new signature must accept setup (players+teams) instead of raw player_count, or become a two-step constructor (new Stateless + .init(setup))
- [ ] src/features/engine/engineWorker.ts (L73-76): new ChessvariantEngine(p.script, p.playerCount) → update constructor call and "init" message payload
- [ ] src/features/engine/EngineProxy.ts (L86-94): init(script, playerCount) method → new signature passing setup data to worker
- [ ] src/features/chessboard/useChessGame.ts (L42, L124-173): loadScript(url, numPlayers) → loadScript(url, setup); proxy.init() call updated
- [ ] src/features/arena/ArenaView.tsx (L45-46, L118-119): playerCount → derive setup from lobbyStatus, pass to loadScript
- [ ] src/features/dev-board/DevBoardView.tsx (L359, L410, L420, L440): numPlayers / urlState.n → pass setup or let dev-board build its own default setup
- [ ] src/features/lobby/lobbySlice.ts (L235-248, L361-363, L1002-1023): game_started phase stores playerCount → must carry full setup (player assignments with IDs, orientations, team mappings)
- [ ] src/api/p2pLobbyService.ts (L46, L204-211, L477-478): onGameStart callback + broadcast payload — replace playerCount with setup data
- [ ] src/api/bebop/schemas/protocols/schemas/... (GameStart message): playerCount field → replace or augment with setup (players array + teams)
- [ ] yarn bebop: Regenerate TypeScript types after bebop schema changes
- [ ] src/api/types/lobby.ts (L9, L18): GameStartedData.playerCount → replace with setup type

## Design Notes
- setup_players(variant_config, player_count) → { players: [PlayerMap], teams?: [TeamMap] }
- init(variant_config, setup) → { board: Board, data: { turn, ... } }
- Engine injects setup.teams into data["teams"] so scripts access state["teams"] as before
- variant_config passed as typed Rhai custom type with property access (config.colors, config.board.rows, etc.)
- Player/Team orientation resolution priority unchanged
- No backward compat — all variant scripts must be updated
- Lobby pipeline: setup data flows from host (who runs setup_players) → P2P broadcast → peers (who pass it to engine init)
