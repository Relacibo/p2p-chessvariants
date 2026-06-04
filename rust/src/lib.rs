use error::CvError;
use game::{
    actions::Action, board, game_result, piece::Piece, standard, state::Coords,
    variant_config::VariantConfig,
};
use modules::builtins;
use rhai::{AST, Dynamic, Engine, Scope};
use serde::Serialize;
use std::rc::Rc;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

pub mod error;
mod game;
mod logging;
mod modules;
pub mod rhai_rust_error;

// Re-exports for integration tests and external consumers
pub use game::state::{BoardCoords, BoardState, Coords as GameCoords, Player};

/// A player's valid moves, as returned by `valid_moves(state, player)`.
#[derive(Clone, Debug, Serialize)]
pub struct PlayerMoves {
    pub player: Player,
    pub moves: Vec<Action>,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[derive(Debug)]
pub struct ChessvariantEngine {
    engine: Engine,
    ast: AST,
    pub(crate) game_state: Dynamic,
    pub(crate) variant_config: VariantConfig,
}

// ─── Builtin Registration ────────────────────────────────────────────────────

fn register_builtins(engine: &mut Engine) {
    use game::state::BoardCoords;

    engine
        .build_type::<BoardState>()
        .build_type::<game::state::ReservePileState>()
        .build_type::<BoardCoords>()
        .build_type::<Piece>()
        .build_type::<game::variant_config::BoardLayoutConfig>()
        .build_type::<Action>()
        .build_type::<Player>();

    // Coords is an opaque enum — register manually with getters.
    engine
        .register_type_with_name::<Coords>("Coords")
        .register_get("type", Coords::get_type_mut)
        .register_get("row", Coords::get_row_mut)
        .register_get("col", Coords::get_col_mut)
        .register_get("board_index", Coords::get_board_index_mut)
        .register_get("index", Coords::get_index_mut);

    // ── Legacy global aliases (backward compat for existing variant scripts) ──
    engine.register_fn("board_empty", BoardState::board_empty);
    engine.register_fn("board_get", board::rhai_board_get);
    engine.register_fn("board_set", board::rhai_board_set);
    engine.register_fn("board_move_piece", board::rhai_board_move_piece);
    engine.register_fn("board_find", board::rhai_board_find_piece);
    engine.register_fn("board_find_by_color", board::rhai_board_find_by_color);

    // Equality operators
    engine.register_fn("==", |a: Coords, b: Coords| -> bool { a == b });
    engine.register_fn("!=", |a: Coords, b: Coords| -> bool { a != b });
    engine.register_fn("==", |a: BoardCoords, b: BoardCoords| -> bool { a == b });
    engine.register_fn("!=", |a: BoardCoords, b: BoardCoords| -> bool { a != b });
    engine.register_fn("==", |a: Player, b: Player| -> bool { a.id == b.id });
    engine.register_fn("!=", |a: Player, b: Player| -> bool { a.id != b.id });

    // ── Global constructors ──
    engine.register_fn("Coords", Coords::new_board_0);
    engine.register_fn("Coords", Coords::new_board);
    engine.register_fn("ReserveCoords", Coords::new_reserve);
    engine.register_fn("Player", Player::new_by_id);
    engine.register_fn("Player", Player::new_by_id_name);
    engine.register_fn("Player", Player::new_full);
    engine.register_fn("Player", Player::new_with_data);
    engine.register_fn("Move", Action::rhai_move);
    engine.register_fn("SelectPiece", Action::rhai_select_piece);
    engine.register_fn("Interact", Action::rhai_interact);
    engine.register_fn("Cancel", Action::rhai_cancel);
    engine.register_fn("Piece", Piece::rhai_new);
    engine.register_fn("Winner", game_result::rhai_winner);
    engine.register_fn("Winners", game_result::rhai_winners);
    engine.register_fn("Draw", game_result::rhai_draw);
    engine.register_fn("standard_start_position", standard::standard_start_position);
    engine.register_fn(
        "merge",
        |base: rhai::Map, updates: rhai::Map| -> rhai::Map {
            let mut result = base;
            result.extend(updates);
            result
        },
    );
    engine.register_fn("Rect", |r1: i32, c1: i32, r2: i32, c2: i32| -> rhai::Map {
        let mut m = rhai::Map::new();
        m.insert("r1".into(), Dynamic::from(r1));
        m.insert("c1".into(), Dynamic::from(c1));
        m.insert("r2".into(), Dynamic::from(r2));
        m.insert("c2".into(), Dynamic::from(c2));
        m
    });

    // Namespaced modules
    engine.register_static_module("engine::board", Rc::new(builtins::create_board_submodule()));
    engine.register_static_module("engine::moves", Rc::new(builtins::create_moves_submodule()));
    engine.register_static_module("log", Rc::new(builtins::create_log_module()));
}

fn register_engine_helpers(engine: &mut Engine) {
    engine.register_fn(
        "engine::merge",
        |base: rhai::Map, updates: rhai::Map| -> rhai::Map {
            let mut result = base;
            result.extend(updates);
            result
        },
    );
    engine.register_fn(
        "engine::standard_start_position",
        standard::standard_start_position,
    );
}

// ─── Rhai Map helpers ────────────────────────────────────────────────────────

fn player_field_i32(m: &rhai::Map, key: &str) -> i32 {
    m.get(key).and_then(|v| v.as_int().ok()).unwrap_or(0) as i32
}

fn player_field_string(m: &rhai::Map, key: &str) -> String {
    m.get(key)
        .and_then(|v: &Dynamic| v.clone().into_string().ok())
        .unwrap_or_default()
}

fn player_from_map(m: &rhai::Map) -> Player {
    Player {
        id: player_field_i32(m, "id"),
        name: player_field_string(m, "name"),
        home_board: player_field_i32(m, "home_board"),
        team: player_field_i32(m, "team"),
        data: m.get("data").cloned(),
    }
}

// ─── Player resolution ───────────────────────────────────────────────────────

/// Resolve a player ID to a `Player` from `state.players`.
/// Used both by WASM-facing methods and integration tests.
pub fn resolve_player(state: &Dynamic, player_id: i32) -> Result<Player, CvError> {
    let map = state
        .read_lock::<rhai::Map>()
        .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;
    let arr: rhai::Array = map
        .get("players")
        .cloned()
        .and_then(|v| v.try_cast::<rhai::Array>())
        .ok_or_else(|| CvError::Internal("state.players not found or not an array".into()))?;
    for p in arr {
        let Some(m) = p.try_cast::<rhai::Map>() else {
            continue;
        };
        if player_field_i32(&m, "id") == player_id {
            return Ok(player_from_map(&m));
        }
    }
    Err(CvError::Internal(format!(
        "player {player_id} not found in state.players"
    )))
}

/// Look up a player's full Rhai map from `state.players` by id.
fn get_player_map(state: &Dynamic, player_id: i32) -> Option<Dynamic> {
    let map = state.read_lock::<rhai::Map>()?;
    let arr: rhai::Array = map.get("players")?.clone().try_cast::<rhai::Array>()?;
    arr.into_iter().find_map(|p| {
        let m = p.try_cast::<rhai::Map>()?;
        (m.get("id")?.as_int().ok()? == player_id).then(|| Dynamic::from(m))
    })
}

// ─── Rhai → JSON conversion ──────────────────────────────────────────────────

/// Convert any `Dynamic` to `serde_json::Value` via Rhai's built-in serde support.
/// Falls back to a debug string for un-serializable custom types.
fn dynamic_to_json(value: &rhai::Dynamic) -> serde_json::Value {
    serde_json::to_value(value).unwrap_or_else(|_| serde_json::Value::String(format!("{value:?}")))
}

fn player_to_json_value(player: &Player) -> serde_json::Value {
    let mut json = serde_json::json!({
        "id": player.id,
        "name": player.name,
        "home_board": player.home_board,
        "team": player.team,
    });
    if let Some(ref data) = player.data {
        json["data"] = dynamic_to_json(data);
    }
    json
}

// ─── Constructor ─────────────────────────────────────────────────────────────

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl ChessvariantEngine {
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new(script_content: String, player_count: i32) -> Result<ChessvariantEngine, CvError> {
        let mut engine = Engine::new();
        register_builtins(&mut engine);

        let ast = engine.compile(&script_content)?;

        let mut scope = Scope::new();
        let dynamic_config = engine.call_fn::<Dynamic>(&mut scope, &ast, "config", ())?;
        let variant_config: VariantConfig = dynamic_config.try_into()?;

        if !variant_config
            .allowed_player_count
            .validate(player_count as u32)
        {
            return Err(CvError::Internal(format!(
                "player_count {player_count} is not allowed by variant config"
            )));
        }

        register_engine_helpers(&mut engine);
        let game_state = engine.call_fn::<Dynamic>(&mut scope, &ast, "init", (player_count,))?;

        Ok(ChessvariantEngine {
            engine,
            ast,
            game_state,
            variant_config,
        })
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

        Ok(serde_json::to_string(&variant_config)?)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = variantConfigJson))]
    pub fn variant_config_json(&self) -> Result<String, CvError> {
        Ok(serde_json::to_string(&self.variant_config)?)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = boardStateJson))]
    pub fn board_state_json(&self) -> Result<String, CvError> {
        let board = self.get_normalized_board()?;
        Ok(serde_json::to_string(&board)?)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = playersJson))]
    pub fn players_json(&self) -> Result<String, CvError> {
        let players_map = self
            .game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;

        let players_arr: Option<rhai::Array> = players_map
            .get("players")
            .and_then(|v| v.clone().try_cast::<rhai::Array>());

        let teams_opt: Option<rhai::Array> = players_map
            .get("teams")
            .and_then(|v| v.clone().try_cast::<rhai::Array>());

        let players: Vec<serde_json::Value> = if let Some(arr) = players_arr {
            arr.iter()
                .filter_map(|p| {
                    let pm = p.clone().try_cast::<rhai::Map>()?;
                    let color = player_field_string(&pm, "color");
                    let board = player_field_i32(&pm, "board");
                    let team = player_field_i32(&pm, "team");
                    let orientation = resolve_orientation(&pm, board, team, &teams_opt);
                    Some(serde_json::json!({
                        "id": player_field_i32(&pm, "id"),
                        "name": player_field_string(&pm, "name"),
                        "home_board": player_field_i32(&pm, "home_board"),
                        "color": color,
                        "board": board,
                        "team": team,
                        "orientation": orientation,
                    }))
                })
                .collect()
        } else {
            // Synthesize from variant config colors
            self.variant_config
                .colors
                .iter()
                .enumerate()
                .map(|(i, color)| {
                    serde_json::json!({
                        "id": i as i32,
                        "name": "",
                        "home_board": 0,
                        "color": color,
                        "board": 0,
                        "team": 0,
                        "orientation": if i == 0 { "normal" } else { "flipped" }
                    })
                })
                .collect()
        };

        Ok(serde_json::to_string(&players)?)
    }

    /// Returns full game state (the Rhai map) as JSON, with the board fully serialized.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = stateJson))]
    pub fn state_json(&self) -> Result<String, CvError> {
        let map = self
            .game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;
        let mut json = serde_json::Value::Object(
            map.iter()
                .map(|(k, v)| (k.to_string(), dynamic_to_json(v)))
                .collect(),
        );
        let Some(obj) = json.as_object_mut() else {
            return Err(CvError::Internal(
                "state_json: result is not an object".into(),
            ));
        };
        let board_json = self.board_state_json()?;
        let board_value: serde_json::Value = serde_json::from_str(&board_json)?;
        obj.insert("board".to_string(), board_value);
        Ok(serde_json::to_string_pretty(&json)?)
    }

    /// Returns valid moves for ALL players + game_over.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = validMovesAllJson))]
    pub fn valid_moves_all_json(&mut self) -> Result<String, CvError> {
        let (all_moves, game_over) = self.compute_valid_moves_all()?;
        let valid_moves_json: Vec<serde_json::Value> = all_moves
            .iter()
            .map(|pm| {
                serde_json::json!({
                    "player": player_to_json_value(&pm.player),
                    "moves": pm.moves,
                })
            })
            .collect();
        Ok(serde_json::to_string(&serde_json::json!({
            "validMoves": valid_moves_json,
            "gameOver": game_over,
        }))?)
    }

    /// Compute valid_moves for a single player.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = validMovesForPlayerJson))]
    pub fn valid_moves_for_player_json(&mut self, player_json: String) -> Result<String, CvError> {
        let player_id: i32 = serde_json::from_str(&player_json)?;
        let player = resolve_player(&self.game_state, player_id)?;
        let moves = self.compute_valid_moves_for_player(&player)?;
        Ok(serde_json::to_string(&serde_json::json!({
            "player": player_to_json_value(&player),
            "moves": moves,
        }))?)
    }

    /// Submit an action. Always returns a JSON string.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = submitAction))]
    pub fn submit_action_js(&mut self, player_json: String, action_json: String) -> String {
        match self.submit_action_js_impl(player_json, action_json) {
            Ok(json) => json,
            Err(e) => serde_json::json!({
                "error": e.to_string(),
                "ui": null,
                "game_over": null,
                "board_state": null,
            })
            .to_string(),
        }
    }

    /// Fetch the UI for a player without changing state.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = deriveUiJson))]
    pub fn derive_ui_json_js(&self, player_json: String) -> Result<String, CvError> {
        let player_id: i32 = serde_json::from_str(&player_json)?;
        let player = resolve_player(&self.game_state, player_id)?;
        let ui = self.run_derive_ui(&player)?;
        Ok(serde_json::to_string(&serde_json::json!({ "ui": ui }))?)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = setLogLevel))]
    pub fn set_log_level(level: String) {
        logging::set_log_level(&level);
    }
}

