use error::CvError;
use game::{
    actions::Action,
    board,
    game_result,
    piece::Piece,
    standard,
    state::Coords,
    variant_config::VariantConfig,
};
use modules::builtins;
use rhai::{AST, Dynamic, Engine, Scope};
use serde::{Deserialize, Serialize};
use std::rc::Rc;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

pub mod error;
mod game;
mod logging;
mod modules;
pub mod rhai_rust_error;

// Re-exports for integration tests and external consumers
pub use game::state::{BoardCoords, BoardState, Coords as GameCoords, PlayerId};

/// Player reference across WASM boundary. JSON: `{"board":0,"color":"white"}`
#[derive(Deserialize, Serialize, Debug, Clone)]
pub(crate) struct PlayerRef {
    board: i64,
    color: String,
}

/// A player's valid actions, as returned by `valid_actions(state, player)`.
#[derive(Clone, Debug, Serialize)]
pub struct PlayerActions {
    pub player: PlayerId,
    pub actions: Vec<Action>,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[derive(Debug)]
pub struct ChessvariantEngine {
    engine: Engine,
    ast: AST,
    pub(crate) game_state: Dynamic,
    pub(crate) variant_config: VariantConfig,
    pub(crate) cached_valid_actions: Option<Vec<PlayerActions>>,
}

// ─── Builtin Registration ────────────────────────────────────────────────────

fn register_builtins(engine: &mut Engine) {
    use game::state::BoardCoords;

    engine
        .build_type::<BoardState>()
        .build_type::<game::state::ReservePileState>()
        .build_type::<BoardCoords>()
        .build_type::<Coords>()
        .build_type::<Piece>()
        .build_type::<game::variant_config::BoardLayoutConfig>()
        .build_type::<Action>()
        .build_type::<PlayerId>();

    // ── Legacy global aliases (backward compat for existing variant scripts) ──
    // These are duplicates of engine::board::* — remove once all scripts migrate.
    engine.register_fn("board_empty", BoardState::board_empty);
    engine.register_fn("board_get", board::rhai_board_get);
    engine.register_fn("board_set", board::rhai_board_set);
    engine.register_fn("board_move_piece", board::rhai_board_move_piece);
    engine.register_fn("board_find", board::rhai_board_find_piece);

    // Equality operators
    engine.register_fn("==", |a: Coords, b: Coords| -> bool { a == b });
    engine.register_fn("!=", |a: Coords, b: Coords| -> bool { a != b });
    engine.register_fn("==", |a: BoardCoords, b: BoardCoords| -> bool { a == b });
    engine.register_fn("!=", |a: BoardCoords, b: BoardCoords| -> bool { a != b });
    engine.register_fn("==", |a: PlayerId, b: PlayerId| -> bool {
        a.board == b.board && a.color == b.color
    });
    engine.register_fn("!=", |a: PlayerId, b: PlayerId| -> bool {
        a.board != b.board || a.color != b.color
    });

    // ── Global constructors (remain bare, not namespaced) ──
    engine.register_fn("Coords", Coords::new_board_0);
    engine.register_fn("Coords", Coords::new_board);
    engine.register_fn("ReserveCoords", Coords::new_reserve);
    engine.register_fn("Player", PlayerId::new_short);
    engine.register_fn("Player", PlayerId::new_full);
    engine.register_fn("Move", Action::rhai_move);
    engine.register_fn("SelectPiece", Action::rhai_select_piece);
    engine.register_fn("Interact", Action::rhai_interact);
    engine.register_fn("Cancel", Action::rhai_cancel);
    engine.register_fn("Piece", Piece::rhai_new);
    engine.register_fn("Winner", game_result::rhai_winner);
    engine.register_fn("Winners", game_result::rhai_winners);
    engine.register_fn("Draw", game_result::rhai_draw);
    engine.register_fn("standard_start_position", standard::standard_start_position);
    // merge(base, updates) — shallow map merge
    engine.register_fn(
        "merge",
        |base: rhai::Map, updates: rhai::Map| -> rhai::Map {
            let mut result = base;
            result.extend(updates);
            result
        },
    );
    // Rect(r1,c1,r2,c2) — board config region
    engine.register_fn("Rect", |r1: i32, c1: i32, r2: i32, c2: i32| -> rhai::Map {
        let mut m = rhai::Map::new();
        m.insert("r1".into(), Dynamic::from(r1));
        m.insert("c1".into(), Dynamic::from(c1));
        m.insert("r2".into(), Dynamic::from(r2));
        m.insert("c2".into(), Dynamic::from(c2));
        m
    });

    // ── Namespaced modules (static, no config dependency) ──
    engine.register_static_module("engine::board", Rc::new(builtins::create_board_submodule()));
    engine.register_static_module("log", Rc::new(builtins::create_log_module()));
}

fn register_engine_helpers(engine: &mut Engine) {
    // Custom pieces map — empty by default; scripts that define custom pieces
    // via their own logic can use engine::pseudo_moves with the component
    // piece type names directly.
    let custom_pieces = std::collections::HashMap::new();

    let cp_attacked = custom_pieces.clone();
    let cp_pseudo = custom_pieces.clone();
    let cp_legal = custom_pieces;

    engine.register_fn(
        "engine::is_square_attacked",
        move |board: BoardState,
              coords: Coords,
              by_color: String|
              -> bool {
            let Some(bc) = coords.as_board_coords() else {
                return false;
            };
            game::engine_builtins::is_square_attacked(&board, &bc, &by_color, &cp_attacked)
        },
    );

    engine.register_fn(
        "engine::pseudo_moves",
        move |board: BoardState,
              from: Coords,
              piece_type: String,
              color: String|
              -> Vec<Coords> {
            let Some(bc) = from.as_board_coords() else {
                return vec![];
            };
            game::engine_builtins::get_pseudo_move_dests(
                &board, &bc, &piece_type, &color, &cp_pseudo,
            )
            .into_iter()
            .map(Coords::from)
            .collect()
        },
    );

    // engine::is_legal(board, from, to, color) — check protection (king safety)
    let cp_legal2 = cp_legal.clone();
    engine.register_fn(
        "engine::is_legal",
        move |board: BoardState, from: Coords, to: Coords, color: String| -> bool {
            let Some(from_bc) = from.as_board_coords() else { return false; };
            let Some(to_bc) = to.as_board_coords() else { return false; };
            let mut temp = board.clone();
            game::engine_builtins::apply_move_to_board(&mut temp, &from_bc, &to_bc);
            !game::engine_builtins::is_king_in_check(&temp, &color, &cp_legal)
        },
    );
    // Also register as bare global for testing
    engine.register_fn(
        "is_legal",
        move |board: BoardState, from: Coords, to: Coords, color: String| -> bool {
            let Some(from_bc) = from.as_board_coords() else { return false; };
            let Some(to_bc) = to.as_board_coords() else { return false; };
            let mut temp = board.clone();
            game::engine_builtins::apply_move_to_board(&mut temp, &from_bc, &to_bc);
            !game::engine_builtins::is_king_in_check(&temp, &color, &cp_legal2)
        },
    );

    // moves sub-module
    engine.register_static_module("engine::moves", Rc::new(builtins::create_moves_submodule()));
    // Utilities on engine:: namespace
    engine.register_fn(
        "engine::merge",
        |base: rhai::Map, updates: rhai::Map| -> rhai::Map {
            let mut result = base;
            result.extend(updates);
            result
        },
    );
    engine.register_fn("engine::standard_start_position", standard::standard_start_position);
}

// ─── Player ID helpers ───────────────────────────────────────────────────────

/// Convert a PlayerRef to PlayerId. Reads team from state.players.
fn player_ref_to_player_id(state: &Dynamic, pref: &PlayerRef) -> PlayerId {
    // Read team from state.players
    if let Some(players_map_lock) = state.read_lock::<rhai::Map>() {
        if let Some(arr) = players_map_lock
            .get("players")
            .cloned()
            .and_then(|v: rhai::Dynamic| v.try_cast::<rhai::Array>())
        {
            for p in arr {
                if let Some(m) = p.clone().try_cast::<rhai::Map>() {
                    let color = m
                        .get("color")
                        .cloned()
                        .and_then(|v: rhai::Dynamic| v.into_string().ok())
                        .unwrap_or_default();
                    let board: i32 = m
                        .get("board")
                        .cloned()
                        .and_then(|v: rhai::Dynamic| v.as_int().ok())
                        .map(|v| v as i32)
                        .unwrap_or(0);
                    if color == pref.color && board == pref.board as i32 {
                        let team: i32 = m
                            .get("team")
                            .cloned()
                            .and_then(|v: rhai::Dynamic| v.as_int().ok())
                            .map(|v| v as i32)
                            .unwrap_or(0);
                        return PlayerId::with_team(
                            pref.board as i32,
                            pref.color.clone(),
                            team,
                        );
                    }
                }
            }
        }
    }
    // Fallback: team 0
    PlayerId::with_team(pref.board as i32, pref.color.clone(), 0)
}

/// Convert a Rhai Map (and nested values) to a serde_json::Value.
fn rhai_map_to_json(map: &rhai::Map) -> serde_json::Value {
    let mut json_map = serde_json::Map::new();
    for (key, value) in map {
        let json_value = rhai_dynamic_to_json(value);
        json_map.insert(key.to_string(), json_value);
    }
    serde_json::Value::Object(json_map)
}

fn rhai_dynamic_to_json(value: &rhai::Dynamic) -> serde_json::Value {
    if value.is::<rhai::Map>() {
        let map = value.read_lock::<rhai::Map>().unwrap();
        rhai_map_to_json(&map)
    } else if value.is::<rhai::Array>() {
        let arr = value.read_lock::<rhai::Array>().unwrap();
        let json_arr: Vec<serde_json::Value> = arr.iter().map(rhai_dynamic_to_json).collect();
        serde_json::Value::Array(json_arr)
    } else if let Ok(s) = value.clone().into_string() {
        serde_json::Value::String(s)
    } else if let Ok(n) = value.as_int() {
        serde_json::Value::Number(serde_json::Number::from(n))
    } else if value.is::<f64>() {
        let f: f64 = value.clone().cast();
        serde_json::Number::from_f64(f)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null)
    } else if value.is_bool() {
        let b: bool = value.clone().cast();
        serde_json::Value::Bool(b)
    } else if value.is_unit() {
        serde_json::Value::Null
    } else {
        // Fallback: string representation
        serde_json::Value::String(format!("{:?}", value))
    }
}

