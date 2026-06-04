use rhai::CustomType;
use serde::Serialize;

#[derive(Clone, Debug, CustomType, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameResult {
    #[serde(rename = "type")]
    #[rhai_type(name = "type", readonly)]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[rhai_type(readonly)]
    pub player: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[rhai_type(readonly)]
    pub players: Option<Vec<i32>>,
}

impl GameResult {
    pub fn winner(player: i32) -> Self {
        Self {
            kind: "winner".into(),
            player: Some(player),
            players: None,
        }
    }

    pub fn winners(players: Vec<i32>) -> Self {
        Self {
            kind: "winners".into(),
            player: None,
            players: Some(players),
        }
    }

    pub fn draw() -> Self {
        Self {
            kind: "draw".into(),
            player: None,
            players: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::GameResult;

    #[test]
    fn test_winner() {
        let result = GameResult::winner(1);
        assert_eq!(result.kind, "winner");
        assert_eq!(result.player, Some(1));
        assert_eq!(result.players, None);
    }

    #[test]
    fn test_draw() {
        let result = GameResult::draw();
        assert_eq!(result.kind, "draw");
        assert_eq!(result.player, None);
        assert_eq!(result.players, None);
    }

    #[test]
    fn test_winners() {
        let result = GameResult::winners(vec![0, 2]);
        assert_eq!(result.kind, "winners");
        assert_eq!(result.player, None);
        assert_eq!(result.players, Some(vec![0, 2]));
    }
}
