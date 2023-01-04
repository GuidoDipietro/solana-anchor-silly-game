import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TokensTest } from "../target/types/tokens_test";
import * as assert from "assert";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { findProgramAddressSync } from "@coral-xyz/anchor/dist/cjs/utils/pubkey";
import { getAssociatedTokenAddress } from "@solana/spl-token";

describe("tokens-test", () => {
  /// Provider (local cluster) + program
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TokensTest as Program<TokensTest>;

  const admin = provider.wallet;
  const player = anchor.web3.Keypair.generate();

  let panchoMint: anchor.web3.PublicKey;
  let playerGamePda: anchor.web3.PublicKey;
  let panchoPlayerAta: anchor.web3.PublicKey;

  before(async () => {
    // Let's fund the player with some lamports
    const tx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: player.publicKey,
        lamports: 50 * anchor.web3.LAMPORTS_PER_SOL,
      })
    );

    await provider.sendAndConfirm(tx);

    // Let's derive some PDAs for us to have

    [panchoMint] = findProgramAddressSync(
      [Buffer.from("pancho-mint")],
      program.programId
    );
    console.log(`Pancho mint: ${panchoMint.toBase58()}`);

    [playerGamePda] = findProgramAddressSync(
      [Buffer.from("game"), player.publicKey.toBuffer()],
      program.programId
    );
    console.log(
      `${player.publicKey.toBase58()}'s game: ${playerGamePda.toBase58()}`
    );

    panchoPlayerAta = await getAssociatedTokenAddress(
      panchoMint,
      player.publicKey
    );
  });

  it("Initializes the program", async () => {
    // The panchoMint doesn't exist beforehand. We calculated the address,
    // but if we fetch if from the blockchain we get a null:
    let panchoMintStruct = await provider.connection.getAccountInfo(panchoMint);
    assert.equal(panchoMintStruct, null);

    // Here we call the "initialize()" instruction. We only pass
    // the accounts that are not PDAs and cannot be inferred
    // (those without a seeds = [something] constraint), and those that
    // are not common accounts such as the SystemProgram or stuff like that.
    await program.methods
      .initialize()
      .accounts({
        admin: admin.publicKey,
      })
      .rpc();

    // If we retrieve the mint now, it will exist
    panchoMintStruct = await provider.connection.getAccountInfo(panchoMint);
    assert.notEqual(panchoMintStruct, null);
  });

  it("Starts a game for a given player", async () => {
    let playerGame = await provider.connection.getAccountInfo(playerGamePda);
    assert.equal(playerGame, null);

    // Now, we will call createGame which will initialize a PDA.
    // As you can see, it was null before and now it isn't.
    await program.methods
      .createGame()
      .accounts({
        player: player.publicKey,
      })
      .signers([player])
      .rpc();

    playerGame = await provider.connection.getAccountInfo(playerGamePda);
    assert.notEqual(playerGame, null);

    // You might have noticed that there is a ".signers()" thing there going on...
    // This is added so that the transaction gets compiled and serialized together
    // with the signature of that account. If you check the Rust file, you'll see
    // the "player" account is of type Signer<'info>.
    // Then why was this not needed with the admin account? This is only so because
    // Anchor adds it implicitly for us if we use the provider.wallet as we do with the admin.

    // Anchor adds 8 bytes at the start of the account's data, so even though
    // the createGame() instruction doesn't edit anything, the account holds data!
    console.log(
      `Game PDA data: 8 bytes of discriminator, then one byte in 00 (the u8 counter!)\n`,
      playerGame.data,
      `\n`
    );
  });

  it("Plays 9 times and hasn't won yet", async () => {
    // The user will play 9 times, and after that still won't hold 1 pancho on their ATA

    for (let i = 0; i < 9; i++) {
      await program.methods
        .playGame()
        .accounts({
          player: player.publicKey,
          panchoPlayerAta,
        })
        .signers([player])
        .rpc();
    }

    let panchoBalance = await provider.connection.getTokenAccountBalance(
      panchoPlayerAta
    );
    assert.equal(panchoBalance.value.amount, "0");
  });

  it("Doesn't let you play if your Pubkey does not match that of the provided Game", async () => {
    // Now... we have been omitting the pubkeys of the PDAs. What happens if we submit a
    // pubkey for a Game that does not match that one derived by the seeds we expect?

    // Let's pass an existing account, that has nothing to do with what it expects.

    try {
      await program.methods
        .playGame()
        .accounts({
          player: player.publicKey,
          panchoPlayerAta,
          game: panchoPlayerAta, // nothing to do with the Game PDA!
        })
        .signers([player])
        .rpc();
    } catch (error) {
      // This will give a "AccountOwnedByWrongProgram" error! Meaning the pubkey we passed doesn't
      // have an owner being our own program. If you remember, PDAs, once initialized, have the
      // owner field set to the program whose program id we used to derive it from.
      // In this case, it is our program. But since we provided a random account... then
      // there is an owner mismatch!
      assert.equal(error.error.errorCode.code, `AccountOwnedByWrongProgram`);
    }
  });

  it("Plays again and wins 1 pancho", async () => {
    // Now, if the user plays one more time, they should earn one pancho
    await program.methods
      .playGame()
      .accounts({ player: player.publicKey, panchoPlayerAta })
      .signers([player])
      .rpc();

    // Let's see...
    let panchoBalance = await provider.connection.getTokenAccountBalance(
      panchoPlayerAta
    );
    assert.equal(panchoBalance.value.amount, "1");
    // Nashe
  });

  it("Fails if you try to play again after winning", async () => {
    // If they get too greedy and want to keep playing... Then this will happen:
    try {
      await program.methods
        .playGame()
        .accounts({ player: player.publicKey, panchoPlayerAta })
        .signers([player])
        .rpc();
    } catch (error) {
      // Remember the check we added to throw a "GameIsOver" error?
      // It comes all the way up to here!
      assert.equal(error.error.errorCode.code, `GameIsOver`);
    }
  });

  it("Doesn't let you start a game again if you already did it", async () => {
    // Now, maybe the user thinks... If I try to initialize a game again, maybe
    // it gets down to 0 again and I can play everything again and earn another Pancho!

    // Let's try this...
    try {
      await program.methods
        .createGame()
        .accounts({ player: player.publicKey })
        .signers([player])
        .rpc();
    } catch (error) {
      // No... The account has already been initialized, and therefore can't be re-initialized!
      // This is only possible because Anchor checks that the discriminator is already set to
      // what they expect, and that the account doesn't actually have an uninitialized state
      // (lamports equal to 0, owner being the System Program).
      // Once the account is initialized, they need to hold a balance greater than 0, as per
      // what the rent exemption value is (otherwise, they get closed after a while!),
      // and the owner moves from the System Program to being our Program (for a PDA).
      assert.ok(error.logs.join().includes(`already in use`));
    }
  });
});
