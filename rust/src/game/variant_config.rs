use rhai::{CustomType, Dynamic, TypeBuilder, serde::from_dynamic};
use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::error;

/// Player configuration as defined in the script's `config()` function.
/// Can be a string (color only) or an object with name, board, color, team fields.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[cfg_attr(target_arch = "wasm32", tsify(into_wasm_abi, from_wasm_abi))]
pub struct PlayerConfig {
    pub name: String,
    pub color: String,
    pub board: usize,
    pub team: String,
}

impl PlayerConfig {
    /// Build a PlayerConfig from a Rhai Dynamic (handles both string and object formats)
    pub fn from_dynamic(value: Dynamic) -> Result<Self, error::CvError> {
        // Case 1: string shorthand → { color: value, name: value, board: 0, team: value }
        if let Ok(s) = value.clone().into_string() {
            return Ok(PlayerConfig {
                name: s.clone(),
                color: s.clone(),
                board: 0,
                team: s,
            });
        }
        
        // Case 2: object → deserialize each field with defaults
        let map = value.try_cast::<rhai::Map>()
            .ok_or_else(|| error::CvError::Internal("player config must be string or object".into()))?;
        
        let color: String = map
            .get("color")
            .and_then(|v| v.clone().into_string().ok())
            .ok_or_else(|| error::CvError::Internal("player config missing 'color' field".into()))?;
        
        let board: usize = map
            .get("board")
            .and_then(|v| v.as_int().ok())
            .unwrap_or(0) as usize;
        
        let name: String = map
            .get("name")
            .and_then(|v| v.clone().into_string().ok())
            .unwrap_or_else(|| {
                // default: "{color}-{board}" when board > 0, otherwise just color
                if board > 0 { format!("{color}-{board}") } else { color.clone() }
            });
        
        let team: String = map
            .get("team")
            .and_then(|v| v.clone().into_string().ok())
            .unwrap_or_else(|| name.clone());
        
        Ok(PlayerConfig { name, color, board, team })
    }
}

/// Config returned by the script's `config()` function.
#[derive(Clone, Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "snake_case")]
pub struct VariantConfig {
    pub name: String,
    pub version: String,
    pub api_version: i32,
    pub players: Vec<PlayerConfig>,
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
#[serde(rename_all = "snake_case")]
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
#[serde(rename_all = "snake_case")]
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

impl TryFrom<Dynamic> for BoardScriptConfig {
    type Error = error::CvError;

    fn try_from(value: Dynamic) -> Result<Self, Self::Error> {
        let res = from_dynamic(&value)?;
        Ok(res)
    }
}

impl TryFrom<Dynamic> for VariantConfig {
    type Error = error::CvError;

    fn try_from(value: Dynamic) -> Result<Self, Self::Error> {
        let map = value.try_cast::<rhai::Map>()
            .ok_or_else(|| error::CvError::Internal("config must be an object".into()))?;
        
        let name: String = map
            .get("name")
            .and_then(|v| v.clone().into_string().ok())
            .ok_or_else(|| error::CvError::Internal("config missing 'name' field".into()))?;
        
        let version: String = map
            .get("version")
            .and_then(|v| v.clone().into_string().ok())
            .ok_or_else(|| error::CvError::Internal("config missing 'version' field".into()))?;
        
        let api_version: i32 = map
            .get("api_version")
            .and_then(|v| v.as_int().ok())
            .unwrap_or(1);
        
        let players: Vec<PlayerConfig> = map
            .get("players")
            .and_then(|v| v.clone().try_cast::<rhai::Array>())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| PlayerConfig::from_dynamic(v.clone()).ok())
                    .collect()
            })
            .ok_or_else(|| error::CvError::Internal("config missing 'players' field".into()))?;
        
        // Validate unique player names
        let names: Vec<_> = players.iter().map(|p| &p.name).collect();
        let unique_names: std::collections::HashSet<_> = names.iter().collect();
        if names.len() != unique_names.len() {
            return Err(error::CvError::Internal("duplicate player names in config".into()));
        }
        
        let reserve_pile = map
            .get("reserve_pile")
            .and_then(|v| v.as_bool().ok())
            .unwrap_or(false);
        
        let check_protection = map
            .get("check_protection")
            .and_then(|v| v.as_bool().ok())
            .unwrap_or(false);
        
        let pieces = map.get("pieces").cloned();
        
        let board: BoardScriptConfig = map
            .get("board")
            .ok_or_else(|| error::CvError::Internal("config missing 'board' field".into()))?
            .clone()
            .try_into()?;
        
        Ok(VariantConfig {
            name,
            version,
            api_version,
            players,
            reserve_pile,
            check_protection,
            pieces,
            board,
        })
    }
}
