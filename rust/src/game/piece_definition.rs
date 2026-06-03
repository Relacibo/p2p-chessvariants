use std::collections::{HashMap, HashSet};

use rhai::Dynamic;
use serde::Deserialize;

use crate::error::CvError;

pub const BUILTIN_PIECE_NAMES: &[&str] = &["pawn", "rook", "knight", "bishop", "queen", "king"];

#[derive(Debug, Clone)]
pub enum MoveComponent {
    Slide { dirs: Vec<(i32, i32)> },
    Jump { offsets: Vec<(i32, i32)>, board_delta: i32 },
}

#[derive(Debug, Clone)]
pub enum PieceDefinition {
    /// Union of pseudo-moves from named existing piece types (builtins or other custom pieces).
    Parts(Vec<String>),
    /// Explicit movement components.
    Components(Vec<MoveComponent>),
}

pub type PieceDefinitionMap = HashMap<String, PieceDefinition>;

// ─── Intermediate serde structs ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ScriptMoveComponent {
    #[serde(rename = "type")]
    component_type: String,
    #[serde(default)]
    dirs: Vec<Vec<i64>>,
    #[serde(default)]
    offsets: Vec<Vec<i64>>,
    #[serde(default)]
    target_board_delta: i64,
}

#[derive(Debug, Deserialize)]
struct ScriptPieceDef {
    name: String,
    parts: Option<Vec<String>>,
    components: Option<Vec<ScriptMoveComponent>>,
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

fn parse_dirs(pairs: &[Vec<i64>]) -> Result<Vec<(i32, i32)>, CvError> {
    pairs
        .iter()
        .map(|pair| {
            if pair.len() != 2 {
                return Err(CvError::Internal(format!(
                    "direction/offset must be [dr, dc], got {:?}",
                    pair
                )));
            }
            Ok((pair[0] as i32, pair[1] as i32))
        })
        .collect()
}

fn parse_component(sc: ScriptMoveComponent) -> Result<MoveComponent, CvError> {
    match sc.component_type.as_str() {
        "slide" => {
            if sc.dirs.is_empty() {
                return Err(CvError::Internal(
                    "slide component requires non-empty `dirs`".into(),
                ));
            }
            Ok(MoveComponent::Slide {
                dirs: parse_dirs(&sc.dirs)?,
            })
        }
        "jump" => {
            if sc.offsets.is_empty() {
                return Err(CvError::Internal(
                    "jump component requires non-empty `offsets`".into(),
                ));
            }
            Ok(MoveComponent::Jump {
                offsets: parse_dirs(&sc.offsets)?,
                board_delta: sc.target_board_delta as i32,
            })
        }
        unknown => Err(CvError::Internal(format!(
            "unknown move component type '{}' (expected 'slide' or 'jump')",
            unknown
        ))),
    }
}

/// Parse the `Dynamic` returned by `fn pieces()` into a `PieceDefinitionMap`.
pub fn parse_pieces_dynamic(dynamic: Dynamic) -> Result<PieceDefinitionMap, CvError> {
    let script_defs: Vec<ScriptPieceDef> =
        rhai::serde::from_dynamic(&dynamic).map_err(|e| {
            CvError::Internal(format!("pieces() returned invalid data: {}", e))
        })?;

    let mut map = PieceDefinitionMap::new();
    for script_def in script_defs {
        let name = script_def.name.clone();
        let def = match (script_def.parts, script_def.components) {
            (Some(parts), None) => PieceDefinition::Parts(parts),
            (None, Some(comps)) => {
                let components: Vec<MoveComponent> = comps
                    .into_iter()
                    .map(parse_component)
                    .collect::<Result<_, _>>()?;
                PieceDefinition::Components(components)
            }
            (Some(_), Some(_)) => {
                return Err(CvError::Internal(format!(
                    "piece '{}' must have either 'parts' or 'components', not both",
                    name
                )));
            }
            (None, None) => {
                return Err(CvError::Internal(format!(
                    "piece '{}' must have either 'parts' or 'components'",
                    name
                )));
            }
        };
        map.insert(name, def);
    }

    validate_piece_defs(&map)?;
    Ok(map)
}

// ─── Validation ───────────────────────────────────────────────────────────────

fn validate_piece_defs(map: &PieceDefinitionMap) -> Result<(), CvError> {
    // No shadowing built-in names
    for name in map.keys() {
        if BUILTIN_PIECE_NAMES.contains(&name.as_str()) {
            return Err(CvError::Internal(format!(
                "piece '{}' shadows a built-in piece type",
                name
            )));
        }
    }

    // Validate Parts references and detect cycles
    for (name, def) in map {
        if let PieceDefinition::Parts(parts) = def {
            for part in parts {
                if !BUILTIN_PIECE_NAMES.contains(&part.as_str()) && !map.contains_key(part.as_str())
                {
                    return Err(CvError::Internal(format!(
                        "piece '{}' references unknown part '{}'",
                        name, part
                    )));
                }
            }
        }
    }

    for start in map.keys() {
        detect_cycle(start, map, &mut HashSet::new())?;
    }

    Ok(())
}

fn detect_cycle(
    current: &str,
    map: &PieceDefinitionMap,
    visiting: &mut HashSet<String>,
) -> Result<(), CvError> {
    if BUILTIN_PIECE_NAMES.contains(&current) {
        return Ok(());
    }
    if !visiting.insert(current.to_string()) {
        return Err(CvError::Internal(format!(
            "piece '{}' has a cyclic 'parts' reference",
            current
        )));
    }
    if let Some(PieceDefinition::Parts(parts)) = map.get(current) {
        for part in parts.clone() {
            detect_cycle(&part, map, visiting)?;
        }
    }
    visiting.remove(current);
    Ok(())
}
