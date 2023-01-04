use anchor_lang::prelude::*;

#[account]
pub struct Game {
    pub counter: u8,
}

impl Game {
    pub const LEN: usize =
        8 +     // Discriminator
        1       // counter (u8)
    ;

    pub const WINNING_NUMBER: u8 = 10;
}