// ─── Core engine logic ───────────────────────────────────────────────────────

impl ChessvariantEngine {
    fn submit_action_js_impl(
        &mut self,
        player_json: String,
        action_json: String,
    ) -> Result<String, CvError> {
        let player_id: i32 = serde_json::from_str(&player_json)?;
        let player = resolve_player(&self.game_state, player_id)?;
        let action: Action = serde_json::from_str(&action_json)?;
        let result = self.submit_action_core(&player, &action)?;
        Ok(serde_json::to_string(&result)?)
    }

    /// Core action submission. Used both by WASM `submitAction` and native tests.
    pub fn submit_action_core(
        &mut self,
        player: &Player,
        action: &Action,
    ) -> Result<serde_json::Value, CvError> {
        if action.kind == "move" {
            let legal_moves = self.compute_valid_moves_for_player(player)?;
            if !legal_moves.iter().any(|m| m == action) {
                return Err(CvError::Internal("illegal move".into()));
            }
        }

        let mut scope = Scope::new();
        let new_state = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "handle_action",
            (
                self.game_state.clone(),
                get_player_map(&self.game_state, player.id)
                    .ok_or_else(|| CvError::Internal(format!("player {} not found", player.id)))?,
                Dynamic::from(action.clone()),
            ),
        )?;

