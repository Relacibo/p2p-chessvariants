use std::{
    backtrace::{self, Backtrace},
    fmt::Display,
};

use js_sys::JsString;
use rhai::{EvalAltResult, ParseError};
use serde::{ser::SerializeStruct, Serialize};
use thiserror::Error;
use wasm_bindgen::{convert::ReturnWasmAbi, prelude::*};

#[derive(Debug, Error)]
pub enum CvError {
    #[error("Rhai Eval Alt: {0:?}")]
    RhaiEvalAlt(#[from] Box<EvalAltResult>, Backtrace),
    #[error("Rhai Parse: {0:?}")]
    RhaiParse(#[from] ParseError, Backtrace),
    #[error("Unexpected")]
    Unexpected(Backtrace),
}

impl CvError {
    pub fn unexpected() -> Self {
        let bt = Backtrace::capture();
        Self::Unexpected(bt)
    }
}

#[wasm_bindgen]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CvJsError {
    name: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    stack: Option<String>,
}

impl CvJsError {
    pub fn new(name: String, message: String) -> Self {
        Self {
            name,
            message,
            stack: None,
        }
    }

    pub fn with_stack(mut self, stack: Backtrace) -> Self {
        self.stack = Some(stack.to_string());
        self
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

    #[wasm_bindgen(getter)]
    pub fn stack(&self) -> Option<String> {
        self.stack.clone()
    }
}

impl From<CvError> for CvJsError {
    fn from(value: CvError) -> Self {
        use CvError::*;
        match value {
            RhaiEvalAlt(err, backtrace) => {
                CvJsError::new("rhai-eval-alt".to_owned(), err.to_string()).with_stack(backtrace)
            }
            RhaiParse(err, backtrace) => {
                CvJsError::new("rhai-parse".to_owned(), err.to_string()).with_stack(backtrace)
            }
            Unexpected(backtrace) => CvJsError::new(
                "unexpected".to_owned(),
                "Unexpected Error occured".to_owned(),
            )
            .with_stack(backtrace),
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