// ─── Constructor ─────────────────────────────────────────────────────────────

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

        register_engine_helpers(&mut engine);
        let game_state = engine.call_fn::<Dynamic>(&mut scope, &ast, "init", (player_count,))?;

        let mut cv_engine = ChessvariantEngine {
            engine,
            ast,
            game_state,
            variant_config,
            cached_valid_actions: None,
        };

        // Compute valid_actions for the initial state to cache it
        let initial_actions = cv_engine.compute_valid_actions_all()?;
        cv_engine.cached_valid_actions = Some(initial_actions);

        Ok(cv_engine)
    }

    // ── Getters ──

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
            game::variant_config::AllowedPlayerCount::Exact(n) => *n as i32,
            game::variant_config::AllowedPlayerCount::Discrete(vals) => {
                vals.iter().min().copied().unwrap_or(0) as i32
            }
            game::variant_config::AllowedPlayerCount::Range { min, .. } => *min as i32,
        }
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = maxPlayers))]
    pub fn max_players(&self) -> i32 {
        match &self.variant_config.allowed_player_count {
            game::variant_config::AllowedPlayerCount::Exact(n) => *n as i32,
            game::variant_config::AllowedPlayerCount::Discrete(vals) => {
                vals.iter().max().copied().unwrap_or(0) as i32
            }
            game::variant_config::AllowedPlayerCount::Range { max, .. } => *max as i32,
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
        let board = self.get_normalized_board()?;
        let json = serde_json::to_string(&board)?;
        Ok(json)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = playersJson))]
    pub fn players_json(&self) -> Result<String, CvError> {
        let players_map = self
            .game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;

        // If state has no "players" key, synthesize from variant config colors
        let players_arr = match players_map.get("players") {
            Some(v) => v.clone().try_cast::<rhai::Array>(),
            None => None,
        };

        let players: Vec<serde_json::Value> = if let Some(arr) = players_arr {
            arr.iter()
                .filter_map(|p| {
                    let player_map = p.clone().try_cast::<rhai::Map>()?;
                    let color = player_map
                        .get("color")
                        .and_then(|v| v.clone().into_string().ok())
                        .unwrap_or_default();
                    let board = player_map
                        .get("board")
                        .and_then(|v| v.as_int().ok())
                        .unwrap_or(0);
                    let team = player_map
                        .get("team")
                        .and_then(|v| v.as_int().ok())
                        .unwrap_or(0);
                    Some(serde_json::json!({
                        "color": color,
                        "board": board,
                        "team": team
                    }))
                })
                .collect()
        } else {
            // v1 compat: synthesize from variant config colors
            self.variant_config
                .colors
                .iter()
                .enumerate()
                .map(|(_i, color)| {
                    serde_json::json!({
                        "color": color,
                        "board": 0,
                        "team": 0
                    })
                })
                .collect()
        };

        Ok(serde_json::to_string(&players)?)
    }

    /// Returns full game state (the Rhai map) as JSON, with the board fully serialized.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = stateJson))]
    pub fn state_json(&self) -> Result<String, CvError> {
        let map = self.game_state.read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;
        // Convert Rhai Map to serde_json::Value
        let mut json = rhai_map_to_json(&map);
        // Replace the board entry (which is just a type name string) with the fully serialized board
        if let Some(obj) = json.as_object_mut() {
            if let Ok(board_json) = self.board_state_json() {
                if let Ok(board_value) = serde_json::from_str::<serde_json::Value>(&board_json) {
                    obj.insert("board".to_string(), board_value);
                }
            }
        }
        Ok(serde_json::to_string_pretty(&json)?)
    }

    /// Returns valid actions for ALL players. No player argument.
    /// Format: `[{"player": {...}, "actions": [...]}, ...]`
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = validActionsJson))]
    pub fn valid_actions_json(&mut self) -> Result<String, CvError> {
        let actions = self.compute_valid_actions_all()?;
        self.cached_valid_actions = Some(actions.clone());
        Ok(serde_json::to_string(&actions)?)
    }

    /// Submit an action. Replaces old `handleMove` + `uiInteraction`.
    /// Always returns a JSON string. On error, the result contains `"error"`.
    /// Success: `{ "valid_actions": [...], "ui": {...}, "game_over": null | {...} }`
    /// Error:   `{ "error": "message", "valid_actions": null, "ui": null, "game_over": null }`
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = submitAction))]
    pub fn submit_action_js(
        &mut self,
        player_json: String,
        action_json: String,
    ) -> String {
        match self.submit_action_js_impl(player_json, action_json) {
            Ok(json) => json,
            Err(e) => serde_json::json!({
                "error": e.to_string(),
                "valid_actions": null,
                "ui": null,
                "game_over": null,
            })
            .to_string(),
        }
    }

    /// Fetch the UI for a player without changing state (poll / page refresh).
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = getUiJson))]
    pub fn get_ui_json_js(&self, player_json: String) -> Result<String, CvError> {
        let player_ref: PlayerRef = serde_json::from_str(&player_json)?;
        let player = player_ref_to_player_id(&self.game_state, &player_ref);
        let ui = self.run_get_ui(&player)?;
        Ok(serde_json::to_string(&serde_json::json!({ "ui": ui }))?)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = setLogLevel))]
    pub fn set_log_level(level: String) {
        logging::set_log_level(&level);
    }
}

