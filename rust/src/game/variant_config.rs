use rhai::{CustomType, Dynamic, EvalAltResult, Position, TypeBuilder, serde::from_dynamic};
use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::error;

#[derive(Clone, Debug, Deserialize, Serialize, Default, CustomType)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[cfg_attr(target_arch = "wasm32", tsify(into_wasm_abi, from_wasm_abi))]
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
    #[serde(default)]
    pub check_protection: bool,
    #[serde(default)]
    pub pieces: Option<Dynamic>,
    pub board: BoardConfig,
}

#[derive(Clone, Debug, Deserialize, Serialize, Default, CustomType)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[cfg_attr(target_arch = "wasm32", tsify(into_wasm_abi, from_wasm_abi))]
pub struct BoardConfig {
    pub count: u32,
    pub layout: BoardLayoutConfig,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case", tag = "type")]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[cfg_attr(target_arch = "wasm32", tsify(into_wasm_abi, from_wasm_abi))]
pub enum BoardLayoutConfig {
    #[serde(rename_all = "camelCase")]
    Rectangle { rows: u32, columns: u32 },
}

impl Default for BoardLayoutConfig {
    fn default() -> Self {
        BoardLayoutConfig::Rectangle {
            rows: 8,
            columns: 8,
        }
    }
}

impl BoardLayoutConfig {
    pub fn rhai_rectangle(rows: i32, columns: i32) -> Self {
        BoardLayoutConfig::Rectangle {
            rows: rows.max(0) as u32,
            columns: columns.max(0) as u32,
        }
    }
}

impl TryFrom<Dynamic> for VariantConfig {
    type Error = error::CvError;

    fn try_from(value: Dynamic) -> Result<Self, Self::Error> {
        let res = from_dynamic(&value)?;
        Ok(res)
    }
}