        self.game_state = new_state;

        let game_over = self.extract_outcome_from_state();
        let ui = self.run_derive_ui(player)?;
        let board = self.get_normalized_board()?;
        let board_json = serde_json::to_value(&board)?;

        Ok(serde_json::json!({
            "ui": ui,
            "game_over": game_over,
            "board_state": board_json,
        }))
    }

    /// Submit a move by player color (for integration tests). 0 = white, 1 = black, …
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

    /// Submit a piece selection by player color (for integration tests).
    pub fn submit_select_piece(
        &mut self,
        player_color: &str,
        piece_color: &str,
        piece_type: &str,
    ) -> Result<serde_json::Value, CvError> {
        let player = self.find_player_by_color(player_color)?;
        let action = Action::rhai_select_piece(Piece::rhai_new(
            piece_color.to_string(),
            piece_type.to_string(),
        ));
        self.submit_action_core(&player, &action)
    }

    /// Find a player by color (for integration tests).
    fn find_player_by_color(&self, color: &str) -> Result<Player, CvError> {
        let map = self
            .game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;
        let arr: rhai::Array = map
            .get("players")
            .cloned()
            .and_then(|v| v.try_cast::<rhai::Array>())
            .ok_or_else(|| CvError::Internal("state.players not found".into()))?;
        for p in arr {
            let Some(m) = p.clone().try_cast::<rhai::Map>() else {
                continue;
            };
            if player_field_string(&m, "color") == color {
                return Ok(player_from_map(&m));
            }
        }
        Err(CvError::Internal(format!(
            "player color '{color}' not found"
        )))
    }

    pub fn state(&self) -> Dynamic {
        self.game_state.clone()
    }

    pub fn active_player_colors(&mut self) -> Vec<String> {
        match self.compute_valid_moves_all() {
            Ok((all_moves, _)) => all_moves
                .iter()
                .filter(|pm| !pm.moves.is_empty())
                .filter_map(|pm| {
                    let pmap = get_player_map(&self.game_state, pm.player.id)?;
                    pmap.read_lock::<rhai::Map>()
                        .and_then(|m| m.get("color")?.clone().into_string().ok())
                })
                .collect(),
            Err(_) => vec![],
        }
    }

    pub fn is_game_over(&mut self) -> bool {
        match self.compute_valid_moves_all() {
            Ok((_, Some(_))) => true,
            _ => self
                .game_state
                .read_lock::<rhai::Map>()
                .map(|m| m.contains_key("outcome"))
                .unwrap_or(false),
        }
    }

    pub fn outcome(&self) -> Dynamic {
        self.game_state
            .read_lock::<rhai::Map>()
            .and_then(|m| m.get("outcome").cloned())
            .unwrap_or(Dynamic::UNIT)
    }

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

    fn get_normalized_board(&self) -> Result<BoardState, CvError> {
        let map = self
            .game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;
        let board_dyn = map
            .get("board")
            .ok_or_else(|| CvError::Internal("game_state has no 'board' key".into()))?
            .clone();

        // v2 format: single BoardState
        if let Some(b) = board_dyn.clone().try_cast::<BoardState>() {
            return Ok(b);
        }

        // v1 format: array of BoardState — merge into one
        let Some(arr) = board_dyn.clone().try_cast::<rhai::Array>() else {
            return rhai::serde::from_dynamic(&board_dyn).map_err(CvError::from);
        };
        if arr.is_empty() {
            return Err(CvError::Internal("board array is empty".into()));
        }
        let first: BoardState = arr[0]
            .clone()
            .try_cast::<BoardState>()
            .ok_or_else(|| CvError::Internal("board array element is not a BoardState".into()))?;
        let mut boards: Vec<Vec<Option<Piece>>> = first.boards.clone();
        for elem in &arr[1..] {
            let b: BoardState = elem.clone().try_cast::<BoardState>().ok_or_else(|| {
                CvError::Internal("board array element is not a BoardState".into())
            })?;
            boards.extend(b.boards);
        }
        Ok(BoardState {
            rows: first.rows,
            cols: first.cols,
            number_of_boards: boards.len() as i32,
            boards,
        })
    }

    fn run_derive_ui(&self, player: &Player) -> Result<serde_json::Value, CvError> {
        let mut scope = Scope::new();
        let result = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "derive_ui",
            (
                self.game_state.clone(),
                get_player_map(&self.game_state, player.id).ok_or_else(|| {
                    CvError::Internal(format!("player {} not found for derive_ui", player.id))
                })?,
            ),
        );
        let ui_map = match result {
            Ok(v) => v.try_cast::<rhai::Map>().unwrap_or_else(rhai::Map::new),
            Err(e) if matches!(*e, rhai::EvalAltResult::ErrorFunctionNotFound(..)) => {
                return Ok(serde_json::Value::Object(serde_json::Map::new()));
            }
            Err(e) => return Err(CvError::from(e)),
        };

        serialize_ui_to_json(&ui_map)
    }

    fn compute_valid_moves_for_player(&mut self, player: &Player) -> Result<Vec<Action>, CvError> {
        let mut tmp_scope = rhai::Scope::new();
        let result = self.engine.call_fn::<Dynamic>(
            &mut tmp_scope,
            &self.ast,
            "valid_moves",
            (
                self.game_state.clone(),
                get_player_map(&self.game_state, player.id).ok_or_else(|| {
                    CvError::Internal(format!("player {} not found for valid_moves", player.id))
                })?,
            ),
        );
        let actions_dyn = match result {
            Ok(v) => v,
            Err(e) => match &*e {
                rhai::EvalAltResult::ErrorFunctionNotFound(fn_sig, ..)
                    if fn_sig.starts_with("valid_moves") =>
                {
                    return Ok(vec![]);
                }
                _ => return Err(CvError::from(e)),
            },
        };

        let arr = actions_dyn
            .try_cast::<rhai::Array>()
            .ok_or_else(|| CvError::Internal("valid_moves did not return an array".into()))?;

        Ok(arr
            .into_iter()
            .filter_map(|item| {
                item.clone()
                    .try_cast::<Action>()
                    .or_else(|| rhai::serde::from_dynamic(&item).ok())
            })
            .collect())
    }

    fn get_player_ids(&self) -> Result<Vec<Player>, CvError> {
        let players_map = self
            .game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;

        let players_dyn = players_map
            .get("players")
            .cloned()
            .ok_or_else(|| CvError::Internal("state.players is missing".into()))?;

        let players_arr: rhai::Array = players_dyn
            .try_cast::<rhai::Array>()
            .ok_or_else(|| CvError::Internal("state.players is not an array".into()))?;

        players_arr
            .into_iter()
            .map(|p: Dynamic| {
                let pm: rhai::Map = p
                    .try_cast::<rhai::Map>()
                    .ok_or_else(|| CvError::Internal("player entry is not a map".into()))?;
                Ok(player_from_map(&pm))
            })
            .collect()
    }

    fn compute_valid_moves_all(
        &mut self,
    ) -> Result<(Vec<PlayerMoves>, Option<serde_json::Value>), CvError> {
        let player_ids = self.get_player_ids()?;
        let mut result = Vec::new();

        for pid in &player_ids {
            let moves = self.compute_valid_moves_for_player(pid)?;
            result.push(PlayerMoves {
                player: pid.clone(),
                moves,
            });
        }

        let game_over = self.call_is_game_over(&result);
        Ok((result, game_over))
    }

    fn call_is_game_over(&mut self, all_moves: &[PlayerMoves]) -> Option<serde_json::Value> {
        let mut scope = Scope::new();
        let entries: rhai::Array = all_moves
            .iter()
            .map(|pm| {
                let mut entry = rhai::Map::new();
                entry.insert(
                    "player".into(),
                    get_player_map(&self.game_state, pm.player.id)
                        .unwrap_or_else(|| Dynamic::from(rhai::Map::new())),
                );
                let moves_arr: rhai::Array =
                    pm.moves.iter().map(|m| Dynamic::from(m.clone())).collect();
                entry.insert("moves".into(), Dynamic::from(moves_arr));
                Dynamic::from(entry)
            })
            .collect();

        match self.engine.call_fn::<bool>(
            &mut scope,
            &self.ast,
            "is_game_over",
            (self.game_state.clone(), Dynamic::from(entries)),
        ) {
            Ok(true) => Some(
                self.extract_outcome_from_state()
                    .unwrap_or_else(|| serde_json::json!({ "type": "game_over" })),
            ),
            Ok(false) => None,
            Err(_) => {
                let all_empty = all_moves.iter().all(|pm| pm.moves.is_empty());
                if all_empty {
                    Some(
                        self.extract_outcome_from_state()
                            .unwrap_or_else(|| serde_json::json!({ "type": "game_over" })),
                    )
                } else {
                    None
                }
            }
        }
    }

    fn extract_outcome_from_state(&self) -> Option<serde_json::Value> {
        let map = self.game_state.read_lock::<rhai::Map>()?;
        let outcome = map.get("outcome")?.clone();
        if outcome.is_unit() {
            return None;
        }
        Some(dynamic_to_json(&outcome))
    }

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