// ─── Core engine logic ───────────────────────────────────────────────────────

impl ChessvariantEngine {
    /// Internal impl for `submit_action_js` — returns `Result` so `?` works.
    fn submit_action_js_impl(
        &mut self,
        player_json: String,
        action_json: String,
    ) -> Result<String, CvError> {
        let player_ref: PlayerRef = serde_json::from_str(&player_json)?;
        let player = player_ref_to_player_id(&self.game_state, &player_ref);
        let action: Action = serde_json::from_str(&action_json)?;
        let result = self.submit_action_core(&player, &action)?;
        Ok(serde_json::to_string(&result)?)
    }

    /// Core action submission. Used both by WASM `submitAction` and native tests.
    pub fn submit_action_core(
        &mut self,
        player: &PlayerId,
        action: &Action,
    ) -> Result<serde_json::Value, CvError> {
        // 1. Compute valid_actions for THIS player only (no need to compute all players).
        let player_actions = self.compute_valid_actions_for_player(player)?;

        // 2. Validate: action type must exist in the player's actions list.
        // Specific field validation (from/to, piece, element_id) is done
        // by the script in handle_action.
        let is_legal = player_actions.iter().any(|a| {
            a.kind == action.kind
                && match a.kind.as_str() {
                    "move" => true, // any move validates (script validates specifics)
                    "select_piece" => a.piece == action.piece,
                    "interact" => a.element_id == action.element_id,
                    "cancel" => true, // cancel has no payload to validate
                    _ => true,
                }
        });
        if !is_legal {
            return Err(CvError::Internal(
                "illegal action — not in valid_actions".into(),
            ));
        }

        // 4. Call handle_action(state, player, action)
        let mut scope = Scope::new();
        let new_state = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "handle_action",
            (
                self.game_state.clone(),
                Dynamic::from(player.clone()),
                Dynamic::from(action.clone()),
            ),
        )?;

