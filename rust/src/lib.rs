use error::CvError;
use game::{
    actions::Action,
    board,
    game_result,
    moves,
    piece::Piece,
    standard,
    state::ReservePileState,
    variant_config::{BoardLayoutConfig, VariantConfig},
};
use rhai::{AST, Dynamic, Engine, Scope};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

pub mod error;
mod game;
mod modules;
pub mod rhai_rust_error;

// Re-exports for integration tests and external consumers
pub use game::actions::Action as ChessAction;
pub use game::board as board_helpers;
pub use game::piece::Piece as ChessPiece;
pub use game::state::{BoardCoords, BoardState};

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
        .build_type::<BoardLayoutConfig>()
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
    // Rect(r1, c1, r2, c2) — rectangular region descriptor used in board config
    engine.register_fn("Rect", |r1: i32, c1: i32, r2: i32, c2: i32| -> rhai::Map {
        let mut m = rhai::Map::new();
        m.insert("r1".into(), Dynamic::from(r1));
        m.insert("c1".into(), Dynamic::from(c1));
        m.insert("r2".into(), Dynamic::from(r2));
        m.insert("c2".into(), Dynamic::from(c2));
        m
    });
    // combine(type1, type2) — declares a piece whose moves are the union of two standard pieces
    engine.register_fn("combine", |p1: String, p2: String| -> rhai::Map {
        let mut m = rhai::Map::new();
        m.insert("type".into(), Dynamic::from("combine".to_string()));
        let pieces: rhai::Array = vec![Dynamic::from(p1), Dynamic::from(p2)];
        m.insert("pieces".into(), Dynamic::from(pieces));
        m
    });
    engine.register_fn("merge", |base: rhai::Map, updates: rhai::Map| -> rhai::Map {
        let mut result = base;
        result.extend(updates);
        result
    });
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

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(getter))]
    pub fn name(&self) -> String {
        self.variant_config.name.clone()
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(getter))]
    pub fn min_players(&self) -> i32 {
        self.variant_config.min_players
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(getter))]
    pub fn max_players(&self) -> i32 {
        self.variant_config.max_players
    }

    /// Parse only the `config()` section of a script (no game init).
    /// Returns `{ name, minPlayers, maxPlayers }` as a JS object.
    #[cfg(target_arch = "wasm32")]
    #[wasm_bindgen(js_name = parseConfig, static_method_of = ChessvariantEngine)]
    pub fn parse_config(script_content: String) -> Result<JsValue, CvError> {
        let mut engine = Engine::new();
        register_builtins(&mut engine);
        let ast = engine.compile(&script_content)?;
        let mut scope = Scope::new();
        let dynamic_config = engine.call_fn::<Dynamic>(&mut scope, &ast, "config", ())?;
        let variant_config: VariantConfig = dynamic_config.try_into()?;
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &"name".into(), &variant_config.name.into()).unwrap();
        js_sys::Reflect::set(&obj, &"minPlayers".into(), &(variant_config.min_players as f64).into()).unwrap();
        js_sys::Reflect::set(&obj, &"maxPlayers".into(), &(variant_config.max_players as f64).into()).unwrap();
        Ok(obj.into())
    }
}

// These methods use `Dynamic` which is not a WASM ABI type, so they are excluded from the
// wasm_bindgen impl block. They are available for native use and integration tests.
impl ChessvariantEngine {
    /// Applies an action submitted by `player_index`.
    /// Returns the new state on success, or an error if the script rejects the action.
    pub fn apply(&mut self, player_index: i32, action: Dynamic) -> Result<Dynamic, CvError> {
        let mut scope = Scope::new();
        let new_state = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "apply",
            (self.game_state.clone(), player_index, action),
        )?;
        self.game_state = new_state.clone();
        Ok(new_state)
    }

    /// Returns a clone of the current game state.
    pub fn state(&self) -> Dynamic {
        self.game_state.clone()
    }
}
