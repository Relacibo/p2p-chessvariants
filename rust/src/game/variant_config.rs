use rhai::{CustomType, Dynamic, TypeBuilder, serde::from_dynamic};
use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::error;

/// Config returned by the script's `config()` function.
#[derive(Clone, Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "snake_case")]
pub struct VariantConfig {
    pub name: String,
    pub version: String,
    pub api_version: i32,
    pub min_players: i32,
    pub max_players: i32,
    #[serde(default)]
    pub reserve_pile: bool,
    #[serde(default)]
    pub check_protection: bool,
    #[serde(default)]
    pub pieces: Option<Dynamic>,
    pub board: BoardScriptConfig,
}

/// Flat board config as returned by scripts: `#{ type: "rectangle", rows: 8, cols: 8 }`.
#[derive(Clone, Debug, Deserialize, Serialize, Default)]
pub struct BoardScriptConfig {
    #[serde(rename = "type")]
    pub board_type: String,
    pub rows: i32,
    pub cols: i32,
    #[serde(default = "default_board_count")]
    pub count: i32,
    /// Rectangular regions that are not part of the playable board (e.g. cut corners
    /// in four-player chess). Each entry is `[r1, c1, r2, c2]` — top-left and size.
    #[serde(default)]
    pub disabled_rects: Vec<DisabledRect>,
}

/// A rectangular region of tiles that are disabled (not rendered, not playable).
/// `r1`/`c1` = top-left corner, `r2`/`c2` = width/height of the region.
#[derive(Clone, Debug, Deserialize, Serialize, Default)]
pub struct DisabledRect {
    pub r1: i32,
    pub c1: i32,
    pub r2: i32,
    pub c2: i32,
}

fn default_board_count() -> i32 {
    1
}

/// Rhai-constructable rectangle layout descriptor (returned by `Rectangle(rows, cols)`).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Default, CustomType)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[cfg_attr(target_arch = "wasm32", tsify(into_wasm_abi, from_wasm_abi))]
pub struct BoardLayoutConfig {
    pub rows: i32,
    pub cols: i32,
}

impl BoardLayoutConfig {
    pub fn rhai_rectangle(rows: i32, cols: i32) -> Self {
        BoardLayoutConfig { rows, cols }
    }
}

impl TryFrom<Dynamic> for VariantConfig {
    type Error = error::CvError;

    fn try_from(value: Dynamic) -> Result<Self, Self::Error> {
        let res = from_dynamic(&value)?;
        Ok(res)
    }
}
