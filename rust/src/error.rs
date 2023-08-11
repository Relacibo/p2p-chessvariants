use std::fmt::Display;

use rhai::{EvalAltResult, ParseError};
use serde::{ser::SerializeStruct, Serialize};
use thiserror::Error;
use wasm_bindgen::{convert::ReturnWasmAbi, prelude::*};

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Rhai Eval Alt: {0:?}")]
    RhaiEvalAlt(#[from] Box<EvalAltResult>),
    #[error("Rhai Parse: {0:?}")]
    RhaiParse(#[from]ParseError),
    #[error("Unexpected")]
    Unexpected,
}

#[wasm_bindgen(typescript_custom_section)]
const TS_APP_ERROR: &'static str = r#"
export type AppError = {
    result: "error";
    type: String;
    message: String;
}"#;

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use AppError::*;
        let (error_type, message): (&str, String) = match self {
            RhaiEvalAlt(err) => ("rhai-eval-alt", err.to_string()),
            RhaiParse(err) => ("rhai-parse", err.to_string()),
            Unexpected => ("unexpected", "Unexpected Error occured".to_owned()),
        };

        let mut state = serializer.serialize_struct("AppError", 3)?;
        state.serialize_field("result", "error")?;
        state.serialize_field("type", error_type)?;
        state.serialize_field("message", &message)?;
        state.end()
    }
}

impl From<AppError> for JsValue {
    fn from(value: AppError) -> Self {
        match serde_wasm_bindgen::to_value(&value) {
            Ok(js) => js,
            Err(js_err) => js_err.into(),
        }
    }
}
