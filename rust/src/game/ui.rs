use rhai::{Array, Dynamic};
use serde::{Deserialize, Serialize};

/// A UI element returned by `handle_event`.  The frontend renders it on top of
/// the board canvas.  Each interactive element specifies an `action` string —
/// when the player interacts, the frontend fires `{ type: action, value: ... }`.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum UiElement {
    /// A multiple-choice modal (promotion, gating, …).
    /// Fires `{ type: action, value: selectedOption }`.
    Choice {
        /// Event type fired on selection, e.g. "promote", "gate".
        action: String,
        title: String,
        options: Vec<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        players: Option<Vec<UiPlayerFilter>>,
    },
    /// A non-interactive info banner.
    Banner {
        id: String,
        text: String,
        style: UiBannerStyle,
        #[serde(skip_serializing_if = "Option::is_none")]
        players: Option<Vec<UiPlayerFilter>>,
    },
    /// A clickable button.
    /// Fires `{ type: action }` (no value).
    Button {
        /// Event type fired on click, e.g. "pass", "resign".
        action: String,
        label: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        players: Option<Vec<UiPlayerFilter>>,
    },
}

/// Visual style for banners.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UiBannerStyle {
    Info,
    Warning,
    Error,
}

/// Visibility filter — which players see a UI element.
/// `None` on the `players` field means everyone sees it.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum UiPlayerFilter {
    /// Specific player name (e.g. "white", "black-a").
    Named(String),
    /// All players on this team.
    Team { team: i32 },
}

/// Result returned by `handle_event`. The engine stores the new state internally;
/// this struct carries the UI instructions back to the frontend.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct HandleEventResult {
    pub ui: Vec<UiElement>,
    /// If set, the game is over. Contains the Winner/Winners/Draw payload from the script.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_over: Option<serde_json::Value>,
}

/// Parse the `ui` field from the value returned by a Rhai `handle_event` call.
///
/// Rhai scripts return `#{ state: ..., ui: [...] }`.
/// Each ui element is a map, e.g.:
/// ```rhai
/// #{ type: "choice", action: "promote", title: "Promote", options: ["queen", ...], players: ["white"] }
/// ```
pub fn parse_ui_elements(dyn_val: Dynamic) -> Result<Vec<UiElement>, crate::error::CvError> {
    let arr = match dyn_val.try_cast::<Array>() {
        Some(a) => a,
        None => return Ok(vec![]),
    };

    let mut result = Vec::new();
    for item in arr {
        let map = match item.try_cast::<rhai::Map>() {
            Some(m) => m,
            None => continue,
        };

        let type_str = map
            .get("type")
            .and_then(|v| v.clone().into_string().ok())
            .unwrap_or_default();

        let players = parse_players_filter(map.get("players").cloned());

        let element = match type_str.as_str() {
            "choice" => {
                let action = map
                    .get("action")
                    .and_then(|v| v.clone().into_string().ok())
                    .unwrap_or_default();
                let title = map
                    .get("title")
                    .and_then(|v| v.clone().into_string().ok())
                    .unwrap_or_default();
                let options = map
                    .get("options")
                    .and_then(|v| v.clone().try_cast::<Array>())
                    .map(|arr| {
                        arr.into_iter()
                            .filter_map(|v| v.into_string().ok())
                            .collect()
                    })
                    .unwrap_or_default();
                UiElement::Choice { action, title, options, players }
            }
            "banner" => {
                let id = map
                    .get("id")
                    .and_then(|v| v.clone().into_string().ok())
                    .unwrap_or_default();
                let text = map
                    .get("text")
                    .and_then(|v| v.clone().into_string().ok())
                    .unwrap_or_default();
                let style = parse_banner_style(
                    map.get("style").and_then(|v| v.clone().into_string().ok()),
                );
                UiElement::Banner { id, text, style, players }
            }
            "button" => {
                let action = map
                    .get("action")
                    .and_then(|v| v.clone().into_string().ok())
                    .unwrap_or_default();
                let label = map
                    .get("label")
                    .and_then(|v| v.clone().into_string().ok())
                    .unwrap_or_default();
                UiElement::Button { action, label, players }
            }
            _ => continue, // skip unknown element types
        };

        result.push(element);
    }

    Ok(result)
}

fn parse_banner_style(s: Option<String>) -> UiBannerStyle {
    match s.as_deref() {
        Some("warning") => UiBannerStyle::Warning,
        Some("error") => UiBannerStyle::Error,
        _ => UiBannerStyle::Info,
    }
}

fn parse_players_filter(dyn_val: Option<Dynamic>) -> Option<Vec<UiPlayerFilter>> {
    let val = dyn_val?;

    // "all" string → None (visible to everyone)
    if val.clone().into_string().ok().as_deref() == Some("all") {
        return None;
    }

    // Array of player names or team maps
    let arr = val.try_cast::<Array>()?;
    let filters: Vec<UiPlayerFilter> = arr
        .into_iter()
        .filter_map(|item| {
            if let Ok(name) = item.clone().into_string() {
                Some(UiPlayerFilter::Named(name))
            } else if let Some(map) = item.try_cast::<rhai::Map>() {
                let team = map.get("team")?.as_int().ok()? as i32;
                Some(UiPlayerFilter::Team { team })
            } else {
                None
            }
        })
        .collect();

    if filters.is_empty() {
        None
    } else {
        Some(filters)
    }
}
