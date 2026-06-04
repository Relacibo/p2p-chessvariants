#![allow(unused_must_use)]
use chessvariant_engine::{
    BoardCoords, BoardState, ChessvariantEngine, GameCoords as Coords, GameResult,
};
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
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);
    let active = engine.active_player_colors();
    assert_eq!(active, vec!["white".to_string()]);
}

#[test]
fn test_simple_chess_initial_game_not_over() {
    let mut engine = make_engine("tests/scripts/simple_chess.rhai", 2);
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

    let result = outcome.cast::<GameResult>();
    assert_eq!(result.kind, "winner", "result type should be 'winner'");
    assert_eq!(result.player, Some(0), "player index 0 (white) should win");
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
fn test_smoke_seirawan_chess_config_and_init() {
    let _engine = make_engine("../variants/seirawan_chess.rhai", 2);
}

// ─── Chess (full rules) ───────────────────────────────────────────────────────

// Test 1: Ruy Lopez — play moves 1–5, verify white kingside castling (O-O).
// Move sequence (row, col notation):
//   1. e4  (6,4)→(4,4)   e5   (1,4)→(3,4)
//   2. Nf3 (7,6)→(5,5)   Nc6  (0,1)→(2,2)
//   3. Bb5 (7,5)→(3,1)   a6   (1,0)→(2,0)
//   4. Ba4 (3,1)→(4,0)   Nf6  (0,6)→(2,5)
//   5. O-O king (7,4)→(7,6)  [castling; rook h1→f1]
#[test]
fn test_chess_ruy_lopez_kingside_castling() {
    let mut engine = make_engine("tests/scripts/chess.rhai", 2);

    engine
        .submit_move("white", coords(6, 4), coords(4, 4))
        .expect("1. e4");
    engine
        .submit_move("black", coords(1, 4), coords(3, 4))
        .expect("1... e5");
    engine
        .submit_move("white", coords(7, 6), coords(5, 5))
        .expect("2. Nf3");
    engine
        .submit_move("black", coords(0, 1), coords(2, 2))
        .expect("2... Nc6");
    engine
        .submit_move("white", coords(7, 5), coords(3, 1))
        .expect("3. Bb5");
    engine
        .submit_move("black", coords(1, 0), coords(2, 0))
        .expect("3... a6");
    engine
        .submit_move("white", coords(3, 1), coords(4, 0))
        .expect("4. Ba4");
    engine
        .submit_move("black", coords(0, 6), coords(2, 5))
        .expect("4... Nf6");
    engine
        .submit_move("white", coords(7, 4), coords(7, 6))
        .expect("5. O-O");

    let state = engine.state();
    let board = state_board(&state);

    // King must be on g1 = (7,6)
    let king = board
        .get_piece(&BoardCoords::new_board_0(7, 6))
        .expect("king at g1 after castling");
    assert_eq!(king.piece_type_name(), "king");
    assert_eq!(king.color_name(), "white");

    // Rook must be on f1 = (7,5)
    let rook = board
        .get_piece(&BoardCoords::new_board_0(7, 5))
        .expect("rook at f1 after castling");
    assert_eq!(rook.piece_type_name(), "rook");
    assert_eq!(rook.color_name(), "white");

    // Original king square e1 = (7,4) must be empty
    assert!(
        board.get_piece(&BoardCoords::new_board_0(7, 4)).is_none(),
        "e1 should be empty after O-O"
    );

    // Original rook square h1 = (7,7) must be empty
    assert!(
        board.get_piece(&BoardCoords::new_board_0(7, 7)).is_none(),
        "h1 should be empty after O-O"
    );
}

// Test 2: Pawn promotion — white a-pawn marches up the board and auto-promotes
// to queen by capturing the black a8-rook on a8=(0,0).
// Move sequence:
//   1. a4  (6,0)→(4,0)   h5   (1,7)→(3,7)
//   2. a5  (4,0)→(3,0)   h4   (3,7)→(4,7)
//   3. a6  (3,0)→(2,0)   h3   (4,7)→(5,7)
//   4. axb7 (2,0)→(1,1)  Na6  (0,1)→(2,0)   [pawn captures b7-pawn]
//   5. axb8=Q (1,1)→(0,0)                    [pawn captures Ra8, auto-promotes]
#[test]
fn test_chess_pawn_promotion() {
    let mut engine = make_engine("tests/scripts/chess.rhai", 2);

    engine
        .submit_move("white", coords(6, 0), coords(4, 0))
        .expect("1. a4");
    engine
        .submit_move("black", coords(1, 7), coords(3, 7))
        .expect("1... h5");
    engine
        .submit_move("white", coords(4, 0), coords(3, 0))
        .expect("2. a5");
    engine
        .submit_move("black", coords(3, 7), coords(4, 7))
        .expect("2... h4");
    engine
        .submit_move("white", coords(3, 0), coords(2, 0))
        .expect("3. a6");
    engine
        .submit_move("black", coords(4, 7), coords(5, 7))
        .expect("3... h3");
    engine
        .submit_move("white", coords(2, 0), coords(1, 1))
        .expect("4. axb7");
    engine
        .submit_move("black", coords(0, 1), coords(2, 0))
        .expect("4... Na6");
    engine
        .submit_move("white", coords(1, 1), coords(0, 0))
        .expect("5. axb8 (pawn arrives)");
    // Select queen for promotion
    engine
        .submit_select_piece("white", "white", "queen")
        .expect("5. promote to queen");

    let state = engine.state();
    let board = state_board(&state);

    // Promoted queen must be on a8 = (0,0)
    let promoted = board
        .get_piece(&BoardCoords::new_board_0(0, 0))
        .expect("promoted piece at a8");
    assert_eq!(promoted.piece_type_name(), "queen");
    assert_eq!(promoted.color_name(), "white");

    // Original pawn square b7 = (1,1) must be empty
    assert!(
        board.get_piece(&BoardCoords::new_board_0(1, 1)).is_none(),
        "b7 should be empty after promotion"
    );

    // Turn should be black after promotion
    let colors = engine.active_player_colors();
    assert!(
        colors.contains(&"black".to_string()),
        "black should be active after promotion"
    );
}

// Test 3: Stalemate — shortest known stalemate in 10 moves (Réti stalemate).
// After 10. Qe6, black has no legal moves and is NOT in check → stalemate.
// Move sequence (row, col):
//   1. e3  (6,4)→(5,4)   a5   (1,0)→(3,0)
//   2. Qh5 (7,3)→(3,7)   Ra6  (0,0)→(2,0)
//   3. Qxa5 (3,7)→(3,0)  h5   (1,7)→(3,7)
//   4. Qxc7 (3,0)→(1,2)  Rah6 (2,0)→(2,7)
//   5. h4  (6,7)→(4,7)   f6   (1,5)→(2,5)
//   6. Qxd7+ (1,2)→(1,3) Kf7  (0,4)→(1,5)
//   7. Qxb7 (1,3)→(1,1)  Qd3  (0,3)→(5,3)
//   8. Qxb8 (1,1)→(0,1)  Qh7  (5,3)→(1,7)
//   9. Qxc8 (0,1)→(0,2)  Kg6  (1,5)→(2,6)
//  10. Qe6  (0,2)→(2,4)  → STALEMATE
#[test]
fn test_chess_stalemate() {
    let mut engine = make_engine("tests/scripts/chess.rhai", 2);

    engine
        .submit_move("white", coords(6, 4), coords(5, 4))
        .expect("1. e3");
    engine
        .submit_move("black", coords(1, 0), coords(3, 0))
        .expect("1... a5");
    engine
        .submit_move("white", coords(7, 3), coords(3, 7))
        .expect("2. Qh5");
    engine
        .submit_move("black", coords(0, 0), coords(2, 0))
        .expect("2... Ra6");
    engine
        .submit_move("white", coords(3, 7), coords(3, 0))
        .expect("3. Qxa5");
    engine
        .submit_move("black", coords(1, 7), coords(3, 7))
        .expect("3... h5");
    engine
        .submit_move("white", coords(3, 0), coords(1, 2))
        .expect("4. Qxc7");
    engine
        .submit_move("black", coords(2, 0), coords(2, 7))
        .expect("4... Rah6");
    engine
        .submit_move("white", coords(6, 7), coords(4, 7))
        .expect("5. h4");
    engine
        .submit_move("black", coords(1, 5), coords(2, 5))
        .expect("5... f6");
    engine
        .submit_move("white", coords(1, 2), coords(1, 3))
        .expect("6. Qxd7+");
    engine
        .submit_move("black", coords(0, 4), coords(1, 5))
        .expect("6... Kf7");
    engine
        .submit_move("white", coords(1, 3), coords(1, 1))
        .expect("7. Qxb7");
    engine
        .submit_move("black", coords(0, 3), coords(5, 3))
        .expect("7... Qd3");
    engine
        .submit_move("white", coords(1, 1), coords(0, 1))
        .expect("8. Qxb8");
    engine
        .submit_move("black", coords(5, 3), coords(1, 7))
        .expect("8... Qh7");
    engine
        .submit_move("white", coords(0, 1), coords(0, 2))
        .expect("9. Qxc8");
    engine
        .submit_move("black", coords(1, 5), coords(2, 6))
        .expect("9... Kg6");
    engine
        .submit_move("white", coords(0, 2), coords(2, 4))
        .expect("10. Qe6");

    // Populate the valid-moves cache so is_game_over can be checked
    let active = engine.active_player_colors();
    assert!(
        active.is_empty(),
        "no player should have legal moves after stalemate"
    );
    assert!(engine.is_game_over(), "game should be over (stalemate)");

    // Black king must still be on the board (not captured — this is stalemate, not checkmate)
    let state = engine.state();
    let board = state_board(&state);
    let black_king = board.get_piece(&BoardCoords::new_board_0(2, 6));
    assert!(black_king.is_some(), "black king must still be on board");
    assert_eq!(black_king.unwrap().piece_type_name(), "king");
    assert_eq!(black_king.unwrap().color_name(), "black");
}
