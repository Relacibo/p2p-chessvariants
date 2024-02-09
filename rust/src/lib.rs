#![feature(error_generic_member_access)]

use error::CvError;
use game::State;
use rhai::{Dynamic, Engine, FuncArgs, Scope, AST};
use wasm_bindgen::prelude::*;

use crate::game::{entities::Piece, variant_config::VariantConfig};

pub mod error;
mod game;
mod modules;
pub mod rhai_rust_error;

#[wasm_bindgen]
#[derive(Debug)]
pub struct ChessvariantEngine {
    engine: Engine,
    ast: AST,
    game_state: State,
}

#[wasm_bindgen()]
impl ChessvariantEngine {
    ///
    /// Checks if the supplied script is a valid chess variant declaration.
    ///
    /// Returns a Chessvariant Engine that executes the logic defined
    /// in the declaration.
    ///
    /// Throws an AppError, if the script is invalid or some other problem
    /// occured.
    ///
    #[wasm_bindgen(constructor)]
    pub fn new(script_content: String) -> Result<ChessvariantEngine, CvError> {
        let mut engine = Engine::new();
        let ast = engine.compile(&script_content)?;
        engine.build_type::<State>().build_type::<Piece>();

        let mut scope = Scope::new();

        let dynamic_config = engine.call_fn::<Dynamic>(&mut scope, &ast, "config", ())?;
        
        let config: VariantConfig = dynamic_config.try_into()?;
        // Call user defined function to initialize the state
        // args should contain maybe a state that was created from
        // the configuration and number of players
        let game_state = engine.call_fn::<State>(&mut scope, &ast, "initializeState", args)?;
        Ok(ChessvariantEngine {
            engine,
            ast,
            game_state,
        })
    }

    #[wasm_bindgen]
    pub fn run_something(&self, number: i32) -> Result<i32, CvError> {
        let ChessvariantEngine { engine, ast, .. } = self;
        let mut scope = Scope::new();
        scope.push("ten", 10);
        scope.push("number", number);
        let args = (
            12,
            scope.get_value::<i32>("ten").ok_or(CvError::Unexpected)?,
        );
        let res = engine.call_fn(&mut scope, ast, "main", args)?;

        Ok(res)
    }

    #[wasm_bindgen]
    fn make_move(&self) {}
}
