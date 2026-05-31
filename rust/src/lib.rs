use error::CvError;
use game::{
    actions::Action,
    board, engine_builtins, game_result, moves,
    piece::Piece,
    standard,
    state::{Coords, ReservePileState},
    ui::{parse_ui_elements, HandleEventResult, UiElement},
    variant_config::{BoardLayoutConfig, VariantConfig},
};
use rhai::{AST, Dynamic, Engine, Scope};
use serde::Deserialize;
use std::rc::Rc;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

use crate::game::variant_config::AllowedPlayerCount;

pub mod error;
mod game;
mod logging;
mod modules;
pub mod rhai_rust_error;

// Re-exports for integration tests and external consumers
pub use game::actions::Action as ChessAction;
pub use game::board as board_helpers;
pub use game::piece::Piece as ChessPiece;
pub use game::state::{BoardCoords, BoardState, Coords as GameCoords, PlayerId};
pub use game::ui::{HandleEventResult as EngineEventResult, UiElement as EngineUiElement};

/// Player reference across WASM boundary. JSON: `{"board":0,"color":"white"}`
#[derive(Deserialize, Debug, Clone)]
struct PlayerRef {
    board: i64,
    color: String,
}

/// Convert a PlayerRef to a native PlayerId (for passing to Rhai scripts).
fn player_ref_to_player_id(p: &PlayerRef) -> PlayerId {
    PlayerId::new_full(p.board as i32, p.color.clone())
}

/// Convert a PlayerId to JSON value.
fn player_id_to_json_value(p: &PlayerId) -> serde_json::Value {
    serde_json::json!({"board": p.board, "color": p.color})
}

/// Normalize an active_players entry to JSON.
/// Accepts String shorthand `"white"` → `{board:0, color:"white"}`
/// or native `PlayerId` struct.
fn normalize_active_player(d: &Dynamic) -> Option<serde_json::Value> {
    // String shorthand: "white" → {board: 0, color: "white"}
    if let Ok(color) = d.clone().into_string() {
        return Some(serde_json::json!({"board": 0, "color": color}));
    }
    // Native PlayerId struct
    if let Some(p) = d.clone().try_cast::<PlayerId>() {
        return Some(player_id_to_json_value(&p));
    }
    // Legacy: Rhai map #{board, color} — still supported for migration
    if let Some(m) = d.clone().try_cast::<rhai::Map>() {
        let board = m.get("board").and_then(|v| v.as_int().ok()).unwrap_or(0);
        let color = m
            .get("color")
            .and_then(|v| v.clone().into_string().ok())
            .unwrap_or_default();
        return Some(serde_json::json!({"board": board, "color": color}));
    }
    None
}

