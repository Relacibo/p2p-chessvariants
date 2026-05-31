#![allow(unused_must_use)]
use chessvariant_engine::{BoardCoords, BoardState, ChessvariantEngine, GameCoords as Coords};
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

fn coords(row: i32, col: i32) -> Coords {
    Coords::new_board_0(row, col)
}

// ─── Simple Chess ─────────────────────────────────────────────────────────────

#[test]
fn test_simple_chess_init_board_has_standard_pieces() {
    let engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    let state = engine.state();
    let board = state_board(&state);

    for col in 0..8_i32 {
        let piece = board
            .get_piece(&BoardCoords::new_board_0(6, col))
            .unwrap_or_else(|| panic!("expected white pawn at (6,{col})"));
        assert_eq!(piece.piece_type_name(), "pawn", "col {col}");
        assert_eq!(piece.color_name(), "white", "col {col}");
    }

    for col in 0..8_i32 {
        let piece = board
            .get_piece(&BoardCoords::new_board_0(1, col))
            .unwrap_or_else(|| panic!("expected black pawn at (1,{col})"));
        assert_eq!(piece.piece_type_name(), "pawn", "col {col}");
        assert_eq!(piece.color_name(), "black", "col {col}");
    }

    let wk = board
        .get_piece(&BoardCoords::new_board_0(7, 4))
        .expect("white king at e1");
    assert_eq!(wk.piece_type_name(), "king");
    assert_eq!(wk.color_name(), "white");

    let bk = board
        .get_piece(&BoardCoords::new_board_0(0, 4))
        .expect("black king at e8");
    assert_eq!(bk.piece_type_name(), "king");
    assert_eq!(bk.color_name(), "black");
}

#[test]
fn test_simple_chess_initial_turn_is_white() {
    let engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    let active = engine.active_player_colors();
    assert_eq!(active, vec!["white".to_string()]);
}

#[test]
fn test_simple_chess_initial_game_not_over() {
    let engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    assert!(!engine.is_game_over());
}

#[test]
fn test_simple_chess_pawn_e2_e4() {
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    engine
        .submit_move("white", coords(6, 4), coords(4, 4))
        .expect("white pawn e2→e4 should succeed");

    let state = engine.state();
    let board = state_board(&state);

    let piece = board
        .get_piece(&BoardCoords::new_board_0(4, 4))
        .expect("pawn at e4");
    assert_eq!(piece.piece_type_name(), "pawn");
    assert_eq!(piece.color_name(), "white");

    assert!(board.get_piece(&BoardCoords::new_board_0(6, 4)).is_none());
}

#[test]
fn test_simple_chess_turn_alternates() {
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);

    engine
        .submit_move("white", coords(6, 4), coords(4, 4))
        .unwrap();
    let active = engine.active_player_colors();
    assert_eq!(active, vec!["black".to_string()]);

    engine
        .submit_move("black", coords(1, 4), coords(3, 4))
        .unwrap();
    let active = engine.active_player_colors();
    assert_eq!(active, vec!["white".to_string()]);
}

#[test]
fn test_simple_chess_wrong_turn_rejected() {
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    let result = engine.submit_move("black", coords(1, 4), coords(3, 4));
    assert!(result.is_err(), "should reject wrong-turn move");
}

#[test]
fn test_simple_chess_cannot_move_opponents_piece() {
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    let result = engine.submit_move("white", coords(1, 4), coords(3, 4));
    assert!(result.is_err(), "should reject moving opponent's piece");
}

#[test]
fn test_simple_chess_cannot_move_from_empty_square() {
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    let result = engine.submit_move("white", coords(4, 4), coords(3, 4));
    assert!(result.is_err(), "should reject move from empty square");
}

#[test]
fn test_simple_chess_cannot_capture_own_piece() {
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    let result = engine.submit_move("white", coords(7, 0), coords(7, 1));
    assert!(result.is_err(), "should reject capturing own piece");
}

// ─── King Capture ─────────────────────────────────────────────────────────────

#[test]
fn test_king_capture_triggers_game_over() {
    let mut engine = make_engine("tests/scripts/king_capture.rhai", 2);

    engine
        .submit_move("white", coords(1, 4), coords(0, 4))
        .expect("king capture should succeed");

    assert!(engine.is_game_over(), "game should be over");

    let outcome = engine.outcome();
    assert!(!outcome.is_unit(), "outcome should be set");

    let map = outcome.cast::<rhai::Map>();
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

    engine
        .submit_move("white", coords(1, 4), coords(2, 4))
        .unwrap();

    assert!(
        !engine.is_game_over(),
        "game should not be over after non-king move"
    );
}

// ─── Smoke tests ──────────────────────────────────────────────────────────────

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
