use serde::{Deserialize, Serialize};

/// Returned by `derive_game_progress()` to indicate whether the game continues
/// or has reached a terminal state.  The script always identifies the winning
/// **team**, never individual players — even 1v1 games have a default team.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "progress", rename_all = "snake_case")]
pub enum GameProgress {
    /// Game is still in progress — no result yet.
    #[serde(rename = "in_progress")]
    InProgress,
    /// Game ended in a draw.
    #[serde(rename = "draw")]
    Draw,
    /// A team has won.  `winning_team` is the team id as defined in the
    /// players' `team` field inside `state.players`.
    #[serde(rename = "decisive")]
    Decisive {
        #[serde(rename = "winning_team")]
        winning_team: i32,
    },
}

impl GameProgress {
    /// Convenience constructor for Rhai: `InProgress()`.
    pub fn in_progress() -> Self {
        GameProgress::InProgress
    }

    /// Convenience constructor for Rhai: `Draw()`.
    pub fn draw() -> Self {
        GameProgress::Draw
    }

    /// Convenience constructor for Rhai: `Winner(winning_team)`.
    pub fn winner(winning_team: i32) -> Self {
        GameProgress::Decisive { winning_team }
    }

    // ── Rhai getters (all &mut self because Rhai's register_get requires it) ──

    /// Returns the progress discriminator: `"in_progress"`, `"draw"`, or `"decisive"`.
    pub fn get_progress_mut(&mut self) -> String {
        match self {
            GameProgress::InProgress => "in_progress".to_string(),
            GameProgress::Draw => "draw".to_string(),
            GameProgress::Decisive { .. } => "decisive".to_string(),
        }
    }

    /// Returns the winning team id (only valid for `Decisive`).
    pub fn get_winning_team_mut(&mut self) -> i32 {
        match self {
            GameProgress::Decisive { winning_team } => *winning_team,
            _ => 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::GameProgress;

    #[test]
    fn test_in_progress_serialization() {
        let json = serde_json::to_value(&GameProgress::InProgress).unwrap();
        assert_eq!(json["progress"], "in_progress");
    }

    #[test]
    fn test_draw_serialization() {
        let json = serde_json::to_value(&GameProgress::Draw).unwrap();
        assert_eq!(json["progress"], "draw");
    }

    #[test]
    fn test_decisive_serialization() {
        let json = serde_json::to_value(&GameProgress::winner(1)).unwrap();
        assert_eq!(json["progress"], "decisive");
        assert_eq!(json["winning_team"], 1);
    }
}
