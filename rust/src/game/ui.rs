//! UI helpers for the chess variant engine.
//!
//! Minimal module — the heavy lifting (extracting closures, building JSON)
//! happens in lib.rs since it needs access to the Rhai Engine and AST.

use serde::{Deserialize, Serialize};

/// Result returned by `handleMove` and `uiInteraction`.
/// The `ui` field is a JSON map `{ elementId: {...} }` (object, not array).
/// The `game_over` field mirrors `state.game_over` — `null` if the game is ongoing.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct MoveResult {
    pub ui: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_over: Option<serde_json::Value>,
}