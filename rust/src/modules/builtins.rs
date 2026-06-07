//! Rhai modules for the chess variant engine.
//!
//! Provides:
//!   - `engine::board::*` — board operations and movement primitives (static)
//!   - `engine::moves::*` — pure-geometry move generators (static)
//!   - `log::*` — logging module
//!
//! All piece-specific rules (pawn direction, capture conditions, en passant, etc.)
//! are defined in Rhai scripts. The engine only provides unbiased geometry helpers.

use rhai::{FuncRegistration, Module};

use crate::game::board;
use crate::game::moves as move_gen;
use crate::game::state::BoardState;
use crate::logging;

// ─── engine::board ────────────────────────────────────────────────────────────

pub fn create_board_submodule() -> Module {
    let mut m = Module::new();

    // Board operations
    FuncRegistration::new("get")
        .with_purity(true)
        .set_into_module(&mut m, board::rhai_board_get);
    FuncRegistration::new("set")
        .with_purity(true)
        .set_into_module(&mut m, board::rhai_board_set);
    FuncRegistration::new("move_piece")
        .with_purity(true)
        .set_into_module(&mut m, board::rhai_board_move_piece);
    FuncRegistration::new("find")
        .with_purity(true)
        .set_into_module(&mut m, board::rhai_board_find);
    FuncRegistration::new("find")
        .with_purity(true)
        .set_into_module(&mut m, board::rhai_board_find_piece);
    FuncRegistration::new("find_by_color")
        .with_purity(true)
        .set_into_module(&mut m, board::rhai_board_find_by_color);
    FuncRegistration::new("rows")
        .with_purity(true)
        .set_into_module(&mut m, board::rhai_board_rows);
    FuncRegistration::new("cols")
        .with_purity(true)
        .set_into_module(&mut m, board::rhai_board_cols);
    FuncRegistration::new("count")
        .with_purity(true)
        .set_into_module(&mut m, board::rhai_board_count);

    // Movement primitives
    FuncRegistration::new("ray")
        .with_purity(true)
        .set_into_module(&mut m, board::rhai_ray);
    FuncRegistration::new("xray")
        .with_purity(true)
        .set_into_module(&mut m, board::rhai_xray);
    FuncRegistration::new("jump")
        .with_purity(true)
        .set_into_module(&mut m, board::rhai_jump);

    // Builder
    FuncRegistration::new("empty")
        .with_purity(true)
        .set_into_module(&mut m, BoardState::board_empty);

    m
}

// ─── engine::moves ────────────────────────────────────────────────────────────

pub fn create_moves_submodule() -> Module {
    let mut m = Module::new();

    // Generic geometry helpers — the script composes these with conditions.
    FuncRegistration::new("jump")
        .with_purity(true)
        .set_into_module(&mut m, move_gen::rhai_jump);
    FuncRegistration::new("jump")
        .with_purity(true)
        .set_into_module(&mut m, move_gen::rhai_jump_mt);
    FuncRegistration::new("slide")
        .with_purity(true)
        .set_into_module(&mut m, move_gen::rhai_slide);
    FuncRegistration::new("slide")
        .with_purity(true)
        .set_into_module(&mut m, move_gen::rhai_slide_mt);
    FuncRegistration::new("pawn_push")
        .with_purity(true)
        .set_into_module(&mut m, move_gen::rhai_pawn_push);

    // Convenience per-type helpers (optional sugar for standard pieces).
    FuncRegistration::new("rook")
        .with_purity(true)
        .set_into_module(&mut m, move_gen::rhai_rook_moves);
    FuncRegistration::new("knight")
        .with_purity(true)
        .set_into_module(&mut m, move_gen::rhai_knight_moves);
    FuncRegistration::new("bishop")
        .with_purity(true)
        .set_into_module(&mut m, move_gen::rhai_bishop_moves);
    FuncRegistration::new("queen")
        .with_purity(true)
        .set_into_module(&mut m, move_gen::rhai_queen_moves);
    FuncRegistration::new("king")
        .with_purity(true)
        .set_into_module(&mut m, move_gen::rhai_king_moves);

    m
}

// ─── log ──────────────────────────────────────────────────────────────────────

pub fn create_log_module() -> Module {
    logging::create_module()
}
