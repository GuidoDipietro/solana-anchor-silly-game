use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod errors;

pub use crate::{instructions::*, state::*};

declare_id!("AqS2hN29WNjg3tH7EVvcEZ64LEAx5q7UjicpgPPkPtc3");

#[program]
pub mod tokens_test {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize::handler(ctx)
    }

    pub fn create_game(ctx: Context<CreateGame>) -> Result<()> {
        create_game::handler(ctx)
    }

    pub fn play_game(ctx: Context<PlayGame>) -> Result<()> {
       play_game::handler(ctx)
    }
}
