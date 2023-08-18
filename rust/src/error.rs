use std::{
    backtrace::{self, Backtrace, BacktraceStatus},
    fmt::Display,
};

use js_sys::JsString;
use rhai::{EvalAltResult, ParseError};
use serde::{ser::SerializeStruct, Serialize};
use thiserror::Error;
use wasm_bindgen::{convert::ReturnWasmAbi, prelude::*};

use crate::rhai_rust_error::RhaiRustError;

#[derive(Debug, Error)]
pub enum CvError {
    #[error("Error in script: {0:?}")]
    RhaiEvalAlt(#[from] Box<EvalAltResult>),
    #[error("Error in script: {0:?}")]
    RhaiParse(#[from] ParseError),
    #[error("Error in script: Function name {function_name:?}")]
    RhaiFunctionReturnObject {
        function_name: String,
        rhai_rust_error: Box<RhaiRustError>,
    },
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
        let name = match value {
            RhaiEvalAlt(err) => "rhai-eval-alt".to_owned(),
            RhaiParse(err) => "rhai-parse".to_owned(),
            Unexpected => "unexpected".to_owned(),
            RhaiFunctionReturnObject(function_name, err) => {
                "rhai-function-return-object".to_owned()
            }
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