// ─── Orientation helper ─────────────────────────────────────────────────────

/// Resolve a player's board orientation. Checks `player.orientation` first,
/// then falls back to the team's orientation map, then defaults to `"normal"`.
fn resolve_orientation(
    player_map: &rhai::Map,
    board: i32,
    team: i32,
    teams_opt: &Option<rhai::Array>,
) -> String {
    player_map
        .get("orientation")
        .and_then(|v| v.clone().into_string().ok())
        .or_else(|| {
            teams_opt.as_ref().and_then(|teams| {
                teams.iter().find_map(|team_entry| {
                    let team_map = team_entry.clone().try_cast::<rhai::Map>()?;
                    let team_id = player_field_i32(&team_map, "id");
                    if team_id != team {
                        return None;
                    }
                    let orientations = team_map
                        .get("orientations")
                        .and_then(|v| v.clone().try_cast::<rhai::Array>())?;
                    orientations.iter().find_map(|o_entry| {
                        let o_map = o_entry.clone().try_cast::<rhai::Map>()?;
                        let o_board = player_field_i32(&o_map, "board");
                        if o_board != board {
                            return None;
                        }
                        player_field_string(&o_map, "orientation").into()
                    })
                })
            })
        })
        .unwrap_or_else(|| match team {
            1 => "flipped".to_string(),
            _ => "normal".to_string(),
        })
}

