use rhai::serde::from_dynamic;
use rhai::Dynamic;

use crate::error;

#[wasm_bindgen]
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Default, CustomType)]
#[serde(rename_all = "camelCase")]
pub struct VariantConfig {
    pub name: String,
    pub version: String,
    pub api_version: String,
    pub minimum_players: u32,
    pub maximum_players: u32,
    pub reserve_pile: bool,
    pub board: BoardConfig,
}

impl TryFrom<Dynamic> for VariantConfig {
    type Error = error::CvError;

    fn try_from(value: Dynamic) -> Result<Self, Self::Error> {
        let res = from_dynamic(&value)?;
        Ok(res)
    }
}

#[wasm_bindgen]
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Default, CustomType)]
#[serde(rename_all = "camelCase")]
pub struct BoardConfig {
    pub count: u32,
    pub layout: BoardLayoutConfig,
}

#[wasm_bindgen]
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Default, CustomType)]
#[serde(rename_all = "kebab-case", tag = "type")]
pub enum BoardLayoutConfig {
    Rectangle { pub rows: u32, pub columns: u32 },
}
