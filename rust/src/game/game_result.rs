use rhai::{Array, Dynamic, Map};

pub fn rhai_winner(player_index: i32) -> Dynamic {
    let mut map = Map::new();
    map.insert("type".into(), Dynamic::from("winner".to_string()));
    map.insert("player".into(), Dynamic::from(player_index));
    Dynamic::from(map)
}

pub fn rhai_winners(players: Array) -> Dynamic {
    let mut map = Map::new();
    map.insert("type".into(), Dynamic::from("winners".to_string()));
    map.insert("players".into(), Dynamic::from(players));
    Dynamic::from(map)
}

pub fn rhai_draw() -> Dynamic {
    let mut map = Map::new();
    map.insert("type".into(), Dynamic::from("draw".to_string()));
    Dynamic::from(map)
}

#[cfg(test)]
mod tests {
    use rhai::{Dynamic, Map};

    use super::{rhai_draw, rhai_winner, rhai_winners};

    #[test]
    fn test_winner_map() {
        let map = rhai_winner(1).cast::<Map>();
        assert_eq!(map.get("type").unwrap().clone().cast::<String>(), "winner");
        assert_eq!(map.get("player").unwrap().clone().cast::<i32>(), 1);
    }

    #[test]
    fn test_draw_map() {
        let map = rhai_draw().cast::<Map>();
        assert_eq!(map.get("type").unwrap().clone().cast::<String>(), "draw");
    }

    #[test]
    fn test_winners_map() {
        let map = rhai_winners(vec![Dynamic::from(0_i32), Dynamic::from(2_i32)]).cast::<Map>();
        assert_eq!(map.get("type").unwrap().clone().cast::<String>(), "winners");
    }
}
