use anchor_lang::prelude::*;
use anchor_spl::{token::{Mint, TokenAccount, Token}, associated_token::AssociatedToken};

use crate::{state::*, errors::PanchoGameError};

#[derive(Accounts)]
pub struct PlayGame<'info> {
    /// Payer and player of the game
    #[account(mut)]
    pub player: Signer<'info>,

    /// PDA holding the state of the game, one for each user (1:1)
    #[account(
        mut,
        seeds = [b"game".as_ref(), player.key().as_ref()],
        bump
    )]
    pub game: Account<'info, Game>,

    /// System Account (not initialized account) that happens to be a PDA
    /// We can (and should) use accounts like this to give the authority
    /// of something (such as a Mint account) to our program.
    #[account(
        seeds = [b"pda-minter".as_ref()],
        bump
    )]
    pub pda_minter: SystemAccount<'info>,

    /// This is a Mint account that can create pancho tokens. The mint authority
    /// is our uninitialized PDA, which means the only one "who" can mint tokens from
    /// this mint account is that account, and since that account is a PDA from our program,
    /// then we can ONLY do it from this program! This will be done through a invoke_signed()
    /// call, or through a CPI using seeds as signers (CpiContext::new_with_signer)
    #[account(
        mut,
        seeds = [b"pancho-mint".as_ref()],
        bump,
        mint::authority = pda_minter
    )]
    pub pancho_mint: Account<'info, Mint>,

    /// This is the token account where the user will hold their panchos.
    /// We are deriving this using the associated_token constraints, which
    /// basically do this transformation:
    /// 
    /// Input: account mint, owner mint
    /// Output: ATA address
    /// 
    /// This means that for each pair of (account mint, owner mint) there is one
    /// associated token account (ATA). This ATA is a PDA from the AssociatedToken
    /// program, if you are curious
    #[account(
        init_if_needed,
        associated_token::mint = pancho_mint,
        associated_token::authority = player,
        payer = player
    )]
    pub pancho_player_ata: Account<'info, TokenAccount>,

    // Next, we'll include some accounts needed for CPIs Anchor will do under the hood
    // for us, such as to initialize accounts or move tokens around.

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<PlayGame>) -> Result<()> {
    // If the counter is equal to the winning number, the game is over and we can't keep playing
    if ctx.accounts.game.counter == Game::WINNING_NUMBER {
        err!(PanchoGameError::GameIsOver)?;
    }

    // Otherwise, increment the counter by 1 and check if we won!
    ctx.accounts.game.counter += 1;

    if ctx.accounts.game.counter == Game::WINNING_NUMBER {
        msg!("You won!");

        // Mint one pancho to the player

        // These are the seeds of the pda_minter PDA. As you can see, the bump
        // is included here too. By passing these seeds as an argument to the
        // CpiContext with signer, Solana is able to verify that this call indeed
        // came from a program with authority over that account, since the runtime
        // will then call find_program_address() with those seeds and our program's ID.
        // If that returns the public key that is requested as a Signer, then Solana
        // will interpret that we can sign on their behalf, since it's a PDA we own.
        let pda_minter_bump = *ctx.bumps.get("pda_minter").unwrap();
        let signer_seeds = &[b"pda-minter".as_ref(), &[pda_minter_bump]];

        // Next, we will call the mint_to instruction on the anchor_spl::token program.
        // This program is the Rust program of the executable account we passed in the
        // context called "token_program", and this is the program responsible for minting,
        // transfering, burning, freezing (etc.) all types of tokens and NFTs.

        // The first argument is a CpiContext. This is basically the context we define in our
        // instructions with the #[derive(Accounts)] macro, together with the called program
        // and optional signer seeds (which we use), as seen from the "caller" side.

        // The CpiContext, if somebody were to call this instruction called play_game() from
        // another program, would be the PlayGame struct we defined above. In this case, this
        // struct is called MintTo, and we are referencing it as anchor_spl::token::MintTo.

        // The second argument is just the parameter this instruction takes. In this case, it's
        // a simple u64 integer which we will pass as 1.
        anchor_spl::token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::MintTo {
                    mint: ctx.accounts.pancho_mint.to_account_info(),
                    to: ctx.accounts.pancho_player_ata.to_account_info(),
                    authority: ctx.accounts.pda_minter.to_account_info(),
                },
                &[signer_seeds]
            ),
            1
        )?;

        // After this happened, if this call succeeded then the program will continue.
        // If it failed, the "?" will take care and propagate the error, causing it to return early.
    }

    Ok(())
}