/// Extract team IDs from state.players into state.teams (deduplicated, sorted).
fn populate_teams(state_map: &mut rhai::Map) {
    let players_arr = state_map
        .get("players")
        .and_then(|v| v.clone().try_cast::<rhai::Array>());
    if let Some(players) = players_arr {
        let mut team_ids: Vec<u32> = players
            .iter()
            .filter_map(|p| {
                p.clone()
                    .try_cast::<rhai::Map>()
                    .and_then(|m| m.get("team")?.as_int().ok())
                    .map(|t| t as u32)
            })
            .collect();
        team_ids.sort_unstable();
        team_ids.dedup();
        let teams_arr: rhai::Array = team_ids
            .into_iter()
            .map(|t| Dynamic::from(t as i64))
            .collect();
        state_map.insert("teams".into(), Dynamic::from(teams_arr));
    }
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[derive(Debug)]
pub struct ChessvariantEngine {
    engine: Engine,
    ast: AST,
    pub(crate) game_state: Dynamic,
    pub(crate) variant_config: VariantConfig,
    pub(crate) cached_valid_actions: Option<(String, Vec<Action>)>,
}

fn register_builtins(engine: &mut Engine) {
    use game::state::BoardCoords;

    engine
        .build_type::<game::state::BoardState>()
        .build_type::<ReservePileState>()
        .build_type::<BoardCoords>()
        .build_type::<Coords>()
        .build_type::<Piece>()
        .build_type::<BoardLayoutConfig>()
        .build_type::<Action>()
        .build_type::<PlayerId>();

    // Equality for Coords (scripts compare coords with ==)
    engine.register_fn("==", |a: Coords, b: Coords| -> bool { a == b });
    engine.register_fn("!=", |a: Coords, b: Coords| -> bool { a != b });
    // Keep BoardCoords equality for internal use
    engine.register_fn("==", |a: BoardCoords, b: BoardCoords| -> bool { a == b });
    engine.register_fn("!=", |a: BoardCoords, b: BoardCoords| -> bool { a != b });
    // Equality for PlayerId (scripts compare players with ==, .contains() uses it)
    engine.register_fn("==", |a: PlayerId, b: PlayerId| -> bool { a == b });
    engine.register_fn("!=", |a: PlayerId, b: PlayerId| -> bool { a != b });

    // Coords constructors — replace old BoardCoords-based ones
    engine.register_fn("Coords", Coords::new_board_0);  // Coords(r, c)
    engine.register_fn("Coords", Coords::new_board);    // Coords(r, c, b)
    engine.register_fn("ReserveCoords", Coords::new_reserve); // ReserveCoords(i)

    // PlayerId constructors
    engine.register_fn("Player", PlayerId::new_short);  // Player("white")
    engine.register_fn("Player", PlayerId::new_full);   // Player(1, "white")

    engine.register_fn("board_empty", game::state::BoardState::board_empty);
    engine.register_fn("board_get", board::rhai_board_get);
    engine.register_fn("board_set", board::rhai_board_set);
    engine.register_fn("board_move_piece", board::rhai_board_move_piece);
    engine.register_fn("board_find", board::rhai_board_find);
    engine.register_fn("board_find", board::rhai_board_find_piece); // overload: (board, Piece)
    engine.register_fn("board_rows", board::rhai_board_rows);
    engine.register_fn("board_cols", board::rhai_board_cols);
    engine.register_fn("board_count", board::rhai_board_count);
    engine.register_fn("ray", board::rhai_ray);
    engine.register_fn("xray", board::rhai_xray);
    engine.register_fn("jump", board::rhai_jump);
    engine.register_fn("pawn_moves", moves::rhai_pawn_moves);
    engine.register_fn("rook_moves", moves::rhai_rook_moves);
    engine.register_fn("knight_moves", moves::rhai_knight_moves);
    engine.register_fn("bishop_moves", moves::rhai_bishop_moves);
    engine.register_fn("queen_moves", moves::rhai_queen_moves);
    engine.register_fn("king_moves", moves::rhai_king_moves);
    engine.register_fn("Move", Action::rhai_move); // Move(Coords, Coords)
    engine.register_fn("Winner", game_result::rhai_winner);
    engine.register_fn("Winners", game_result::rhai_winners);
    engine.register_fn("Draw", game_result::rhai_draw);
    engine.register_fn("standard_start_position", standard::standard_start_position);
    engine.register_fn("Rectangle", BoardLayoutConfig::rhai_rectangle);
    // Rect(r1, c1, r2, c2) — rectangular region descriptor used in board config
    engine.register_fn("Rect", |r1: i32, c1: i32, r2: i32, c2: i32| -> rhai::Map {
        let mut m = rhai::Map::new();
        m.insert("r1".into(), Dynamic::from(r1));
        m.insert("c1".into(), Dynamic::from(c1));
        m.insert("r2".into(), Dynamic::from(r2));
        m.insert("c2".into(), Dynamic::from(c2));
        m
    });
    // combine(type1, type2) — declares a piece whose moves are the union of two standard pieces
    engine.register_fn("combine", |p1: String, p2: String| -> rhai::Map {
        let mut m = rhai::Map::new();
        m.insert("type".into(), Dynamic::from("combine".to_string()));
        let pieces: rhai::Array = vec![Dynamic::from(p1), Dynamic::from(p2)];
        m.insert("pieces".into(), Dynamic::from(pieces));
        m
    });
    engine.register_fn(
        "merge",
        |base: rhai::Map, updates: rhai::Map| -> rhai::Map {
            let mut result = base;
            result.extend(updates);
            result
        },
    );

    engine.register_static_module("log", Rc::new(logging::create_module()));
}

fn register_engine_builtins(engine: &mut Engine, config: &VariantConfig) {
    let check_protection = config.check_protection;
    let custom_pieces = engine_builtins::parse_custom_pieces(config.pieces.clone());

    let cp_valid = custom_pieces.clone();
    let cp_attacked = custom_pieces.clone();
    let cp_pseudo = custom_pieces;

    engine.register_fn(
        "engine_valid_actions",
        move |state: rhai::Dynamic, player: rhai::Map| -> rhai::Array {
            engine_builtins::engine_valid_actions_impl(state, player, check_protection, &cp_valid)
        },
    );

    engine.register_fn(
        "is_square_attacked",
        move |board: game::state::BoardState, coords: Coords, by_color: String| -> bool {
            let Some(bc) = coords.as_board_coords() else {
                return false;
            };
            engine_builtins::is_square_attacked(&board, &bc, &by_color, &cp_attacked)
        },
    );

    engine.register_fn(
        "pseudo_moves",
        move |board: game::state::BoardState,
              from: Coords,
              piece_type: String,
              color: String|
              -> rhai::Array {
            let Some(bc) = from.as_board_coords() else {
                return rhai::Array::new();
            };
            engine_builtins::get_pseudo_move_dests(&board, &bc, &piece_type, &color, &cp_pseudo)
                .into_iter()
                .map(|bc| Dynamic::from(Coords::from(bc)))
                .collect()
        },
    );
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl ChessvariantEngine {
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new(script_content: String, player_count: i32) -> Result<ChessvariantEngine, CvError> {
        let mut engine = Engine::new();
        let ast = engine.compile(&script_content)?;
        register_builtins(&mut engine);

        let mut scope = Scope::new();
        let dynamic_config = engine.call_fn::<Dynamic>(&mut scope, &ast, "config", ())?;
        let variant_config: VariantConfig = dynamic_config.try_into()?;

        if !variant_config
            .allowed_player_count
            .validate(player_count as u32)
        {
            return Err(CvError::Internal(format!(
                "player_count {} is not allowed by variant config",
                player_count
            )));
        }

        register_engine_builtins(&mut engine, &variant_config);
        let game_state = engine.call_fn::<Dynamic>(&mut scope, &ast, "init", (player_count,))?;

        populate_teams(
            &mut game_state
                .read_lock::<rhai::Map>()
                .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?
                .clone(),
        );

        Ok(ChessvariantEngine {
            engine,
            ast,
            game_state,
            variant_config,
            cached_valid_actions: None,
        })
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(getter))]
    pub fn name(&self) -> String {
        self.variant_config.name.clone()
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = playerCount))]
    pub fn player_count(&self) -> i32 {
        self.max_players()
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = minPlayers))]
    pub fn min_players(&self) -> i32 {
        match &self.variant_config.allowed_player_count {
            AllowedPlayerCount::Exact(n) => *n as i32,
            AllowedPlayerCount::Discrete(vals) => vals.iter().min().copied().unwrap_or(0) as i32,
            AllowedPlayerCount::Range { min, .. } => *min as i32,
        }
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = maxPlayers))]
    pub fn max_players(&self) -> i32 {
        match &self.variant_config.allowed_player_count {
            AllowedPlayerCount::Exact(n) => *n as i32,
            AllowedPlayerCount::Discrete(vals) => vals.iter().max().copied().unwrap_or(0) as i32,
            AllowedPlayerCount::Range { max, .. } => *max as i32,
        }
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = parseConfig))]
    pub fn parse_config(script_content: String) -> Result<String, CvError> {
        let mut engine = Engine::new();
        let ast = engine.compile(&script_content)?;
        register_builtins(&mut engine);

        let mut scope = Scope::new();
        let dynamic_config = engine.call_fn::<Dynamic>(&mut scope, &ast, "config", ())?;
        let variant_config: VariantConfig = dynamic_config.try_into()?;

        let json = serde_json::to_string(&variant_config)?;
        Ok(json)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = variantConfigJson))]
    pub fn variant_config_json(&self) -> Result<String, CvError> {
        let json = serde_json::to_string(&self.variant_config)?;
        Ok(json)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = boardStateJson))]
    pub fn board_state_json(&self) -> Result<String, CvError> {
        let board_dyn = self
            .game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?
            .get("board")
            .ok_or_else(|| CvError::Internal("game_state has no 'board' key".into()))?
            .clone();
        let board = if let Some(b) = board_dyn.clone().try_cast::<game::state::BoardState>() {
            b
        } else {
            rhai::serde::from_dynamic(&board_dyn)?
        };
        let json = serde_json::to_string(&board)?;
        Ok(json)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = reservePileJson))]
    pub fn reserve_pile_json(&self) -> Result<Option<String>, CvError> {
        if !self.variant_config.reserve_pile {
            return Ok(None);
        }
        let pile_dyn = {
            let map = self
                .game_state
                .read_lock::<rhai::Map>()
                .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;
            match map.get("reserve_pile") {
                Some(v) => v.clone(),
                None => return Ok(None),
            }
        };
        let pile = if let Some(p) = pile_dyn.clone().try_cast::<ReservePileState>() {
            p
        } else {
            rhai::serde::from_dynamic(&pile_dyn)?
        };
        let json = serde_json::to_string(&pile)?;
        Ok(Some(json))
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = activePlayersJson))]
    pub fn active_players_json(&self) -> Result<String, CvError> {
        let ap = self
            .game_state
            .read_lock::<rhai::Map>()
            .and_then(|m| m.get("active_players").cloned())
            .and_then(|v| v.try_cast::<rhai::Array>());
        match ap {
            Some(arr) => {
                let players: Vec<serde_json::Value> = arr
                    .iter()
                    .filter_map(|d| normalize_active_player(d))
                    .collect();
                Ok(serde_json::to_string(&players)?)
            }
            None => Ok("[]".into()),
        }
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = playersJson))]
    pub fn players_json(&self) -> Result<String, CvError> {
        let players_map = self
            .game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;
        let players_arr = players_map
            .get("players")
            .and_then(|v| v.clone().try_cast::<rhai::Array>())
            .ok_or_else(|| CvError::Internal("game_state.players not found".into()))?;

        let mut players: Vec<serde_json::Value> = Vec::new();
        for p in players_arr.iter() {
            let player_map = p
                .clone()
                .try_cast::<rhai::Map>()
                .ok_or_else(|| CvError::Internal("player is not a map".into()))?;
            let color = player_map
                .get("color")
                .and_then(|v| v.clone().into_string().ok())
                .unwrap_or_default();
            let board = player_map
                .get("board")
                .and_then(|v| v.as_int().ok())
                .unwrap_or(0) as i64;
            let team = player_map
                .get("team")
                .and_then(|v| v.as_int().ok())
                .unwrap_or(0) as i64;
            players.push(serde_json::json!({
                "color": color,
                "board": board,
                "team": team
            }));
        }
        Ok(serde_json::to_string(&players)?)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = validActionsJson))]
    pub fn valid_actions_json(&mut self, player_json: String) -> Result<String, CvError> {
        if let Some((cached_player, cached_actions)) = &self.cached_valid_actions {
            if *cached_player == player_json {
                return Ok(serde_json::to_string(cached_actions)?);
            }
        }
        let actions = self.compute_valid_actions(&player_json)?;
        self.cached_valid_actions = Some((player_json, actions.clone()));
        Ok(serde_json::to_string(&actions)?)
    }

    fn compute_valid_actions(&self, player_json: &str) -> Result<Vec<Action>, CvError> {
        // When the game is over, no moves are allowed.
        if self.is_game_over() {
            return Ok(vec![]);
        }

        let player_ref: PlayerRef = serde_json::from_str(player_json)?;
        let player = Dynamic::from(player_ref_to_player_id(&player_ref));
        let mut scope = Scope::new();
        let result = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "valid_actions",
            (self.game_state.clone(), player),
        );
        let actions_dyn = match result {
            Ok(v) => v,
            Err(e) if matches!(*e, rhai::EvalAltResult::ErrorFunctionNotFound(_, _)) => {
                return Ok(vec![]);
            }
            Err(e) => return Err(CvError::from(e)),
        };
        let all: Vec<Action> = {
            let arr = actions_dyn
                .clone()
                .try_cast::<rhai::Array>()
                .ok_or_else(|| CvError::Internal("valid_actions did not return an array".into()))?;
            arr.into_iter()
                .filter_map(|item| {
                    item.clone()
                        .try_cast::<Action>()
                        .or_else(|| rhai::serde::from_dynamic(&item).ok())
                })
                .collect()
        };
        Ok(all)
    }

    /// Send an event to the script's `handle_event` function.
    /// `player_json`:  `{"board":0,"color":"white"}`
    /// `event_json`:   `{"type":"move","from":{...},"to":{...}}` or
    ///                 `{"type":"promote","value":"queen"}`
    /// Returns a JSON array of UI elements: `[{"type":"choice","action":"promote",...}, ...]`
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = handleEventJson))]
    pub fn handle_event_json(
        &mut self,
        player_json: String,
        event_json: String,
    ) -> Result<String, CvError> {
        let player_ref: PlayerRef = serde_json::from_str(&player_json)?;
        let player = player_ref_to_player_id(&player_ref);
        let event_dyn = build_event_dynamic(&event_json)?;

        let ui = self.run_handle_event(player, event_dyn)?;

        // Extract game_over info from the current state for the frontend.
        let game_over = self.extract_game_over_dyn();

        let result = HandleEventResult { ui, game_over };
        Ok(serde_json::to_string(&result)?)
    }

    /// Set logging level.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = setLogLevel))]
    pub fn set_log_level(level: String) {
        logging::set_log_level(&level);
    }
}

