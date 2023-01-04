# Anchor silly game

### Scheme

There exists a token Mint which can mint panchos.

That mint's authority is a PDA owned by the program.

How do you win? Just initialize a Game, increment a counter until it gets to 10, and you win!

When you do, you will get one pancho minted to your token account. The program takes care of initializing everything. Just sit back, relax, and win a pancho.

### Instructions

- `initialize()`: creates the token mint that we will use to make panchos appear out of thin air
- `create_game()`: creates a Game for a player
- `play_game()`: increments the counter (originally in 0) by 1 every time you call it. If you get to 10, you get a token minted to your Token Account!

### Building and testing

Install [Anchor](https://www.anchor-lang.com/docs/installation) first. Then run:

```bash
yarn install
yarn add ts-mocha
anchor test
```