        self.game_state = new_state;
        // Invalidate cached valid_actions — frontend will refetch asynchronously
        // via validActionsJson() to avoid blocking the main thread.
        self.cached_valid_actions = None;

        // Check game_over from state.outcome (set by script's handle_action)
        let game_over = self.extract_outcome_from_state();

        // Call get_ui(new_state, player)
        let ui = self.run_get_ui(player)?;

        // Build result — valid_actions are NOT included here.
        // The frontend fetches them asynchronously via validActionsJson().
        Ok(serde_json::json!({
            "ui": ui,
            "game_over": game_over,
        }))
    }

    /// Submit a move from native Rust code (integration tests).
    /// Convenience wrapper that builds an Action and calls `submit_action_core`.
    pub fn submit_move(
        &mut self,
        player_color: &str,
        from: Coords,
        to: Coords,
    ) -> Result<serde_json::Value, CvError> {
        let player = self.find_player_by_color(player_color)?;
        let action = Action::rhai_move(from, to);
        self.submit_action_core(&player, &action)
    }

    /// Find a PlayerId in state.players by color (for test convenience).
    fn find_player_by_color(&self, color: &str) -> Result<PlayerId, CvError> {
        let players_map = self
            .game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;
        let arr: rhai::Array = players_map
            .get("players")
            .cloned()
            .and_then(|v: Dynamic| v.try_cast::<rhai::Array>())
            .unwrap_or_default();
        for p in arr {
            if let Some(pid) = p.clone().try_cast::<PlayerId>() {
                if pid.color == color {
                    return Ok(pid);
                }
            }
            if let Some(m) = p.clone().try_cast::<rhai::Map>() {
                if let Some(c) = m
                    .get("color")
                    .cloned()
                    .and_then(|v: rhai::Dynamic| v.into_string().ok())
                {
                    if c == color {
                        let board = m
                            .get("board")
                            .cloned()
                            .and_then(|v: rhai::Dynamic| v.as_int().ok())
                            .unwrap_or(0) as i32;
                        let team = m
                            .get("team")
                            .cloned()
                            .and_then(|v: rhai::Dynamic| v.as_int().ok())
                            .unwrap_or(0) as i32;
                        return Ok(PlayerId::with_team(board, c, team));
                    }
                }
            }
        }
        Err(CvError::Internal(format!(
            "player color '{}' not found in state.players",
            color
        )))
    }

    /// Returns a clone of the current game state (for integration tests).
    pub fn state(&self) -> Dynamic {
        self.game_state.clone()
    }

    /// Get the colors of currently active players from cached valid_actions (for tests).
    /// Recomputes valid_actions if cache is empty (e.g. after a submit that deferred computation).
    pub fn active_player_colors(&mut self) -> Vec<String> {
        if self.cached_valid_actions.is_none() {
            if let Ok(actions) = self.compute_valid_actions_all() {
                self.cached_valid_actions = Some(actions);
            }
        }
        self.cached_valid_actions
            .as_ref()
            .map(|v| {
                v.iter()
                    .filter(|pa| !pa.actions.is_empty())
                    .map(|pa| pa.player.color.clone())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Check if the game is over by examining cached valid_actions (for tests).
    pub fn is_game_over(&self) -> bool {
        self.cached_valid_actions
            .as_ref()
            .map(|v| v.iter().all(|pa| pa.actions.is_empty()))
            .unwrap_or_else(|| {
                // Cache not available — check state.outcome directly
                self.game_state
                    .read_lock::<rhai::Map>()
                    .map(|m| m.contains_key("outcome"))
                    .unwrap_or(false)
            })
    }

    /// Extract `state.outcome` as a Dynamic (for tests).
    pub fn outcome(&self) -> Dynamic {
        self.game_state
            .read_lock::<rhai::Map>()
            .and_then(|m| m.get("outcome").cloned())
            .unwrap_or(Dynamic::UNIT)
    }

    /// Read a piece from the board at the given coordinates.
    #[allow(dead_code)]
    fn read_piece_from_board(&self, coords: &Coords) -> Result<Piece, CvError> {
        let board = self.get_normalized_board()?;
        let bc = coords
            .as_board_coords()
            .ok_or_else(|| CvError::Internal("cannot read piece from non-board coords".into()))?;
        board
            .get_piece(&bc)
            .cloned()
            .ok_or_else(|| CvError::Internal("no piece at source square".into()))
    }

    /// Normalize the board from either v1 (array of `BoardState`) or
    /// v2 (single `BoardState`) format into a unified `BoardState`.
    fn get_normalized_board(&self) -> Result<BoardState, CvError> {
        let board_dyn = self
            .game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?
            .get("board")
            .ok_or_else(|| CvError::Internal("game_state has no 'board' key".into()))?
            .clone();

        // v2 format: single BoardState
        if let Some(b) = board_dyn.clone().try_cast::<BoardState>() {
            return Ok(b);
        }

        // v1 format: array of BoardState — merge into one
        if let Some(arr) = board_dyn.clone().try_cast::<rhai::Array>() {
            let mut boards: Vec<Vec<Option<Piece>>> = Vec::new();
            let mut rows = 8u32;
            let mut cols = 8u32;
            for (i, elem) in arr.iter().enumerate() {
                if let Some(b) = elem.clone().try_cast::<BoardState>() {
                    if i == 0 {
                        rows = b.rows;
                        cols = b.cols;
                    }
                    boards.extend(b.boards);
                } else {
                    return Err(CvError::Internal(
                        "board array element is not a BoardState".into(),
                    ));
                }
            }
            if boards.is_empty() {
                return Err(CvError::Internal("board array is empty".into()));
            }
            let number_of_boards = boards.len() as u32;
            return Ok(BoardState {
                rows,
                cols,
                number_of_boards,
                boards,
            });
        }

        // Fallback: try rhai serde (handles maps, etc.)
        Ok(rhai::serde::from_dynamic(&board_dyn)?)
    }

    /// Call `get_ui(state, player)`, serialize to JSON (no closures / no caching).
    fn run_get_ui(&self, player: &PlayerId) -> Result<serde_json::Value, CvError> {
        let mut scope = Scope::new();
        let result = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "get_ui",
            (self.game_state.clone(), Dynamic::from(player.clone())),
        );
        let ui_map = match result {
            Ok(v) => v
                .try_cast::<rhai::Map>()
                .unwrap_or_else(rhai::Map::new),
            Err(e) if matches!(*e, rhai::EvalAltResult::ErrorFunctionNotFound(..)) => {
                return Ok(serde_json::Value::Object(serde_json::Map::new()));
            }
            Err(e) => return Err(CvError::from(e)),
        };

        serialize_ui_to_json(&ui_map)
    }

    /// Call `valid_actions(state, player)`, parse the returned `[Action]` array.
    fn compute_valid_actions_for_player(
        &mut self,
        player: &PlayerId,
    ) -> Result<Vec<Action>, CvError> {
        let mut scope = Scope::new();
        let result = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "valid_actions",
            (
                self.game_state.clone(),
                Dynamic::from(player.clone()),
            ),
        );
        let actions_dyn = match result {
            Ok(v) => v,
            Err(e) if matches!(*e, rhai::EvalAltResult::ErrorFunctionNotFound(..)) => {
                return Ok(vec![]);
            }
            Err(e) => return Err(CvError::from(e)),
        };

        let arr = actions_dyn
            .try_cast::<rhai::Array>()
            .ok_or_else(|| CvError::Internal("valid_actions did not return an array".into()))?;

        Ok(arr
            .into_iter()
            .filter_map(|item| {
                item.clone()
                    .try_cast::<Action>()
                    .or_else(|| rhai::serde::from_dynamic(&item).ok())
            })
            .collect())
    }

    /// Extract all PlayerIds from `state.players`.
    fn get_player_ids(&self) -> Result<Vec<PlayerId>, CvError> {
        let players_map = self
            .game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;

        let players_dyn = players_map
            .get("players")
            .cloned()
            .ok_or_else(|| CvError::Internal("state.players key is missing".into()))?;

        let players_arr: rhai::Array = players_dyn
            .try_cast::<rhai::Array>()
            .ok_or_else(|| CvError::Internal("state.players is not an array".into()))?;

        players_arr
            .into_iter()
            .map(|p: Dynamic| {
                let player_map: rhai::Map = p
                    .try_cast::<rhai::Map>()
                    .ok_or_else(|| CvError::Internal("player entry is not a map".into()))?;
                let color: String = player_map
                    .get("color")
                    .and_then(|v: &Dynamic| v.clone().into_string().ok())
                    .unwrap_or_default();
                let board = player_map
                    .get("board")
                    .and_then(|v: &Dynamic| v.as_int().ok())
                    .unwrap_or(0) as i32;
                let team = player_map
                    .get("team")
                    .and_then(|v: &Dynamic| v.as_int().ok())
                    .unwrap_or(0) as i32;
                Ok(PlayerId {
                    board,
                    color,
                    team,
                })
            })
            .collect()
    }

    /// Call `valid_actions(state, player)` for every player, assemble into `Vec<PlayerActions>`.
    fn compute_valid_actions_all(&mut self) -> Result<Vec<PlayerActions>, CvError> {
        // Use cache if available (state hasn't changed)
        if let Some(ref cached) = self.cached_valid_actions {
            return Ok(cached.clone());
        }

        let player_ids = self.get_player_ids()?;
        let mut result = Vec::new();

        for player_id in &player_ids {
            let actions = self.compute_valid_actions_for_player(player_id)?;
            result.push(PlayerActions {
                player: player_id.clone(),
                actions,
            });
        }

        Ok(result)
    }

    /// Read `state.outcome` and convert to JSON. Returns None if no outcome is set.
    fn extract_outcome_from_state(&self) -> Option<serde_json::Value> {
        let map = self.game_state.read_lock::<rhai::Map>()?;
        let outcome = map.get("outcome")?.clone();
        if outcome.is_unit() {
            return None;
        }
        if let Some(outcome_map) = outcome.clone().try_cast::<rhai::Map>() {
            let mut json = serde_json::Map::new();
            for (k, v) in outcome_map.iter() {
                let val: serde_json::Value = if let Some(s) = v.clone().into_string().ok() {
                    serde_json::Value::String(s)
                } else if let Ok(n) = v.as_int() {
                    serde_json::json!(n)
                } else if let Some(arr) = v.clone().try_cast::<rhai::Array>() {
                    let items: Vec<serde_json::Value> = arr
                        .iter()
                        .filter_map(|d| {
                            if let Ok(n) = d.as_int() {
                                Some(serde_json::json!(n))
                            } else {
                                d.clone().into_string().ok().map(serde_json::Value::String)
                            }
                        })
                        .collect();
                    serde_json::Value::Array(items)
                } else {
                    continue;
                };
                json.insert(k.to_string(), val);
            }
            return Some(serde_json::Value::Object(json));
        }
        // Fallback: try converting the string representation
        outcome
            .into_string()
            .ok()
            .map(|s| serde_json::Value::String(s))
    }

    /// Check if the script defines a function by trying to call it.
    #[allow(dead_code)]
    fn script_has_function(&self, name: &str) -> bool {
        let mut scope = Scope::new();
        match self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            name,
            (self.game_state.clone(),),
        ) {
            Ok(_) => true,
            Err(e) if matches!(*e, rhai::EvalAltResult::ErrorFunctionNotFound(..)) => false,
            Err(_) => true,
        }
    }
}

