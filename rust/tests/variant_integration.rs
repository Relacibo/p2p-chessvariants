#![allow(unused_must_use)]
use chessvariant_engine::{BoardCoords, BoardState, ChessAction as Action, ChessvariantEngine};
use rhai::Dynamic;

fn load_script(relative_path: &str) -> String {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    std::fs::read_to_string(format!("{manifest_dir}/{relative_path}"))
        .unwrap_or_else(|e| panic!("Failed to read {relative_path}: {e}"))
}

fn make_engine(script_path: &str, players: i32) -> ChessvariantEngine {
    let script = load_script(script_path);
    ChessvariantEngine::new(script, players)
        .unwrap_or_else(|e| panic!("Failed to init engine for {script_path}: {e:?}"))
}

fn state_board(state: &Dynamic) -> BoardState {
    state
        .clone()
        .cast::<rhai::Map>()
        .get("board")
        .expect("state has no 'board' field")
        .clone()
        .cast::<BoardState>()
}

fn state_turn(state: &Dynamic) -> i32 {
    state
        .clone()
        .cast::<rhai::Map>()
        .get("turn")
        .expect("state has no 'turn' field")
        .clone()
        .cast::<i32>()
}

fn state_active_players(state: &Dynamic) -> Vec<Dynamic> {
    state
        .clone()
        .cast::<rhai::Map>()
        .get("active_players")
        .expect("state has no 'active_players' field")
        .clone()
        .cast::<rhai::Array>()
}

fn state_active_players_colors(state: &Dynamic) -> Vec<String> {
    state_active_players(state)
        .iter()
        .map(|v| {
            // Try to cast as map first, then as string
            if let Some(map) = v.clone().try_cast::<rhai::Map>() {
                map["color"].clone().into_string().ok()
            } else {
                v.clone().into_string().ok()
            }
        })
        .flatten()
        .collect()
}

fn state_game_over(state: &Dynamic) -> Dynamic {
    state
        .clone()
        .cast::<rhai::Map>()
        .get("game_over")
        .expect("state has no 'game_over' field")
        .clone()
}

fn move_action(from: BoardCoords, to: BoardCoords) -> Dynamic {
    Dynamic::from(Action::rhai_move(from, to))
}

// ─── Simple Chess ─────────────────────────────────────────────────────────────

#[test]
fn test_simple_chess_init_board_has_standard_pieces() {
    let engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    let state = engine.state();
    let board = state_board(&state);

    // White pawns at row 6
    for col in 0..8_i32 {
        let piece = board
            .get_piece(&BoardCoords::new_board_0(6, col))
            .unwrap_or_else(|| panic!("expected white pawn at (6,{col})"));
        assert_eq!(piece.piece_type_name(), "pawn", "col {col}");
        assert_eq!(piece.color_name(), "white", "col {col}");
    }

    // Black pawns at row 1
    for col in 0..8_i32 {
        let piece = board
            .get_piece(&BoardCoords::new_board_0(1, col))
            .unwrap_or_else(|| panic!("expected black pawn at (1,{col})"));
        assert_eq!(piece.piece_type_name(), "pawn", "col {col}");
        assert_eq!(piece.color_name(), "black", "col {col}");
    }

    // White king at e1 (row 7, col 4)
    let wk = board
        .get_piece(&BoardCoords::new_board_0(7, 4))
        .expect("white king at e1");
    assert_eq!(wk.piece_type_name(), "king");
    assert_eq!(wk.color_name(), "white");

    // Black king at e8 (row 0, col 4)
    let bk = board
        .get_piece(&BoardCoords::new_board_0(0, 4))
        .expect("black king at e8");
    assert_eq!(bk.piece_type_name(), "king");
    assert_eq!(bk.color_name(), "black");
}

#[test]
fn test_simple_chess_initial_turn_is_white() {
    let engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    let active = state_active_players_colors(&engine.state());
    assert_eq!(active, vec!["white".to_string()]);
}

#[test]
fn test_simple_chess_initial_game_not_over() {
    let engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    assert!(state_game_over(&engine.state()).is_unit());
}

#[test]
fn test_simple_chess_pawn_e2_e4() {
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    engine
        .apply(
            serde_json::json!({"board": 0, "color": "white"}).to_string(),
            move_action(
                BoardCoords::new_board_0(6, 4),
                BoardCoords::new_board_0(4, 4),
            ),
        )
        .expect("white pawn e2→e4 should succeed");

    let state = engine.state();
    let board = state_board(&state);

    // Pawn now at e4 (row 4, col 4)
    let piece = board
        .get_piece(&BoardCoords::new_board_0(4, 4))
        .expect("pawn at e4");
    assert_eq!(piece.piece_type_name(), "pawn");
    assert_eq!(piece.color_name(), "white");

    // e2 is now empty
    assert!(board.get_piece(&BoardCoords::new_board_0(6, 4)).is_none());
}

