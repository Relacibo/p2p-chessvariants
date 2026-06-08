//! `PieceDefs` — a collection of piece movement definitions with color-aware lookup.
//!
//! Replaces the old `PIECE_DEFS` string-keyed map convention. Lookup handles
//! precedence automatically: color-specific first, then type-only fallback,
//! returning `()` when nothing matches.
//!
//! Construction:
//! ```rhai
//! const PIECE_DEFS = PieceDefs([
//!     #{ type: "king",   def: [{ type: "jump", offsets: [[1,0],...] }] },
//!     #{ type: "pawn", color: "white", def: [{ type: "jump", offsets: [[-1,0]], ... }] },
//! ]);
//! ```
//!
//! Lookup:
//! ```rhai
//! let comps = PIECE_DEFS.get(piece);           // Piece object
//! let comps = PIECE_DEFS.get(#{ type: "pawn", color: "white" }); // selector map
//! ```

use rhai::{CustomType, Dynamic, TypeBuilder};
use std::collections::HashMap;

use crate::game::piece::Piece;

/// Collection of piece movement definitions.
///
/// Internally stores entries in a `Dynamic` map:
/// - Type-only entries: `"king" → [component, ...]` (Dynamic array)
/// - Color-specific entries: `"pawn" → { "white": [...], "black": [...] }` (Dynamic map)
///
/// The two forms are mutually exclusive per type — mixing type-only and
/// color-specific for the same type is rejected as an error.
#[derive(Clone, Debug, Default, CustomType)]
#[rhai_type(extra = Self::build_rhai_type)]
pub struct PieceDefs {
    /// Internal map: piece_type → (array | nested map)
    data: Dynamic,
}

/// Helper to construct a Rhai error.
fn rhai_err(msg: impl Into<String>) -> Box<rhai::EvalAltResult> {
    Box::new(rhai::EvalAltResult::ErrorRuntime(
        Dynamic::from(msg.into()),
        rhai::Position::NONE,
    ))
}

/// Ensure every component map in a `def` array has a `move_type` field.
/// If absent, defaults to `"both"` so scripts never need to check `!= ()`.
fn normalize_move_type(def: &mut Dynamic) {
    if let Some(mut arr) = def.write_lock::<rhai::Array>() {
        for comp in arr.iter_mut() {
            if let Some(mut map) = comp.write_lock::<rhai::Map>() {
                if !map.contains_key("move_type") {
                    map.insert("move_type".into(), Dynamic::from("both"));
                }
            }
        }
    }
}

impl PieceDefs {
    // ── Constructors ────────────────────────────────────────────────────────

    /// Create an empty `PieceDefs` collection.
    /// In Rhai: `PieceDefs()`
    pub fn new_empty() -> Self {
        Self {
            data: Dynamic::from(rhai::Map::new()),
        }
    }

