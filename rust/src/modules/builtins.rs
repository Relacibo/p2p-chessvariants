//! Rhai modules for the chess variant engine.
//!
//! Provides:
//!   - `engine::board::*` — board operations and movement primitives (static)
//!   - `engine::moves::*` — pseudo-legal move generators (static)
//!   - Config-dependent helpers registered directly to `engine::` namespace
//!   - `log::*` — logging module
//!
//! Constructors (Coords, Player, Piece, Move, etc.) remain global.

use rhai::{FuncRegistration, Module};

use crate::game::board;
use crate::game::engine_builtins::{self, engine_valid_actions_impl};
use crate::game::moves as move_gen;
use crate::game::state::BoardState;
use crate::game::variant_config::VariantConfig;
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
        .set_into_module(&mut m, board::rhai_board_find_piece);
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

    FuncRegistration::new("pawn")
        .with_purity(true)
        .set_into_module(&mut m, move_gen::rhai_pawn_moves);
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

// ─── Config-dependent helpers (registered to engine:: namespace) ──────────────

pub fn register_engine_helpers(config: &VariantConfig, engine: &mut rhai::Engine) {
    let check_protection = config.check_protection;
    let custom_pieces = engine_builtins::parse_custom_pieces(config.pieces.clone());

    let cp_valid = custom_pieces.clone();
    let cp_attacked = custom_pieces.clone();
    let cp_pseudo = custom_pieces;

    engine.register_fn(
        "engine::valid_actions",
        move |state: rhai::Dynamic, player: rhai::Map| -> rhai::Array {
            engine_valid_actions_impl(state, player, check_protection, &cp_valid)
        },
    );

    engine.register_fn(
        "engine::is_square_attacked",
        move |board: BoardState,
              coords: crate::game::state::Coords,
              by_color: String|
              -> bool {
            let Some(bc) = coords.as_board_coords() else {
                return false;
            };
            engine_builtins::is_square_attacked(&board, &bc, &by_color, &cp_attacked)
        },
    );

    engine.register_fn(
        "engine::pseudo_moves",
        move |board: BoardState,
              from: crate::game::state::Coords,
              piece_type: String,
              color: String|
              -> Vec<crate::game::state::Coords> {
            let Some(bc) = from.as_board_coords() else {
                return vec![];
            };
            engine_builtins::get_pseudo_move_dests(
                &board, &bc, &piece_type, &color, &cp_pseudo,
            )
            .into_iter()
            .map(crate::game::state::Coords::from)
            .collect()
        },
    );
}

// ─── log ──────────────────────────────────────────────────────────────────────

pub fn create_log_module() -> Module {
    logging::create_module()
}