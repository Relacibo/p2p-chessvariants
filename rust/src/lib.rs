#![feature(error_generic_member_access)]
#![feature(provide_any)]
pub mod error;
mod game;
pub mod rhai_rust_error;
use error::CvError;
use game::State;
use rhai::{Dynamic, Engine, FuncArgs, Scope, AST};
use wasm_bindgen::prelude::*;

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
        engine.register_fn("add3", add3);
        engine.register_fn("State", State::new);

        let mut scope = Scope::new();
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
            scope.get_value::<i32>("ten").ok_or(CvError::unexpected())?,
        );
        let res = engine.call_fn(&mut scope, ast, "main", args)?;

        Ok(res)
    }

    #[wasm_bindgen]
    fn make_move(&self) {}
}
