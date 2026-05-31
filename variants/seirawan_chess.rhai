// ============================================================
// SEIRAWAN CHESS (S-Chess) — api_version 1
//
// Standard chess extended with two new pieces per player:
//   Hawk     (H) = Bishop + Knight  moves
//   Elephant (E) = Rook   + Knight  moves
//
// Gating rule:
//   When a piece moves off its starting back-rank square for the
//   FIRST TIME, the owning player MAY place one of their remaining
//   hand pieces (Hawk or Elephant) on the vacated square.
//   The player can also decline ("none").
//
// Hawk and Elephant are declared via combine() in config, so the
// engine auto-generates pseudo_moves for them.
// check_protection: true gives us engine_valid_actions for free.
// ============================================================

fn config() {
  #{
    api_version:      1,
    name:             "Seirawan Chess",
    version:          "1.0.0",
    colors:           ["white", "black"],
    allowed_player_count: 2,
    board:            #{ type: "rectangle", rows: 8, cols: 8 },
    check_protection: true,
    pieces: #{
      "hawk":     combine("bishop", "knight"),
      "elephant": combine("rook",   "knight"),
    },
    promotion_pieces: ["queen","rook","bishop","knight","hawk","elephant"],
  }
}

// ── Player / color helpers ───────────────────────────────────

fn opponent_color(color) {
  if color == "white" { "black" } else { "white" }
}

fn back_rank(color) {
  if color == "white" { 7 } else { 0 }
}

fn promo_row(color) {
  if color == "white" { 0 } else { 7 }
}

fn own(p, color) {
  p != () && p.color == color
}

fn is_gating_square(color, row, col) {
  row == back_rank(color) && col >= 0 && col <= 7
}

fn has_hand_piece(state, player_name, piece_type) {
  for p in state.hand {
    if p.player == player_name { return p.held.contains(piece_type); }
  }
  false
}

// ── Gating helpers ───────────────────────────────────────────

fn triggers_gating(state, player_name, color, from) {
  is_gating_square(color, from.row, from.col) &&
  gating_available_for_player(state, player_name).contains(from.col)
}

fn gating_available_for_player(state, player_name) {
  for p in state.gating_available {
    if p.player == player_name { return p.cols; }
  }
  [0,1,2,3,4,5,6,7]
}

fn gate_options(state, player_name) {
  let opts = ["none"];
  if has_hand_piece(state, player_name, "hawk")     { opts.push("hawk"); }
  if has_hand_piece(state, player_name, "elephant") { opts.push("elephant"); }
  opts
}

fn remove_col(gating_available, player_name, col) {
  let ga = gating_available;
  for p in ga {
    if p.player == player_name {
      p.cols = p.cols.filter(|c| c != col);
    }
  }
  ga
}

fn remove_from_hand(hand, player_name, piece_type) {
  let h = hand;
  for p in h {
    if p.player == player_name {
      let idx = p.held.index_of(piece_type);
      if idx >= 0 { p.held.remove(idx); }
    }
  }
  h
}

// ── valid_actions ─────────────────────────────────────────────

fn valid_actions(state, player) {
  let player_name = player.color;  // name == color in Seirawan

  // During pending gate or promotion — no board moves possible;
  // the UI modal handles the choice.
  if state.pending_gate != () || state.pending_promotion != () {
    return [];
  }

  engine_valid_actions(state, player)
}

// ── handle_event ──────────────────────────────────────────────

