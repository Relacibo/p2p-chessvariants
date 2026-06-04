use rhai::{EvalAltResult, ParseError};
use serde::Serialize;
use thiserror::Error;
use wasm_bindgen::prelude::*;

use crate::rhai_rust_error::RhaiRustError;

#[derive(Debug, Error)]
pub enum CvError {
    /// Rhai runtime error with position info. Uses Display (not Debug) for readable messages:
    /// "Runtime error: no piece at source square (line 64, position 24)"
    #[error("Script error: {0}")]
    RhaiEvalAlt(#[from] Box<EvalAltResult>),

    /// Rhai parse error (script syntax error).
    #[error("Script parse error: {0}")]
    RhaiParse(#[from] ParseError),
    #[error("Error in script: Function name {function_name:?}")]
    RhaiFunctionReturnObject {
        function_name: String,
        rhai_rust_error: Box<RhaiRustError>,
    },
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Internal error: {0}")]
    Internal(String),
    #[error("Unexpected")]
    Unexpected,
}

#[wasm_bindgen]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CvJsError {
    name: String,
    message: String,
}

impl CvJsError {
    pub fn new(name: String, message: String) -> Self {
        Self { name, message }
    }
}

#[wasm_bindgen]
impl CvJsError {
    #[wasm_bindgen(getter)]
    pub fn name(&self) -> String {
        self.name.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn message(&self) -> String {
        self.message.clone()
    }
}

impl From<CvError> for CvJsError {
    fn from(value: CvError) -> Self {
        use CvError::*;
        let name = match &value {
            RhaiEvalAlt(_) => "rhai-eval-alt".to_owned(),
            RhaiParse(_) => "rhai-parse".to_owned(),
            Unexpected => "unexpected".to_owned(),
            RhaiFunctionReturnObject { .. } => "rhai-function-return-object".to_owned(),
            Json(_) => "json".to_owned(),
            Internal(_) => "internal".to_owned(),
        };
        CvJsError {
            name,
            message: value.to_string(),
        }
    }
}

impl From<CvError> for JsValue {
    fn from(value: CvError) -> Self {
        let js_error: CvJsError = value.into();
        match serde_wasm_bindgen::to_value(&js_error) {
            Ok(js) => js,
            Err(js_err) => js_err.into(),
        }
    }
}
