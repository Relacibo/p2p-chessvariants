use rhai::plugin::*;
use rhai::Dynamic;
use rhai::{serde::from_dynamic, CustomType, EvalAltResult, Position, TypeBuilder};
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

use crate::error;

#[derive(Clone, Debug, Deserialize, Serialize, Default, CustomType, Tsify)]
#[serde(rename_all = "camelCase")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct VariantConfig {
    pub name: String,
    pub version: String,
    #[serde(alias = "apiVersion")]
    pub api_version: String,
    #[serde(alias = "minimumPlayers")]
    pub minimum_players: u32,
    #[serde(alias = "maximumPlayers")]
    pub maximum_players: u32,
    #[serde(alias = "reservePile")]
    pub reserve_pile: bool,
    pub board: BoardConfig,
}

#[derive(Clone, Debug, Deserialize, Serialize, Default, CustomType, Tsify)]
#[serde(rename_all = "camelCase")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct BoardConfig {
    pub count: u32,
    pub layout: BoardLayoutConfig,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Tsify)]
#[serde(rename_all = "kebab-case", tag = "type")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum BoardLayoutConfig {
    #[serde(rename_all = "camelCase")]
    Rectangle { rows: u32, columns: u32 },
}

impl Default for BoardLayoutConfig {
    fn default() -> Self {
        BoardLayoutConfig::Rectangle { rows: 8, columns: 8 }
    }
}

#[export_module]
#[allow(non_snake_case)]
mod BoardLayoutConfigModule {
    use rhai::Dynamic;
    use smartstring::SmartString;

    use super::BoardLayoutConfig;

    #[allow(non_snake_case)]
    pub fn Rectangle(rows: u32, columns: u32) -> BoardLayoutConfig {
        BoardLayoutConfig::Rectangle { rows, columns }
    }

    #[rhai_fn(global, get = "enum_type", pure)]
    pub fn get_type(my_enum: &mut BoardLayoutConfig) -> String {
        match my_enum {
            BoardLayoutConfig::Rectangle { .. } => "Rectangle".to_string(),
        }
    }

    /// Return the inner value.
    #[rhai_fn(global, get = "value", pure)]
    pub fn get_value(my_enum: &mut BoardLayoutConfig) -> Dynamic {
        match my_enum {
            BoardLayoutConfig::Rectangle { rows, columns } => {
                let map: rhai::Map = [
                    (SmartString::from("rows"), Dynamic::from(*rows)),
                    (SmartString::from("columns"), Dynamic::from(*columns)),
                ]
                .into_iter()
                .collect();
                Dynamic::from(map)
            }
        }
    }

    #[rhai_fn(global, get = "rows", pure)]
    pub fn get_rows(my_enum: &mut BoardLayoutConfig) -> u32 {
        match my_enum {
            BoardLayoutConfig::Rectangle { rows, .. } => *rows,
        }
    }

    #[rhai_fn(global, get = "columns", pure)]
    pub fn get_columns(my_enum: &mut BoardLayoutConfig) -> u32 {
        match my_enum {
            BoardLayoutConfig::Rectangle { columns, .. } => *columns,
        }
    }

    // Printing
    #[rhai_fn(global, name = "to_string", pure)]
    pub fn to_string(my_enum: &mut BoardLayoutConfig) -> String {
        format!("{my_enum:?}")
    }

    #[rhai_fn(global, name = "to_debug", pure)]
    pub fn to_debug(my_enum: &mut BoardLayoutConfig) -> String {
        format!("{my_enum:?}")
    }

    // '==' and '!=' operators
    #[rhai_fn(global, name = "==", pure)]
    pub fn eq(my_enum: &mut BoardLayoutConfig, my_enum2: BoardLayoutConfig) -> bool {
        my_enum == &my_enum2
    }

    #[rhai_fn(global, name = "!=", pure)]
    pub fn neq(my_enum: &mut BoardLayoutConfig, my_enum2: BoardLayoutConfig) -> bool {
        my_enum != &my_enum2
    }
}

impl TryFrom<Dynamic> for VariantConfig {
    type Error = error::CvError;

    fn try_from(value: Dynamic) -> Result<Self, Self::Error> {
        let res = from_dynamic(&value)?;
        Ok(res)
    }
}