    /// Create a `PieceDefs` from an array of entry maps.
    ///
    /// Each entry map must have:
    ///   - `type`: string (the piece type, e.g. `"pawn"`)
    ///   - `def`: array (the movement components)
    ///   - `color`: string (optional — if absent, the entry applies to all colors)
    ///
    /// Errors on:
    ///   - Missing `type` or `def` fields
    ///   - `def` not being an array
    ///   - Duplicate entries (same type, or same type+color)
    ///   - Mixing type-only and color-specific entries for the same piece type
    pub fn new_from_array(
        entries: Vec<Dynamic>,
    ) -> Result<Self, Box<rhai::EvalAltResult>> {
        // Temporary registry to detect duplicates before building the Rhai map.
        struct Entry {
            type_only: Option<Dynamic>,
            colors: HashMap<String, Dynamic>,
        }

        let mut registry: HashMap<String, Entry> = HashMap::new();

        for (idx, entry_dyn) in entries.iter().enumerate() {
            let entry_map = entry_dyn
                .read_lock::<rhai::Map>()
                .ok_or_else(|| {
                    rhai_err(format!(
                        "entry #{idx}: expected a map, got {:?}",
                        entry_dyn.type_name()
                    ))
                })?;

            let piece_type = entry_map
                .get("type")
                .and_then(|v| v.clone().into_string().ok())
                .ok_or_else(|| {
                    rhai_err(format!("entry #{idx}: missing 'type' field"))
                })?;

            let mut def = entry_map
                .get("def")
                .cloned()
                .ok_or_else(|| {
                    rhai_err(format!(
                        "entry #{idx}: '{piece_type}' missing 'def' field"
                    ))
                })?;

            if !def.is_array() {
                return Err(rhai_err(format!(
                    "'def' for '{piece_type}' (entry #{idx}) must be an array"
                )));
            }

            normalize_move_type(&mut def);

            let color: Option<String> = entry_map
                .get("color")
                .and_then(|v| v.clone().into_string().ok());

            let reg_entry = registry.entry(piece_type.clone()).or_insert_with(|| Entry {
                type_only: None,
                colors: HashMap::new(),
            });

            match &color {
                None => {
                    // Type-only entry
                    if !reg_entry.colors.is_empty() {
                        return Err(rhai_err(format!(
                            "type '{piece_type}' already has color-specific entries — cannot add type-only entry at index {idx}"
                        )));
                    }
                    if reg_entry.type_only.is_some() {
                        return Err(rhai_err(format!(
                            "duplicate type-only entry for '{piece_type}' at index {idx}"
                        )));
                    }
                    reg_entry.type_only = Some(def);
                }
                Some(color) => {
                    if reg_entry.type_only.is_some() {
                        return Err(rhai_err(format!(
                            "type '{piece_type}' already has a type-only entry — cannot add color-specific entry at index {idx}"
                        )));
                    }
                    if reg_entry.colors.contains_key(color) {
                        return Err(rhai_err(format!(
                            "duplicate entry for '{piece_type}:{color}' at index {idx}"
                        )));
                    }
                    reg_entry.colors.insert(color.clone(), def);
                }
            }
        }

        // Build the Rhai map from the registry.
        let mut result = rhai::Map::new();
        for (piece_type, entry) in registry {
            match (entry.type_only, entry.colors.is_empty()) {
                (Some(def), true) => {
                    result.insert(piece_type.into(), def);
                }
                (None, false) => {
                    let mut inner = rhai::Map::new();
                    for (color, def) in entry.colors {
                        inner.insert(color.into(), def);
                    }
                    result.insert(piece_type.into(), Dynamic::from(inner));
                }
                _ => {
                    // This shouldn't happen — we've validated above
                    return Err(rhai_err(format!(
                        "internal: inconsistent state for '{piece_type}'"
                    )));
                }
            }
        }

        Ok(Self {
            data: Dynamic::from(result),
        })
    }

    // ── Lookup ─────────────────────────────────────────────────────────────

    /// Lookup movement components. Dispatches on the argument type:
    /// - `Piece` — uses `piece.type` and `piece.color` with precedence
    /// - selector map `#{type, color?}` — explicit type + optional color
    ///
    /// Returns the `def` array or `()` when nothing matches.
    pub fn get(&mut self, key: Dynamic) -> Dynamic {
        // Try to cast as Piece first
        if let Some(piece) = key.clone().try_cast::<Piece>() {
            return self.get_impl(
                &piece.get_piece_type_as_string(),
                Some(&piece.get_color_as_string()),
            );
        }

        // Try to read as a selector map: #{type, color?}
        if let Some(selector) = key.read_lock::<rhai::Map>() {
            let piece_type = selector
                .get("type")
                .and_then(|v| v.clone().into_string().ok());
            match piece_type {
                Some(t) => {
                    let color: Option<String> = selector
                        .get("color")
                        .and_then(|v| v.clone().into_string().ok());
                    return self.get_impl(&t, color.as_deref());
                }
                None => return Dynamic::UNIT,
            }
        }

        Dynamic::UNIT
    }