// ─── UI Serialization helper ──────────────────────────────────────────────────

/// Serialize a Rhai UI element map to JSON, stripping handler closures.
fn serialize_ui_to_json(ui_map: &rhai::Map) -> Result<serde_json::Value, CvError> {
    let mut json_map = serde_json::Map::new();

    for (id_immutable, element_dyn) in ui_map {
        let id = id_immutable.to_string();
        if json_map.contains_key(&id) {
            return Err(CvError::Internal(format!(
                "duplicate UI element ID '{id}' in derive_ui return value"
            )));
        }

        let elem_map = element_dyn
            .clone()
            .try_cast::<rhai::Map>()
            .ok_or_else(|| CvError::Internal(format!("UI element '{id}' is not a map")))?;

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
                let board_index = player_field_i32(&elem_map, "board_index");
                serde_json::json!({ "type": "reserve_pile", "pieces": pieces_json, "board_index": board_index })
            }
            "piece_picker" => {
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
                let cancelable = elem_map.get("cancelable").and_then(|v| v.as_bool().ok());
                let title = elem_map
                    .get("title")
                    .cloned()
                    .and_then(|v: Dynamic| v.into_string().ok());
                let mut json = serde_json::json!({
                    "type": "piece_picker",
                    "pieces": pieces_json,
                });
                if let Some(c) = cancelable {
                    json["cancelable"] = serde_json::Value::Bool(c);
                }
                if let Some(t) = title {
                    json["title"] = serde_json::Value::String(t);
                }
                json
            }
            _ => continue,
        };

        json_map.insert(id, json_element);
    }

    Ok(serde_json::Value::Object(json_map))
}