// ─── UI Serialization helper ──────────────────────────────────────────────────

/// Serialize a Rhai UI element map to JSON, stripping handler closures.
/// Also validates: no duplicate element IDs.
fn serialize_ui_to_json(ui_map: &rhai::Map) -> Result<serde_json::Value, CvError> {
    let mut json_map = serde_json::Map::new();

    for (id_immutable, element_dyn) in ui_map {
        let id = id_immutable.to_string();
        if json_map.contains_key(&id) {
            return Err(CvError::Internal(format!(
                "duplicate UI element ID '{}' in get_ui return value",
                id
            )));
        }

        let elem_map = element_dyn
            .clone()
            .try_cast::<rhai::Map>()
            .ok_or_else(|| CvError::Internal(format!("UI element '{}' is not a map", id)))?;

        let typ = elem_map
            .get("type")
            .and_then(|v| v.clone().into_string().ok())
            .unwrap_or_default();

        let json_element = match typ.as_str() {
            "button" => {
                let label = elem_map
                    .get("label")
                    .and_then(|v| v.clone().into_string().ok())
                    .unwrap_or_default();
                serde_json::json!({ "type": "button", "label": label })
            }
            "banner" => {
                let text = elem_map
                    .get("text")
                    .and_then(|v| v.clone().into_string().ok())
                    .unwrap_or_default();
                let style = elem_map
                    .get("style")
                    .and_then(|v| v.clone().into_string().ok())
                    .unwrap_or_else(|| "info".to_string());
                serde_json::json!({ "type": "banner", "text": text, "style": style })
            }
            "reserve_pile" => {
                let pieces_arr = elem_map
                    .get("pieces")
                    .cloned()
                    .and_then(|d| d.try_cast::<rhai::Array>())
                    .unwrap_or_default();
                let pieces_json: Vec<serde_json::Value> = pieces_arr
                    .iter()
                    .filter_map(|d| {
                        let piece: Piece = d.clone().try_cast::<Piece>()?;
                        Some(serde_json::json!({
                            "color": piece.color_name(),
                            "pieceType": piece.piece_type_name(),
                        }))
                    })
                    .collect();
                serde_json::json!({ "type": "reserve_pile", "pieces": pieces_json })
            }
            _ => continue,
        };

        json_map.insert(id, json_element);
    }

    Ok(serde_json::Value::Object(json_map))
}
