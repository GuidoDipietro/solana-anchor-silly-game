use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// System Account (not initialized account) that happens to be a PDA
    /// We can (and should) use accounts like this to give the authority
    /// of something (such as a Mint account) to our program.
    #[account(
        seeds = [b"pda-minter".as_ref()],
        bump
    )]
    pub pda_minter: SystemAccount<'info>,

    /// This is a Mint account that can create pancho tokens. This account will be init in this
    /// instruction. The mint authority will be our uninitialized PDA, which means the only one
    /// "who" can mint tokens from this mint account is that account, and since that account
    /// is a PDA from our program, then we can ONLY do it from this program! This will be done
    /// through a invoke_signed() call, or through a CPI using seeds as signers (CpiContext::new_with_signer)
    #[account(
        init_if_needed,
        seeds = [b"pancho-mint".as_ref()],
        bump,
        mint::authority = pda_minter,
        mint::decimals = 0,
        payer = admin
    )]
    pub pancho_mint: Account<'info, Mint>,

    // Next, we'll include some accounts needed for CPIs Anchor will do under the hood
    // for us, such as to initialize accounts (in this case, the Mint account)

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(_ctx: Context<Initialize>) -> Result<()> {
    // We don't need to do anything here, since we only need to initialize the Mint.
    // That initialization happens with a CPI to the token program which is done
    // by Anchor upon the parsing of the field we annotated with init_if_needed!

    // On a real program, this handler function wouldn't even be needed as it does nothing.

    Ok(())
}
