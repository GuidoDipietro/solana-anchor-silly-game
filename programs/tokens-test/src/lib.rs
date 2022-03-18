use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, SetAuthority, Transfer};
use spl_token::instruction::AuthorityType;

declare_id!("2rtCa9QiPeY5Jeu5GDPPQJu3zir4YgeQakhUGAkKFWf2");

#[program]
pub mod tokens_test {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> ProgramResult {
        // Change reserve_token_account authority to reserve_authority
        token::set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info().clone(),
                SetAuthority {
                    account_or_mint: ctx.accounts.reserve_token_account.to_account_info().clone(),
                    current_authority: ctx.accounts.initializer.to_account_info().clone(),
                },
            ),
            AuthorityType::AccountOwner,
            Some(*ctx.accounts.reserve_authority.key),
        )?;

        Ok(())
    }

    pub fn create_game(ctx: Context<CreateGame>) -> ProgramResult {
        ctx.accounts.game.current_amount = 0;
        ctx.accounts.game.player = *ctx.accounts.player.key;

        Ok(())
    }

    pub fn play_game(ctx: Context<PlayGame>, reserve_authority_bump: u8) -> ProgramResult {
        // Check if game already finished
        if ctx.accounts.game.current_amount >= 10 {
            return Err(ErrorCode::GameOver.into());
        }

        // Otherwise, play!
        ctx.accounts.game.current_amount += 1;
        if ctx.accounts.game.current_amount == 10 {
            msg!("You won! lol");
            
            // Transfer token
            ctx.accounts.send_prize(reserve_authority_bump).unwrap();
        }

        Ok(())
    }
}

/// Context Accounts

#[derive(Accounts)]
pub struct Initialize<'info> {
    pub initializer: Signer<'info>,
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        seeds = [b"reserve-authority"],
        bump,
        payer = initializer,
        space = 0 // no function or associated item named `default` found for struct `anchor_lang::prelude::AccountInfo`
    )]
    pub reserve_authority: AccountInfo<'info>,

    #[account(
        init,
        seeds = [b"reserve"],
        bump,
        payer = initializer,
        token::mint = mint,
        token::authority = initializer, // will be changed on init, manually
    )]
    pub reserve_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CreateGame<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        init,
        seeds = [b"game", player.key().as_ref()],
        bump,
        payer = player,
        space = Game::LEN
    )]
    pub game: Account<'info, Game>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(reserve_authority_bump: u8)]
pub struct PlayGame<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(mut)]
    pub player_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"reserve"],
        bump
    )]
    pub reserve_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"reserve-authority"],
        bump = reserve_authority_bump
    )]
    pub reserve_authority: AccountInfo<'info>,

    #[account(
        mut,
        has_one = player
    )]
    pub game: Account<'info, Game>,

    // How to check that this is the actual Token Program? Is it needed?
    pub token_program: Program<'info, Token>,
}
impl<'info> PlayGame<'info> {
    pub fn send_prize(&self, reserve_authority_bump: u8) -> ProgramResult {
        let cpi_accounts: Transfer = Transfer {
            from: self.reserve_token_account.to_account_info().clone(),
            to: self.player_token_account.to_account_info().clone(),
            authority: self.reserve_authority.clone(),
        };

        const RESERVE_AUTH_SEED: &[u8] = b"reserve-authority";
        let auth_seeds = &[&RESERVE_AUTH_SEED[..], &[reserve_authority_bump]];

        const AMOUNT: u64 = 1;
        token::transfer(
            CpiContext::new_with_signer(
                self.token_program.to_account_info().clone(),
                cpi_accounts,
                &[&auth_seeds[..]]
            ),
            AMOUNT
        )
    }
}

/// Data Accounts

#[account]
pub struct Game {
    // amount >= 10 -> game is over
    pub current_amount: u64,
    pub player: Pubkey,
}
impl Game {
    const LEN: usize = 8 + 8 + 32;
}

/// Errors

#[error]
pub enum ErrorCode {
    #[msg("The game has already finished!")]
    GameOver,
}