fn handle_event(state, player, event) {
  let player_color = player.color;
  let player_name  = player_color;   // name == color in 2-player Seirawan

  // ── Gating choice ──
  if event.type == "gate" {
    let pg = state.pending_gate;
    if pg == () { throw "no pending gate"; }
    if player_name != pg.player { throw "waiting for gating player"; }

    let choice = event.value;
    let valid_choices = gate_options(state, player_name);
    if !valid_choices.contains(choice) { throw `invalid gate choice: ${choice}`; }

    let board = state.board;
    let hand  = state.hand;

    if choice != "none" {
      board = board_set(board, pg.vacated, Piece(player_color, choice));
      hand  = remove_from_hand(hand, player_name, choice);
    }

    let new_state = end_turn(merge(state, #{
      board: board, hand: hand, pending_gate: ()
    }));
    return #{ state: new_state, ui: [] };
  }

  // ── Promotion choice ──
  if event.type == "promote" {
    let pp = state.pending_promotion;
    if pp == () { throw "no pending promotion"; }
    if player_name != pp.player { throw "waiting for promotion player"; }

    let choice = event.value;
    let valid = state.config_promotion_pieces ?? ["queen","rook","bishop","knight","hawk","elephant"];
    if !valid.contains(choice) { throw "invalid promotion piece"; }

    let hand = state.hand;
    if choice == "hawk" || choice == "elephant" {
      if !has_hand_piece(state, player_name, choice) { throw "piece not in hand"; }
      hand = remove_from_hand(hand, player_name, choice);
    }
    let board = board_set(state.board, pp.to, Piece(player_color, choice));
    let new_state = end_turn(merge(state, #{
      board: board, hand: hand, pending_promotion: ()
    }));
    return #{ state: new_state, ui: [] };
  }

  // ── Normal move ──
  if event.type == "move" {
    if !state.active_players.contains(player) {
      throw `${player_color} is not active`;
    }

    let from  = event.from;
    let to    = event.to;
    let piece = board_get(state.board, from);

    if piece == () || !own(piece, player_color) { throw "no own piece at source"; }

    // Delegate legality to engine (includes check filtering)
    let legal = engine_valid_actions(state, player)
      .filter(|a| a.type == "move" && a.from == from)
      .map(|a| a.to);
    if !legal.contains(to) { throw "illegal move"; }

    let board = board_move_piece(state.board, from, to);
    let state = merge(state, #{ board: board });

    // Promotion?
    if piece.type == "pawn" && to.row == promo_row(player_color) {
      let promotion_pieces = ["queen","rook","bishop","knight"];
      if has_hand_piece(state, player_name, "hawk")     { promotion_pieces.push("hawk"); }
      if has_hand_piece(state, player_name, "elephant") { promotion_pieces.push("elephant"); }

      let new_state = merge(state, #{
        pending_promotion: #{ player: player_name, to: to }
      });
      return #{
        state: new_state,
        ui: [#{
          type: "choice",
          action: "promote",
          title: "Promote pawn",
          options: promotion_pieces,
          players: [player_color],
        }],
      };
    }

    // Gating?
    if triggers_gating(state, player_name, player_color, from) {
      let opts = gate_options(state, player_name);
      if opts.len() > 1 {
        let new_state = merge(state, #{
          pending_gate: #{ player: player_name, vacated: from },
          gating_available: remove_col(state.gating_available, player_name, from.col),
        });
        return #{
          state: new_state,
          ui: [#{
            type: "choice",
            action: "gate",
            title: "Gate a piece?",
            options: opts,
            players: [player_color],
          }],
        };
      }
    }

    let ga = if is_gating_square(player_color, from.row, from.col) {
      remove_col(state.gating_available, player_name, from.col)
    } else {
      state.gating_available
    };

    return #{ state: end_turn(merge(state, #{ gating_available: ga })), ui: [] };
  }

  throw `unknown event type: ${event.type}`;
}

fn end_turn(state) {
  let current = state.active_players[0];
  let next = Player(if current.color == "white" { "black" } else { "white" });
  merge(state, #{ active_players: [next] })
}

// Called automatically by the engine after every event.
fn check_game_over(state) {
  for p in state.players {
    let kings = board_find(state.board, Piece(p.color, "king"));
    if kings.len() == 0 {
      let winner_color = opponent_color(p.color);
      let winner_idx = state.players
        .filter(|q| q.color == winner_color)
        .map(|q| q.board)[0];
      return merge(state, #{ game_over: Winner(winner_idx) });
    }
  }
  state
}

// ── init ──────────────────────────────────────────────────────

fn init(player_count) {
  #{
    board:              standard_start_position(),
    players:            [
      #{ board: 0, color: "white", team: 0 },
      #{ board: 0, color: "black", team: 1 },
    ],
    active_players:     [Player("white")],
    hand:               [#{ player: "white", held: ["hawk", "elephant"] }, #{ player: "black", held: ["hawk", "elephant"] }],
    gating_available:   [#{ player: "white", cols: [0,1,2,3,4,5,6,7] }, #{ player: "black", cols: [0,1,2,3,4,5,6,7] }],
    pending_gate:       (),
    pending_promotion:  (),
    game_over:          (),
  }
}