/// Build a Rhai Dynamic event map from JSON, ensuring `from`/`to` are native `Coords`.
fn build_event_dynamic(event_json: &str) -> Result<Dynamic, CvError> {
    let value: serde_json::Value = serde_json::from_str(event_json)?;
    build_event_from_value(&value)
}

fn build_event_from_value(value: &serde_json::Value) -> Result<Dynamic, CvError> {
    let mut map = rhai::Map::new();

    if let Some(t) = value.get("type").and_then(|v| v.as_str()) {
        map.insert("type".into(), Dynamic::from(t.to_string()));
    }

    // Convert coord fields to native Coords
    for field in ["from", "to"] {
        if let Some(coord_val) = value.get(field) {
            let coords: Coords = serde_json::from_value(coord_val.clone())?;
            map.insert(field.into(), Dynamic::from(coords));
        }
    }

    // Pass through string fields
    for field in ["value", "piece"] {
        if let Some(v) = value.get(field).and_then(|v| v.as_str()) {
            map.insert(field.into(), Dynamic::from(v.to_string()));
        }
    }

    Ok(Dynamic::from_map(map))
}

// Native methods (not exposed to WASM — Dynamic is not a WASM ABI type).
impl ChessvariantEngine {
    /// Send an event from native Rust code (integration tests).
    /// Returns the UI elements produced by the script.
    pub fn handle_event(
        &mut self,
        player_json: String,
        event: Dynamic,
    ) -> Result<Vec<UiElement>, CvError> {
        let player_ref: PlayerRef = serde_json::from_str(&player_json)?;
        let player = player_ref_to_player_id(&player_ref);
        self.run_handle_event(player, event)
    }