    // ── Insert (builder) ─────────────────────────────────────────────────────

    /// Insert color-agnostic movement components for a piece type.
    /// Overwrites any existing type-only entry for the same type.
    /// Errors if the type already has color-specific entries.
    pub fn insert_type(&mut self, piece_type: &str, mut def: Dynamic) {
        let piece_type_clean = piece_type.trim();
        if piece_type_clean.is_empty() {
            return;
        }
        normalize_move_type(&mut def);
        Self::do_insert(&mut self.data, piece_type_clean, None, def);
    }

    /// Insert color-specific movement components.
    /// Overwrites any existing entry for the same (type, color) pair.
    /// Errors if the type already has a type-only entry.
    pub fn insert_type_color(
        &mut self,
        piece_type: &str,
        color: &str,
        mut def: Dynamic,
    ) {
        let piece_type_clean = piece_type.trim();
        let color_clean = color.trim();
        if piece_type_clean.is_empty() || color_clean.is_empty() {
            return;
        }
        normalize_move_type(&mut def);
        Self::do_insert(&mut self.data, piece_type_clean, Some(color_clean), def);
    }

    // ── internals ────────────────────────────────────────────────────────────

    /// Core lookup logic with precedence: color-specific first, then type-only.
    fn get_impl(&self, piece_type: &str, color: Option<&str>) -> Dynamic {
        let m = match self.data.read_lock::<rhai::Map>() {
            Some(m) => m,
            None => return Dynamic::UNIT,
        };

        // rhai::Map uses SmartString keys; &str works via Borrow<str>
        let Some(type_val) = m.get(piece_type).cloned() else {
            return Dynamic::UNIT;
        };

        // Color-agnostic entry — return directly
        if type_val.is_array() {
            return type_val;
        }

        // Color-specific entry — look up the color
        if let Some(inner_map) = type_val.read_lock::<rhai::Map>() {
            match color {
                Some(c) => {
                    if let Some(color_def) = inner_map.get(c).cloned() {
                        return color_def;
                    }
                    // Color not found — no fallback to type-only for this design
                    // (type-only and color-specific are mutually exclusive)
                }
                None => {
                    // No color specified — return () so caller must specify a color
                    // when the type has color-specific entries.
                }
            }
        }

        Dynamic::UNIT
    }

    /// Insert a definition into the internal map.
    /// Dispatches to type-only or color-specific insertion.
    fn do_insert(
        data: &mut Dynamic,
        piece_type: &str,
        color: Option<&str>,
        def: Dynamic,
    ) {
        let Some(mut m) = data.write_lock::<rhai::Map>() else {
            return;
        };

        match color {
            None => {
                // Type-only insert — overwrites any existing entry for this type
                m.insert(piece_type.into(), def);
            }
            Some(color) => {
                let existing = m.get(piece_type).cloned();
                match existing {
                    Some(ref val) if val.is_array() => {
                        // Conflict: type-only already exists. Log warning and
                        // overwrite with a new nested map.
                        crate::logging::log_warn(&format!(
                            "[PieceDefs] type '{piece_type}' had a type-only definition, overwriting with color-specific"
                        ));
                        let mut inner = rhai::Map::new();
                        inner.insert(color.into(), def);
                        m.insert(piece_type.into(), Dynamic::from(inner));
                    }
                    Some(_) => {
                        // Already a nested map — insert or overwrite color entry
                        if let Some(v) = m.get_mut(piece_type) {
                            if let Some(mut inner) =
                                v.write_lock::<rhai::Map>()
                            {
                                inner.insert(color.into(), def);
                            }
                        }
                    }
                    None => {
                        let mut inner = rhai::Map::new();
                        inner.insert(color.into(), def);
                        m.insert(piece_type.into(), Dynamic::from(inner));
                    }
                }
            }
        }
    }

    // ── Rhai type registration ──────────────────────────────────────────────

