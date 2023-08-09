use std::fmt::Display;

use rhai::EvalAltResult;
use thiserror::Error;
use wasm_bindgen::prelude::*;

#[derive(Error, Debug)]
pub enum AppError {
    RhaiEvalAltResult(#[from] Box<EvalAltResult>),
}

impl Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        use AppError::*;
        match self {
            RhaiEvalAltResult(err) => f.write_fmt(format_args!("{err:?}")),
        }
    }
}

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.to_string()
    }
}