    /// Core: call the Rhai `handle_event(state, player, event)` and parse the result.
    fn run_handle_event(
        &mut self,
        player: PlayerId,
        event: Dynamic,
    ) -> Result<Vec<UiElement>, CvError> {
        let mut scope = Scope::new();
        let result = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "handle_event",
            (self.game_state.clone(), Dynamic::from(player), event),
        )?;

        // Expect result to be #{ state: ..., ui: [...] }
        let result_map = result
            .try_cast::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("handle_event must return #{ state, ui }".into()))?;

        let new_state = result_map
            .get("state")
            .cloned()
            .ok_or_else(|| CvError::Internal("handle_event result missing 'state'".into()))?;

        let ui_dyn = result_map
            .get("ui")
            .cloned()
            .unwrap_or_else(|| Dynamic::from(rhai::Array::new()));

        let ui = parse_ui_elements(ui_dyn)?;

        self.game_state = new_state;
        self.cached_valid_actions = None;

        // Automatically invoke the script's check_game_over, if defined.
        self.call_check_game_over()?;

        Ok(ui)
    }

    /// Call the Rhai `check_game_over(state)` function, if it exists.
    /// If it does not exist, this is a no-op (graceful fallback).
    fn call_check_game_over(&mut self) -> Result<(), CvError> {
        let mut scope = Scope::new();
        match self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "check_game_over",
            (self.game_state.clone(),),
        ) {
            Ok(state) => {
                self.game_state = state;
                Ok(())
            }
            Err(e) if matches!(*e, rhai::EvalAltResult::ErrorFunctionNotFound(..)) => Ok(()),
            Err(e) => Err(CvError::from(e)),
        }
    }

    /// Returns true if `state.game_over` is set (not nil).
    fn is_game_over(&self) -> bool {
        self.game_state
            .read_lock::<rhai::Map>()
            .and_then(|m| m.get("game_over").cloned())
            .map(|v| !v.is_unit())
            .unwrap_or(false)
    }

    /// Extract the game_over payload from the current state for the frontend.
    fn extract_game_over_dyn(&self) -> Option<serde_json::Value> {
        let map = self.game_state.read_lock::<rhai::Map>()?;
        let go = map.get("game_over")?.clone();
        if go.is_unit() {
            return None;
        }
        // Try to cast to a Rhai map first, then convert to JSON manually.
        if let Some(go_map) = go.clone().try_cast::<rhai::Map>() {
            let mut json = serde_json::Map::new();
            for (k, v) in go_map.iter() {
                let val: serde_json::Value = if let Some(s) = v.clone().into_string().ok() {
                    serde_json::Value::String(s)
                } else if let Ok(n) = v.as_int() {
                    serde_json::json!(n)
                } else if let Some(arr) = v.clone().try_cast::<rhai::Array>() {
                    let items: Vec<serde_json::Value> = arr
                        .iter()
                        .filter_map(|d| d.as_int().ok().map(|n| serde_json::json!(n)))
                        .collect();
                    serde_json::Value::Array(items)
                } else {
                    continue;
                };
                json.insert(k.to_string(), val);
            }
            return Some(serde_json::Value::Object(json));
        }
        None
    }

    /// Returns a clone of the current game state (for integration tests).
    pub fn state(&self) -> Dynamic {
        self.game_state.clone()
    }
}
