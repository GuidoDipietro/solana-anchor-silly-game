# Anchor silly game

### Scheme

The Program has a Token Account where it holds tokens of a certain preexisting Token Mint and transfers them to players when they win.

That token account's authority is a PDA owned by the program.

Players need a Token Account to receive the prize.

How do you win? Just initialize a Game, increment a counter until it gets to 10, and you win! Terrible.

### Instructions

- Initialize: creates the program Token Account and the Token Account's authority which is another PDA
- Create Game: creates a Game for a player
- Play Game: increments the counter (originally in 0) by 1 every time you call it. If you get to 10, you get a token transferred to your Token Account!

### Building and testing

Install [Anchor](https://project-serum.github.io/anchor/getting-started/installation.html) first. Then run:

```bash
yarn install
anchor test
```

