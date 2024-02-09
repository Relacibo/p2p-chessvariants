use std::backtrace::Backtrace;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RhaiRustError {
    #[error("Fields are missing in object: '{object_name}': {fields:?}")]
    RhaiObjectFieldsMissing {
        object_name: String,
        fields: Vec<String>,
    },
    #[error("Fields are missing in object: '{object_name}': {field} (expected: {expected})")]
    RhaiObjectType {
        object_name: String,
        field: String,
        expected: String,
    },
}
