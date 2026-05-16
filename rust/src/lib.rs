use error::CvError;
use game::{
    actions::Action,
    board,
    game_result,
    moves,
    piece::Piece,
    standard,
    state::{BoardCoords, BoardState, ReservePileState},
    variant_config::{BoardLayoutConfig, VariantConfig},
};
use rhai::{AST, Dynamic, Engine, Scope};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

pub mod error;
mod game;
mod modules;
pub mod rhai_rust_error;

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[derive(Debug)]
#[allow(dead_code)] // game_state and variant_config will be used by apply/make_move
pub struct ChessvariantEngine {
    engine: Engine,
    ast: AST,
    pub(crate) game_state: Dynamic,
    pub(crate) variant_config: VariantConfig,
}

fn register_builtins(engine: &mut Engine) {
    engine
        .build_type::<BoardState>()
        .build_type::<ReservePileState>()
        .build_type::<BoardCoords>()
        .build_type::<Piece>()
        .build_type::<VariantConfig>()
        .build_type::<Action>();

    engine.register_fn("Coords", BoardCoords::new_board_0);
    engine.register_fn("Coords", BoardCoords::new);
    engine.register_fn("board_empty", BoardState::board_empty);
    engine.register_fn("board_get", board::rhai_board_get);
    engine.register_fn("board_set", board::rhai_board_set);
    engine.register_fn("board_move_piece", board::rhai_board_move_piece);
    engine.register_fn("board_find", board::rhai_board_find);
    engine.register_fn("board_rows", board::rhai_board_rows);
    engine.register_fn("board_cols", board::rhai_board_cols);
    engine.register_fn("board_count", board::rhai_board_count);
    engine.register_fn("ray", board::rhai_ray);
    engine.register_fn("xray", board::rhai_xray);
    engine.register_fn("jump", board::rhai_jump);
    engine.register_fn("pawn_moves", moves::rhai_pawn_moves);
    engine.register_fn("rook_moves", moves::rhai_rook_moves);
    engine.register_fn("knight_moves", moves::rhai_knight_moves);
    engine.register_fn("bishop_moves", moves::rhai_bishop_moves);
    engine.register_fn("queen_moves", moves::rhai_queen_moves);
    engine.register_fn("king_moves", moves::rhai_king_moves);
    engine.register_fn("Move", Action::rhai_move);
    engine.register_fn("Drop", Action::rhai_drop);
    engine.register_fn("Choose", Action::rhai_choose);
    engine.register_fn("Winner", game_result::rhai_winner);
    engine.register_fn("Winners", game_result::rhai_winners);
    engine.register_fn("Draw", game_result::rhai_draw);
    engine.register_fn("standard_start_position", standard::standard_start_position);
    engine.register_fn("Rectangle", BoardLayoutConfig::rhai_rectangle);
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl ChessvariantEngine {
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new(
        script_content: String,
        player_count: i32,
    ) -> Result<ChessvariantEngine, CvError> {
        let mut engine = Engine::new();
        let ast = engine.compile(&script_content)?;
        register_builtins(&mut engine);

        let mut scope = Scope::new();
        let dynamic_config = engine.call_fn::<Dynamic>(&mut scope, &ast, "config", ())?;
        let variant_config: VariantConfig = dynamic_config.try_into()?;
        let game_state = engine.call_fn::<Dynamic>(&mut scope, &ast, "init", (player_count,))?;

        Ok(ChessvariantEngine {
            engine,
            ast,
            game_state,
            variant_config,
        })
    }

    pub fn run_something(&self, number: i32) -> Result<i32, CvError> {
        let ChessvariantEngine { engine, ast, .. } = self;
        let mut scope = Scope::new();
        scope.push("ten", 10_i32);
        scope.push("number", number);
        let args = (12_i32, scope.get_value::<i32>("ten").ok_or(CvError::Unexpected)?);
        let res = engine.call_fn(&mut scope, ast, "main", args)?;
        Ok(res)
    }

    pub fn make_move(&self) {}
}
