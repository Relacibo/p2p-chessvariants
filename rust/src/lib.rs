pub mod error;
use error::AppError;
use rhai::Engine;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Debug)]
pub struct ChessvariantEngine {
    engine: Engine,
}

#[wasm_bindgen]
impl ChessvariantEngine {
    pub fn new(script: String) -> Result<ChessvariantEngine, String> {
        let engine = Engine::new();
        engine
            .run(&script)
            .map_err(|err| -> AppError { err.into() })?;
        Ok(ChessvariantEngine { engine })
    }
}