#[test]
fn test_simple_chess_turn_alternates() {
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);

    engine
        .apply(
            serde_json::json!({"board": 0, "color": "white"}).to_string(),
            move_action(
                BoardCoords::new_board_0(6, 4),
                BoardCoords::new_board_0(4, 4),
            ),
        )
        .unwrap();
    let active = state_active_players_colors(&engine.state());
    assert_eq!(active, vec!["black".to_string()]);

    engine
        .apply(
            serde_json::json!({"board": 0, "color": "black"}).to_string(),
            move_action(
                BoardCoords::new_board_0(1, 4),
                BoardCoords::new_board_0(3, 4),
            ),
        )
        .unwrap();
    let active = state_active_players_colors(&engine.state());
    assert_eq!(active, vec!["white".to_string()]);
}

#[test]
fn test_simple_chess_wrong_turn_rejected() {
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    // Player "black" tries to go when it's "white"'s turn
    let result = engine.apply(
        serde_json::json!({"board": 0, "color": "black"}).to_string(),
        move_action(
            BoardCoords::new_board_0(1, 4),
            BoardCoords::new_board_0(3, 4),
        ),
    );
    assert!(result.is_err(), "should reject wrong-turn move");
}

#[test]
fn test_simple_chess_cannot_move_opponents_piece() {
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    // Player "white" tries to move a black pawn at row 1
    let result = engine.apply(
        serde_json::json!({"board": 0, "color": "white"}).to_string(),
        move_action(
            BoardCoords::new_board_0(1, 4),
            BoardCoords::new_board_0(3, 4),
        ),
    );
    assert!(result.is_err(), "should reject moving opponent's piece");
}

#[test]
fn test_simple_chess_cannot_move_from_empty_square() {
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    // Row 4 is empty at start
    let result = engine.apply(
        serde_json::json!({"board": 0, "color": "white"}).to_string(),
        move_action(
            BoardCoords::new_board_0(4, 4),
            BoardCoords::new_board_0(3, 4),
        ),
    );
    assert!(result.is_err(), "should reject move from empty square");
}

#[test]
fn test_simple_chess_cannot_capture_own_piece() {
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    // White rook at (7,0), white knight at (7,1) — try to move rook onto knight
    let result = engine.apply(
        serde_json::json!({"board": 0, "color": "white"}).to_string(),
        move_action(
            BoardCoords::new_board_0(7, 0),
            BoardCoords::new_board_0(7, 1),
        ),
    );
    assert!(result.is_err(), "should reject capturing own piece");
}

// ─── King Capture ─────────────────────────────────────────────────────────────

#[test]
fn test_king_capture_triggers_game_over() {
    let mut engine = make_engine("tests/scripts/king_capture.rhai", 2);

    // White queen at (1,4) captures black king at (0,4)
    engine
        .apply(
            serde_json::json!({"board": 0, "color": "white"}).to_string(),
            move_action(
                BoardCoords::new_board_0(1, 4),
                BoardCoords::new_board_0(0, 4),
            ),
        )
        .expect("king capture should succeed");

    let game_over = state_game_over(&engine.state());
    assert!(!game_over.is_unit(), "game should be over");

    let map = game_over.cast::<rhai::Map>();
    assert_eq!(
        map["type"].clone().cast::<String>(),
        "winner",
        "result type should be 'winner'"
    );
    assert_eq!(
        map["player"].clone().cast::<i32>(),
        0,
        "player index 0 (white) should win"
    );
}

#[test]
fn test_king_capture_game_not_over_after_non_king_move() {
    let mut engine = make_engine("tests/scripts/king_capture.rhai", 2);

    // White queen at (1,4) moves to (2,4) — no capture
    engine
        .apply(
            serde_json::json!({"board": 0, "color": "white"}).to_string(),
            move_action(
                BoardCoords::new_board_0(1, 4),
                BoardCoords::new_board_0(2, 4),
            ),
        )
        .unwrap();

    assert!(
        state_game_over(&engine.state()).is_unit(),
        "game should not be over after non-king move"
    );
}

// ─── Smoke tests for example scripts ──────────────────────────────────────────
// Only test config() + init() — apply() is not tested here because some
// example scripts call builtins not yet fully implemented (e.g. engine_valid_actions).

#[test]
fn test_smoke_bughouse_config_and_init() {
    let _engine = make_engine("../variants/bughouse.rhai", 4);
}

#[test]
fn test_smoke_four_player_chess_config_and_init() {
    let _engine = make_engine("../variants/four_player_chess.rhai", 4);
}

#[test]
fn test_smoke_seirawan_chess_config_and_init() {
    let _engine = make_engine("../variants/seirawan_chess.rhai", 2);
}
