fn config() {
    #{ api_version: 2, name: "Simple Chess (test)", version: "1.0.0", colors: ["white","black"], allowed_player_count: 2, board: #{ type: "rectangle", rows: 8, cols: 8 } }
}
fn init(player_count) {
    #{ board: standard_start_position(), players: [#{ board: 0, color: "white", team: 0 },#{ board: 0, color: "black", team: 1 }], turn: "white" }
}
fn valid_actions(state) {
    let actions = [];
    for p in state.players {
        if p.color == state.turn {
            actions.push(#{ player: p, actions: [Move(Coords(0,0), Coords(0,0))] });
        } else {
            actions.push(#{ player: p, actions: [] });
        }
    }
    actions
}
fn handle_action(state, player, action) {
    let player_color = player.color;
    if state.turn != player_color { throw "not active"; }
    if action.type == "move" {
        let src = engine::board::get(state.board, action.from);
        if src == () { throw "no piece"; }
        if src.color != player_color { throw "not yours"; }
        let dst = engine::board::get(state.board, action.to);
        if dst != () && dst.color == player_color { throw "own piece"; }
        let b = engine::board::move_piece(state.board, action.from, action.to);
        for p in state.players {
            let kings = engine::board::find(b, Piece(p.color, "king"));
            if kings.len() == 0 {
                let oc = if p.color == "white" { "black" } else { "white" };
                let wi = state.players.filter(|q| q.color == oc).map(|q| q.board)[0];
                return merge(state, #{ board: b, outcome: Winner(wi) });
            }
        }
        let next = if player_color == "white" { "black" } else { "white" };
        return merge(state, #{ board: b, turn: next });
    }
    state
}
