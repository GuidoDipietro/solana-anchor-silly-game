use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct CreateGame<'info> {
    /// Player of the game, signer of the instruction
    #[account(mut)]
    pub player: Signer<'info>,

    /// PDA holding the state of this user's game. This is 1:1 user to game.
    #[account(
        init,
        seeds = [b"game".as_ref(), player.key().as_ref()],
        bump,
        payer = player,
        space = Game::LEN
    )]
    pub game: Account<'info, Game>,

    /// The Solana's System Program, needed to init the PDA
    pub system_program: Program<'info, System>,
}

pub fn handler(_ctx: Context<CreateGame>) -> Result<()> {
    // We don't need to do anything since the only field in the Game
    // struct is set to 0 by default, and this is the value we want!

    // On a real program, this handler function wouldn't even be needed as it does nothing.

    Ok(())
}
