use rhai::serde::from_dynamic;
use rhai::Dynamic;

use crate::error;

#[wasm_bindgen]
#[derive(Clone, Debug, Deserialize, Serialize, Default, CustomType)]
#[serde(rename_all = (serialize = "camelCase"))]
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

#[wasm_bindgen]
#[derive(Clone, Debug, Deserialize, Serialize, Default, CustomType)]
#[serde(rename_all = "camelCase")]
pub struct BoardConfig {
    pub count: u32,
    pub layout: BoardLayoutConfig,
}

#[wasm_bindgen]
#[derive(Clone, Debug, Deserialize, Serialize, Default, CustomType)]
#[serde(rename_all = "kebab-case", tag = "type")]
pub enum BoardLayoutConfig {
    #[serde(rename_all = "camelCase")]
    Rectangle { pub rows: u32, pub columns: u32 },
}

impl TryFrom<Dynamic> for VariantConfig {
    type Error = error::CvError;

    fn try_from(value: Dynamic) -> Result<Self, Self::Error> {
        let res = from_dynamic(&value)?;
        Ok(res)
    }
}