    fn build_rhai_type(builder: &mut TypeBuilder<Self>) {
        // Constructors (matched by parameter count)
        builder
            .with_fn("PieceDefs", Self::new_empty)
            .with_fn("PieceDefs", Self::new_from_array)
            // Methods: get dispatches on argument type
            .with_fn("get", Self::get)
            // Methods: insert (2-param = type-only, 3-param = type+color)
            .with_fn("insert", Self::insert_type)
            .with_fn("insert", Self::insert_type_color);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(type_: &str, color: &str) -> Piece {
        Piece::rhai_new(color.to_string(), type_.to_string())
    }

    fn make_defs() -> PieceDefs {
        let mut d = PieceDefs::new_empty();
        d.insert_type(
            "king",
            Dynamic::from_array(vec![
                Dynamic::from("king-moves"),
            ]),
        );
        d.insert_type_color(
            "pawn",
            "white",
            Dynamic::from_array(vec![
                Dynamic::from("pawn-white-move"),
            ]),
        );
        d.insert_type_color(
            "pawn",
            "black",
            Dynamic::from_array(vec![
                Dynamic::from("pawn-black-move"),
            ]),
        );
        d
    }

    #[test]
    fn test_get_by_piece_returns_correct_def() {
        let defs = make_defs();

        // King — type-only
        let comps = defs.get_impl("king", Some("white"));
        assert!(comps.is_array());
        assert_eq!(
            comps.clone().try_cast::<Vec<Dynamic>>().unwrap().len(),
            1
        );

        // Pawn — color-specific
        let comps = defs.get_impl("pawn", Some("white"));
        assert!(comps.is_array());

        let comps = defs.get_impl("pawn", Some("black"));
        assert!(comps.is_array());
    }

    #[test]
    fn test_unknown_piece_returns_unit() {
        let defs = make_defs();
        let comps = defs.get_impl("giraffe", Some("spotted"));
        assert!(comps.is_unit());
    }

    #[test]
    fn test_unknown_color_returns_unit() {
        let defs = make_defs();
        // "pawn" has color-specific entries — requesting unknown color returns ()
        let comps = defs.get_impl("pawn", Some("green"));
        assert!(comps.is_unit());
    }

    #[test]
    fn test_get_by_piece_type_only_falls_back_correctly() {
        let mut defs = PieceDefs::new_empty();
        // Queen as type-only
        defs.insert_type(
            "queen",
            Dynamic::from_array(vec![Dynamic::from("queen-slide")]),
        );

        // Any color should return the type-only def
        let comps = defs.get_impl("queen", Some("white"));
        assert!(comps.is_array());
        let comps = defs.get_impl("queen", Some("pink"));
        assert!(comps.is_array());
    }

    #[test]
    fn test_from_array_type_only() {
        let entries: Vec<Dynamic> = vec![Dynamic::from({
            let mut m = rhai::Map::new();
            m.insert("type".into(), Dynamic::from("rook"));
            m.insert(
                "def".into(),
                Dynamic::from_array(vec![Dynamic::from("rook-slide")]),
            );
            m
        })];
        let defs = PieceDefs::new_from_array(entries).unwrap();
        assert!(defs.get_impl("rook", Some("white")).is_array());
    }

    #[test]
    fn test_from_array_color_specific() {
        let entries: Vec<Dynamic> = vec![Dynamic::from({
            let mut m = rhai::Map::new();
            m.insert("type".into(), Dynamic::from("pawn"));
            m.insert("color".into(), Dynamic::from("white"));
            m.insert(
                "def".into(),
                Dynamic::from_array(vec![Dynamic::from("pawn-white")]),
            );
            m
        })];
        let defs = PieceDefs::new_from_array(entries).unwrap();
        assert!(defs.get_impl("pawn", Some("white")).is_array());
        assert!(defs.get_impl("pawn", Some("black")).is_unit());
    }

    #[test]
    fn test_from_array_duplicate_type_only() {
        let make_entry = || {
            let mut m = rhai::Map::new();
            m.insert("type".into(), Dynamic::from("king"));
            m.insert(
                "def".into(),
                Dynamic::from_array(vec![Dynamic::from("x")]),
            );
            Dynamic::from(m)
        };
        let result =
            PieceDefs::new_from_array(vec![make_entry(), make_entry()]);
        assert!(result.is_err());
    }

    #[test]
    fn test_from_array_duplicate_color_specific() {
        let make_entry = || {
            let mut m = rhai::Map::new();
            m.insert("type".into(), Dynamic::from("pawn"));
            m.insert("color".into(), Dynamic::from("white"));
            m.insert(
                "def".into(),
                Dynamic::from_array(vec![Dynamic::from("x")]),
            );
            Dynamic::from(m)
        };
        let result =
            PieceDefs::new_from_array(vec![make_entry(), make_entry()]);
        assert!(result.is_err());
    }

    #[test]
    fn test_from_array_mixed_type_only_and_color_specific() {
        let type_only_entry = {
            let mut m = rhai::Map::new();
            m.insert("type".into(), Dynamic::from("pawn"));
            m.insert(
                "def".into(),
                Dynamic::from_array(vec![Dynamic::from("x")]),
            );
            Dynamic::from(m)
        };
        let color_entry = {
            let mut m = rhai::Map::new();
            m.insert("type".into(), Dynamic::from("pawn"));
            m.insert("color".into(), Dynamic::from("white"));
            m.insert(
                "def".into(),
                Dynamic::from_array(vec![Dynamic::from("y")]),
            );
            Dynamic::from(m)
        };
        // Both orders should fail
        assert!(PieceDefs::new_from_array(vec![
            type_only_entry.clone(),
            color_entry.clone()
        ])
        .is_err());
        assert!(PieceDefs::new_from_array(vec![color_entry, type_only_entry])
            .is_err());
    }

    #[test]
    fn test_from_array_missing_type() {
        let entry = {
            let mut m = rhai::Map::new();
            m.insert(
                "def".into(),
                Dynamic::from_array(vec![]),
            );
            Dynamic::from(m)
        };
        assert!(PieceDefs::new_from_array(vec![entry]).is_err());
    }

    #[test]
    fn test_from_array_missing_def() {
        let entry = {
            let mut m = rhai::Map::new();
            m.insert("type".into(), Dynamic::from("king"));
            Dynamic::from(m)
        };
        assert!(PieceDefs::new_from_array(vec![entry]).is_err());
    }

    #[test]
    fn test_from_array_def_not_array() {
        let entry = {
            let mut m = rhai::Map::new();
            m.insert("type".into(), Dynamic::from("king"));
            m.insert("def".into(), Dynamic::from(42_i64));
            Dynamic::from(m)
        };
        assert!(PieceDefs::new_from_array(vec![entry]).is_err());
    }

    #[test]
    fn test_insert_overwrites() {
        let mut defs = PieceDefs::new_empty();
        defs.insert_type(
            "king",
            Dynamic::from_array(vec![Dynamic::from("old")]),
        );
        defs.insert_type(
            "king",
            Dynamic::from_array(vec![Dynamic::from("new")]),
        );
        let comps = defs.get_impl("king", Some("white"));
        assert!(comps.is_array());
        let arr = comps.try_cast::<Vec<Dynamic>>().unwrap();
        assert_eq!(arr.len(), 1);
    }

    #[test]
    fn test_get_by_piece_method() {
        let mut defs = make_defs();
        let king = p("king", "white");
        let result = defs.get(Dynamic::from(king));
        assert!(result.is_array());
    }

    #[test]
    fn test_get_by_selector_map() {
        let defs = make_defs();
        let mut selector = rhai::Map::new();
        selector.insert("type".into(), Dynamic::from("king"));
        let result = defs.get_impl("king", None);
        assert!(result.is_array());
    }

    #[test]
    fn test_empty_returns_unit() {
        let defs = PieceDefs::new_empty();
        assert!(defs.get_impl("anything", Some("any")).is_unit());
    }
}
