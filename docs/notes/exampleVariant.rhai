fn config() {
  #{
    name: "Chess 2.0",
    version: "0.0.1",
    api_version: "0.0.1",
    minimum_players: 2,
    reserve_pile: false,
    board: #{
      count: 1,
      layout: #{
        type: "rectangle",
        rows: 8,
        columns: 8,
      }
    },
  }
}
