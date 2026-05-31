use rhai::{CustomType, Dynamic, serde::from_dynamic};
use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::error;

/// Validation for player count. In Rhai config:
///   - `2`              → Exact(2)
///   - `[2, 4]`         → Discrete([2, 4])
///   - `#{min:2,max:4,step:2}` → Range { min:2, max:4, step:2 }
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[cfg_attr(target_arch = "wasm32", tsify(into_wasm_abi, from_wasm_abi))]
pub enum AllowedPlayerCount {
    Exact(u32),
    Discrete(Vec<u32>),
    Range { min: u32, max: u32, step: u32 },
}

impl Default for AllowedPlayerCount {
    fn default() -> Self {
        AllowedPlayerCount::Exact(2)
    }
}

impl AllowedPlayerCount {
    pub fn validate(&self, n: u32) -> bool {
        match self {
            AllowedPlayerCount::Exact(v) => n == *v,
            AllowedPlayerCount::Discrete(vals) => vals.contains(&n),
            AllowedPlayerCount::Range { min, max, step } => {
                n >= *min && n <= *max && (n - min) % step == 0
            }
        }
    }

    /// Parse from a Rhai Dynamic value.
    pub fn from_dynamic(value: Dynamic) -> Result<Self, error::CvError> {
        // Case 1: simple integer → Exact
        if let Ok(n) = value.as_int() {
            return Ok(AllowedPlayerCount::Exact(n as u32));
        }
        // Case 2: array of integers → Discrete
        if let Some(arr) = value.clone().try_cast::<rhai::Array>() {
            let vals: Vec<u32> = arr
                .iter()
                .filter_map(|v| v.as_int().ok().map(|n| n as u32))
                .collect();
            if vals.is_empty() {
                return Err(error::CvError::Internal(
                    "allowed_player_count array must not be empty".into(),
                ));
            }
            return Ok(AllowedPlayerCount::Discrete(vals));
        }
        // Case 3: map { min, max, step } → Range
        if let Some(map) = value.clone().try_cast::<rhai::Map>() {
            let min = map.get("min").and_then(|v| v.as_int().ok()).unwrap_or(2) as u32;
            let max = map.get("max").and_then(|v| v.as_int().ok()).unwrap_or(2) as u32;
            let step = map.get("step").and_then(|v| v.as_int().ok()).unwrap_or(1) as u32;
            return Ok(AllowedPlayerCount::Range { min, max, step });
        }
        Err(error::CvError::Internal(
            "allowed_player_count must be integer, array, or {min, max, step} map".into(),
        ))
    }
}

/// Config returned by the script's `config()` function.
#[derive(Clone, Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "snake_case")]
pub struct VariantConfig {
    pub name: String,
    pub version: String,
    pub api_version: i32,
    #[serde(default)]
    pub colors: Vec<String>,
    #[serde(default)]
    pub allowed_player_count: AllowedPlayerCount,
    #[serde(default)]
    pub reserve_pile: bool,
    #[serde(default)]
    pub check_protection: bool,
    #[serde(default)]
    pub pieces: Option<Dynamic>,
    #[serde(default = "default_promotion_pieces")]
    pub promotion_pieces: Vec<String>,
    pub board: BoardScriptConfig,
}

fn default_promotion_pieces() -> Vec<String> {
    vec![
        "queen".into(),
        "rook".into(),
        "bishop".into(),
        "knight".into(),
    ]
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
    #[allow(dead_code)]
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
        let map = value
            .try_cast::<rhai::Map>()
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

        let colors: Vec<String> = map
            .get("colors")
            .and_then(|v| v.clone().try_cast::<rhai::Array>())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.clone().into_string().ok())
                    .collect()
            })
            .unwrap_or_default();

        let allowed_player_count = map
            .get("allowed_player_count")
            .cloned()
            .map(AllowedPlayerCount::from_dynamic)
            .unwrap_or(Ok(AllowedPlayerCount::Exact(2)))?;

        let reserve_pile = map
            .get("reserve_pile")
            .and_then(|v| v.as_bool().ok())
            .unwrap_or(false);

        let check_protection = map
            .get("check_protection")
            .and_then(|v| v.as_bool().ok())
            .unwrap_or(false);

        let pieces = map.get("pieces").cloned();

        let promotion_pieces: Vec<String> = map
            .get("promotion_pieces")
            .and_then(|v| v.clone().try_cast::<rhai::Array>())
            .map(|arr: rhai::Array| {
                arr.iter()
                    .filter_map(|v: &rhai::Dynamic| v.clone().into_string().ok())
                    .collect()
            })
            .unwrap_or_else(default_promotion_pieces);

        let board: BoardScriptConfig = map
            .get("board")
            .ok_or_else(|| error::CvError::Internal("config missing 'board' field".into()))?
            .clone()
            .try_into()?;

        Ok(VariantConfig {
            name,
            version,
            api_version,
            colors,
            allowed_player_count,
            reserve_pile,
            check_protection,
            pieces,
            promotion_pieces,
            board,
        })
    }
}
