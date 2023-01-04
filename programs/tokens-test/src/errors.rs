use anchor_lang::prelude::*;

#[error_code]
pub enum PanchoGameError {
    #[msg("The game has already ended!")]
    GameIsOver,
}
