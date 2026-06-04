use error::CvError;
use game::{
    actions::Action, board, piece::Piece, standard, state::Coords,
    variant_config::VariantConfig,
};
use modules::builtins;
use rhai::{AST, Dynamic, Engine, Module, Scope};
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
pub use game::game_progress::GameProgress;
pub use game::state::{BoardCoords, BoardState, Coords as GameCoords, Player, State};

/// A player's valid moves, as returned by `valid_moves(state, player)`.
#[derive(Clone, Debug, Serialize)]
pub struct PlayerMoves {
    pub player: Player,
    pub moves: Vec<Action>,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct ChessvariantEngine {
    engine: Engine,
    ast: AST,
    pub(crate) game_state: State,
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
        .build_type::<Player>()
        .register_indexer_get_set(
            |p: &mut Player, key: &str| -> Dynamic {
                match &p.data {
                    Some(data) => data.read_lock::<rhai::Map>()
                        .and_then(|m| m.get(key).cloned())
                        .unwrap_or(Dynamic::UNIT),
                    None => Dynamic::UNIT,
                }
            },
            |p: &mut Player, key: &str, value: Dynamic| {
                let map = p.data.get_or_insert_with(|| Dynamic::from(rhai::Map::new()));
                if let Some(mut m) = map.write_lock::<rhai::Map>() {
                    m.insert(key.into(), value);
                }
            },
        )
        .register_type_with_name::<GameProgress>("GameProgress")
        .register_get("progress", GameProgress::get_progress_mut)
        .register_get("winning_team", GameProgress::get_winning_team_mut);

    // State — typed wrapper: board/players are properties, data keys use indexer
    engine
        .register_type_with_name::<State>("State")
        .register_get_set("board",
            |s: &mut State| s.board.clone(),
            |s: &mut State, value: Dynamic| s.board = value,
        )
        .register_get("players", |s: &mut State| Dynamic::from(s.players.clone()))
        .register_indexer_get_set(
            State::rhai_index_get,
            State::rhai_index_set,
        );

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
    engine.register_fn("InProgress", GameProgress::in_progress);
    engine.register_fn("Winner", GameProgress::winner);
    engine.register_fn("Draw", GameProgress::draw);
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
pub fn resolve_player(state: &State, player_id: i32) -> Result<Player, CvError> {
    for p in &state.players {
        let Some(m) = p.clone().try_cast::<rhai::Map>() else {
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
fn get_player_map(state: &State, player_id: i32) -> Option<Dynamic> {
    state
        .players
        .iter()
        .find_map(|p| {
            let m = p.clone().try_cast::<rhai::Map>()?;
            (m.get("id")?.as_int().ok()? == player_id).then(|| Dynamic::from(m))
        })
}

// ─── Constructor ─────────────────────────────────────────────────────────────

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl ChessvariantEngine {
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new(script_content: String, player_count: i32) -> Result<ChessvariantEngine, CvError> {
        let mut engine = Engine::new();
        register_builtins(&mut engine);

        let ast = engine.compile(&script_content)?;

        // Register ALL engine helpers BEFORE evaluating the script,
        // so that closures in `let`/`const` declarations (like
        // condition: |s,f,t| engine::board::get(...)) can reference them.
        register_engine_helpers(&mut engine);

        let mut scope = Scope::new();

        // Run the AST top-level to evaluate `let`/`const` declarations
        // and install fn definitions into the scope.
        engine.run_ast_with_scope(&mut scope, &ast)?;

        // Extract top-level `let`/`const` declarations from the scope and
        // register them as a global module so they are visible in every scope.
        {
            let mut module = Module::new();
            if let Some(pd) = scope.get_value::<Dynamic>("PIECE_DEFS") {
                module.set_var("PIECE_DEFS", pd);
            }
            engine.register_global_module(Rc::new(module));
        }

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

        let init_result = engine.call_fn::<Dynamic>(&mut scope, &ast, "init", (player_count,))?;
        let init_map = init_result
            .try_cast::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("init() must return a map".into()))?;
        let game_state = State::from_init_map(init_map)
            .map_err(CvError::Internal)?;

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
        engine.run_ast_with_scope(&mut scope, &ast)?;
        let dynamic_config = engine.call_fn::<Dynamic>(&mut scope, &ast, "config", ())?;
        let variant_config: VariantConfig = dynamic_config.try_into()?;

        Ok(serde_json::to_string(&variant_config)?)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = variantConfigJson))]
    pub fn variant_config_json(&self) -> Result<String, CvError> {
        Ok(serde_json::to_string(&self.variant_config)?)
    }

    fn try_as_board_state(&self) -> BoardState {
        // Single BoardState
        if let Some(b) = self.game_state.board.clone().try_cast::<BoardState>() {
            return b;
        }
        // Array of BoardState — merge into one
        if let Some(arr) = self.game_state.board.clone().try_cast::<rhai::Array>() {
            if arr.is_empty() {
                return BoardState::board_empty(0, 0);
            }
            let first: BoardState = arr[0].clone().try_cast::<BoardState>().unwrap_or_else(|| BoardState::board_empty(0, 0));
            let mut boards: Vec<Vec<Option<Piece>>> = first.boards.clone();
            for elem in &arr[1..] {
                if let Some(b) = elem.clone().try_cast::<BoardState>() {
                    boards.extend(b.boards);
                }
            }
            return BoardState {
                rows: first.rows,
                cols: first.cols,
                number_of_boards: boards.len() as i32,
                boards,
            };
        }
        BoardState::board_empty(0, 0)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = boardStateJson))]
    pub fn board_state_json(&self) -> Result<String, CvError> {
        Ok(serde_json::to_string(&self.try_as_board_state())?)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = playersJson))]
    pub fn players_json(&self) -> Result<String, CvError> {
        Ok(serde_json::to_string(&self.game_state.players)?)
    }

    /// Returns full game state as JSON.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = stateJson))]
    pub fn state_json(&self) -> Result<String, CvError> {
        Ok(serde_json::to_string_pretty(&self.game_state)?)
    }

    /// Returns valid moves for ALL players + game_over.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = validMovesAllJson))]
    pub fn valid_moves_all_json(&mut self) -> Result<String, CvError> {
        let (all_moves, game_over) = self.compute_valid_moves_all()?;
        let valid_moves_json: Vec<serde_json::Value> = all_moves
            .iter()
            .map(|pm| {
                serde_json::json!({
                    "player": serde_json::to_value(&pm.player).unwrap_or_default(),
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
            "player": serde_json::to_value(&player)?,
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
        let new_state_dyn = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "handle_action",
            (
                Dynamic::from(self.game_state.clone()),
                get_player_map(&self.game_state, player.id)
                    .ok_or_else(|| CvError::Internal(format!("player {} not found", player.id)))?,
                Dynamic::from(action.clone()),
            ),
        )?;

        self.game_state = new_state_dyn
            .try_cast::<State>()
            .ok_or_else(|| CvError::Internal("handle_action must return a State".into()))?;

        let (_, game_over) = self.compute_valid_moves_all()?;
        let ui = self.run_derive_ui(player)?;
        let board_json = serde_json::to_value(&self.try_as_board_state())?;

        Ok(serde_json::json!({
            "ui": ui,
            "game_over": game_over,
            "board_state": board_json,
        }))
    }

    pub fn state(&self) -> State {
        self.game_state.clone()
    }

    /// Submit a move by player ID (for integration tests).
    pub fn submit_move(
        &mut self,
        player_id: i32,
        from: Coords,
        to: Coords,
    ) -> Result<serde_json::Value, CvError> {
        let player = resolve_player(&self.game_state, player_id)?;
        let action = Action::rhai_move(from, to);
        self.submit_action_core(&player, &action)
    }

    /// Returns `true` when the game has reached a terminal state.
    /// Delegates to `derive_game_progress()` from the script (mandatory).
    pub fn derive_game_progress_bool(&mut self) -> bool {
        matches!(self.compute_valid_moves_all(), Ok((_, Some(_))))
    }

    /// Returns the current game outcome from `derive_game_progress()`.
    pub fn outcome(&mut self) -> Option<GameProgress> {
        match self.compute_valid_moves_all() {
            Ok((_, Some(game_over))) => serde_json::from_value(game_over).ok(),
            _ => None,
        }
    }

    #[allow(dead_code)]
    fn read_piece_from_board(&self, coords: &Coords) -> Result<Piece, CvError> {
        let bc = coords
            .as_board_coords()
            .ok_or_else(|| CvError::Internal("cannot read piece from non-board coords".into()))?;
        self.try_as_board_state()
            .get_piece(&bc)
            .cloned()
            .ok_or_else(|| CvError::Internal("no piece at source square".into()))
    }

    fn run_derive_ui(&self, player: &Player) -> Result<serde_json::Value, CvError> {
        let mut scope = Scope::new();
        let result = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "derive_ui",
            (
                Dynamic::from(self.game_state.clone()),
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
        let mut scope = Scope::new();
        let result = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "valid_moves",
            (
                Dynamic::from(self.game_state.clone()),
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
        self.game_state
            .players
            .iter()
            .map(|p: &Dynamic| {
                let pm: rhai::Map = p
                    .clone()
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

        let game_over = self.call_derive_game_progress(&result)?;
        Ok((result, game_over))
    }

    /// Calls the script's mandatory `derive_game_progress(state, all_valid_moves)`.
    /// Returns `Ok(None)` for `InProgress`, `Ok(Some(json))` for `Draw` or `Decisive`.
    /// Propagates errors — the function is mandatory, no fallback.
    fn call_derive_game_progress(
        &mut self,
        all_moves: &[PlayerMoves],
    ) -> Result<Option<serde_json::Value>, CvError> {
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

        let progress: GameProgress = self.engine.call_fn(
            &mut scope,
            &self.ast,
            "derive_game_progress",
            (Dynamic::from(self.game_state.clone()), Dynamic::from(entries)),
        )?;

        match progress {
            GameProgress::InProgress => Ok(None),
            GameProgress::Draw | GameProgress::Decisive { .. } => {
                let json = serde_json::to_value(&progress).map_err(CvError::from)?;
                Ok(Some(json))
            }
        }
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

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use game::state::Coords;

    fn chess_script() -> String {
        include_str!("../../variants/chess.rhai").to_string()
    }

    fn new_engine(script: &str) -> ChessvariantEngine {
        ChessvariantEngine::new(script.to_string(), 2)
            .expect("engine construction should succeed")
    }

    #[test]
    fn test_config_returns_correct_values() {
        let engine = new_engine(&chess_script());
        let config = engine.variant_config_json().expect("variant_config_json");
        let v: serde_json::Value = serde_json::from_str(&config).expect("parse config JSON");
        assert_eq!(v["name"], "Chess");
        assert_eq!(v["allowed_player_count"]["exact"], 2);
        assert_eq!(v["board"]["rows"], 8);
        assert_eq!(v["board"]["cols"], 8);
        assert_eq!(v["board"]["count"], 1);
    }

    #[test]
    fn test_parse_config_standalone() {
        let config = ChessvariantEngine::parse_config(chess_script()).expect("parse_config");
        let v: serde_json::Value = serde_json::from_str(&config).expect("parse config JSON");
        assert_eq!(v["name"], "Chess");
        assert_eq!(v["board"]["rows"], 8);
    }

    #[test]
    fn test_board_state_has_8x8_board() {
        let engine = new_engine(&chess_script());
        let bs = engine.board_state_json().expect("board_state_json");
        let v: serde_json::Value = serde_json::from_str(&bs).expect("parse board state JSON");
        assert_eq!(v["rows"], 8);
        assert_eq!(v["cols"], 8);
        let boards = v["boards"].as_array().expect("boards array");
        assert_eq!(boards.len(), 1);
        assert_eq!(boards[0].as_array().expect("board rows").len(), 64);
    }

    #[test]
    fn test_board_has_32_pieces() {
        let engine = new_engine(&chess_script());
        let bs = engine.board_state_json().expect("board_state_json");
        let v: serde_json::Value = serde_json::from_str(&bs).expect("parse");
        let board = &v["boards"][0];
        let piece_count = board.as_array().unwrap().iter().filter(|c| !c.is_null()).count();
        assert_eq!(piece_count, 32, "standard start position should have 32 pieces");
    }

    #[test]
    fn test_players_json_has_two_players() {
        let engine = new_engine(&chess_script());
        let pj = engine.players_json().expect("players_json");
        let v: serde_json::Value = serde_json::from_str(&pj).expect("parse");
        let players = v.as_array().expect("players array");
        assert_eq!(players.len(), 2);
        // Player 0 has data.color = "white"
        assert_eq!(players[0]["data"]["color"], "white");
        // Player 1 has data.color = "black"
        assert_eq!(players[1]["data"]["color"], "black");
    }

    #[test]
    fn test_valid_moves_returns_for_white() {
        let mut engine = new_engine(&chess_script());
        let vm = engine.valid_moves_all_json().expect("valid_moves_all_json");
        let v: serde_json::Value = serde_json::from_str(&vm).expect("parse");
        let all = v["validMoves"].as_array().expect("validMoves array");
        assert_eq!(all.len(), 2, "should have moves for 2 players");
        // Find white player's moves (id=0)
        let white = all.iter().find(|e| e["player"]["id"] == 0).expect("white player");
        let moves = white["moves"].as_array().expect("white moves");
        assert!(!moves.is_empty(), "white should have valid moves");
        // Each move should have type "move"
        for m in moves {
            assert_eq!(m["type"], "move", "move action type");
            assert!(m["from"]["row"].as_i64().is_some());
            assert!(m["to"]["row"].as_i64().is_some());
        }
    }

    #[test]
    fn test_active_player_has_moves_inactive_does_not() {
        let mut engine = new_engine(&chess_script());
        let vm = engine.valid_moves_all_json().expect("valid_moves_all_json");
        let v: serde_json::Value = serde_json::from_str(&vm).expect("parse");
        let all = v["validMoves"].as_array().expect("validMoves array");
        // Only the active player (white, id=0, turn=0) should have moves
        let white = all.iter().find(|e| e["player"]["id"] == 0).expect("white player");
        let black = all.iter().find(|e| e["player"]["id"] == 1).expect("black player");
        assert!(!white["moves"].as_array().unwrap().is_empty(), "white should have valid moves");
        assert!(black["moves"].as_array().unwrap().is_empty(), "black should NOT have moves (not black's turn)");
    }

    #[test]
    fn test_valid_moves_for_single_player() {
        let mut engine = new_engine(&chess_script());
        let vm = engine.valid_moves_for_player_json("0".to_string())
            .expect("valid_moves_for_player_json");
        let v: serde_json::Value = serde_json::from_str(&vm).expect("parse");
        let moves = v["moves"].as_array().expect("moves array");
        assert!(!moves.is_empty(), "white should have moves");
    }

    #[test]
    fn test_submit_move_works() {
        let mut engine = new_engine(&chess_script());
        // Move white pawn from a2 to a4: Coords(6,0) -> Coords(4,0)
        let from = Coords::new_board(6, 0, 0);
        let to = Coords::new_board(4, 0, 0);
        let result = engine.submit_move(0, from, to);
        assert!(result.is_ok(), "submit_move should succeed for a2a4");
        // After move, black should be the active player
        let vm = engine.valid_moves_all_json().expect("valid_moves_all_json after move");
        let v: serde_json::Value = serde_json::from_str(&vm).expect("parse");
        let all = v["validMoves"].as_array().expect("validMoves array");
        // White's moves should be empty (not white's turn)
        let white = all.iter().find(|e| e["player"]["id"] == 0).expect("white player");
        assert!(white["moves"].as_array().unwrap().is_empty(), "white should have no moves after playing");
        // Black should have moves
        let black = all.iter().find(|e| e["player"]["id"] == 1).expect("black player");
        assert!(!black["moves"].as_array().unwrap().is_empty(), "black should have moves");
    }

    #[test]
    fn test_submit_illegal_move_fails() {
        let mut engine = new_engine(&chess_script());
        // Try moving white queen from d1 to d5 — illegal with pawns in the way
        let from = Coords::new_board(7, 3, 0);
        let to = Coords::new_board(3, 3, 0);
        let result = engine.submit_move(0, from, to);
        assert!(result.is_err(), "illegal move should fail");
    }

    #[test]
    fn test_pawn_move_sequence() {
        let mut engine = new_engine(&chess_script());
        // a2a4 (white pawn push) — this is a legal move
        engine.submit_move(0, Coords::new_board(6, 0, 0), Coords::new_board(4, 0, 0)).unwrap();
        // b7b5 (black pawn push)
        engine.submit_move(1, Coords::new_board(1, 1, 0), Coords::new_board(3, 1, 0)).unwrap();
        // a4a5 (white pawn push)
        engine.submit_move(0, Coords::new_board(4, 0, 0), Coords::new_board(3, 0, 0)).unwrap();
        // After 3 moves, verify board state changed
        let bs = engine.board_state_json().expect("board_state_json");
        let v: serde_json::Value = serde_json::from_str(&bs).expect("parse");
        // Should still be 8x8
        assert_eq!(v["rows"], 8);
        assert_eq!(v["cols"], 8);
    }

    #[test]
    fn test_derive_ui_returns_empty_for_no_promotion() {
        let engine = new_engine(&chess_script());
        let ui = engine.derive_ui_json_js("0".to_string()).expect("derive_ui_json");
        let v: serde_json::Value = serde_json::from_str(&ui).expect("parse");
        // No promotion pending — should be empty or have minimal structure
        assert!(v.as_object().is_some());
        assert!(!v.as_object().unwrap().contains_key("promotion"), "no promotion should be pending");
    }

    #[test]
    fn test_game_progress_is_in_progress() {
        let mut engine = new_engine(&chess_script());
        assert!(!engine.derive_game_progress_bool(), "game should be in progress");
        assert!(engine.outcome().is_none(), "no outcome yet");
    }

    #[test]
    fn test_engine_with_chess_variant() {
        let engine = new_engine(&chess_script());
        let bs = engine.board_state_json().expect("board_state_json");
        let v: serde_json::Value = serde_json::from_str(&bs).expect("parse");
        assert_eq!(v["rows"], 8);
        assert_eq!(v["cols"], 8);
        // Standard chess has 32 pieces
        let board = &v["boards"][0];
        let piece_count = board.as_array().unwrap().iter().filter(|c| !c.is_null()).count();
        assert_eq!(piece_count, 32, "standard start position has 32 pieces");
    }

    #[test]
    fn test_state_json_roundtrip() {
        let engine = new_engine(&chess_script());
        let sj = engine.state_json().expect("state_json");
        let v: serde_json::Value = serde_json::from_str(&sj).expect("parse");
        // state has board and players
        assert!(v.get("board").is_some(), "state should have board key");
        assert!(v["players"].is_array(), "state.players should be array");
        assert!(v.get("turn").is_some(), "state should have turn key");
    }

    /// PIECE_DEFS is registered as a global module. This test verifies that
    /// the valid_moves function in the script can access PIECE_DEFS and
    /// correctly use pawn condition closures (|s,f,t| engine::board::get(...)).
    #[test]
    fn test_pawn_condition_closure_in_piece_defs() {
        let mut engine = new_engine(&chess_script());
        // Get valid moves for white — this exercises get_pseudo_dests which
        // uses pawn conditions (closures) from PIECE_DEFS
        let vm = engine.valid_moves_for_player_json("0".to_string())
            .expect("valid_moves_for_player_json");
        let v: serde_json::Value = serde_json::from_str(&vm).expect("parse");
        let moves = v["moves"].as_array().expect("moves array");

        // Find a pawn move — white pawns are on rows 1-6
        let pawn_moves: Vec<_> = moves.iter().filter(|m| {
            m["from"]["row"] == 6 || m["from"]["row"] == 5
        }).collect();
        assert!(!pawn_moves.is_empty(), "white should have pawn moves from ranks 1-2");

        // Each pawn move from starting position should be a single or double step
        for m in &pawn_moves {
            let from_row = m["from"]["row"].as_i64().unwrap();
            let to_row = m["to"]["row"].as_i64().unwrap();
            let row_diff = from_row - to_row;
            assert!(row_diff == 1 || row_diff == 2,
                "pawn move should be 1 or 2 squares forward, got from row {} to row {}", from_row, to_row);
        }
    }

    /// Test that the derive_game_progress function reports correctly.
    #[test]
    fn test_derive_game_progress_in_progress() {
        let mut engine = new_engine(&chess_script());
        let vm = engine.valid_moves_all_json().expect("valid_moves_all_json");
        let v: serde_json::Value = serde_json::from_str(&vm).expect("parse");
        // Game is in progress — gameOver should be null
        assert!(v["gameOver"].is_null(), "gameOver should be null for in-progress game");
        assert_eq!(engine.player_count(), 2);
    }

    /// Test engine construction with 4 players fails for chess (only allows 2).
    #[test]
    fn test_invalid_player_count_fails() {
        let result = ChessvariantEngine::new(chess_script(), 4);
        assert!(result.is_err(), "chess only allows 2 players");
    }

    /// Test the engine name and player count getters.
    #[test]
    fn test_name_and_player_count() {
        let engine = new_engine(&chess_script());
        assert_eq!(engine.name(), "Chess");
        assert_eq!(engine.player_count(), 2);
        assert_eq!(engine.min_players(), 2);
        assert_eq!(engine.max_players(), 2);
    }
}
