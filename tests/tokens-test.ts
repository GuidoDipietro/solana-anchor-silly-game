import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import * as spltoken from "@solana/spl-token";
import { TokensTest } from '../target/types/tokens_test';
import * as assert from 'assert';

describe('tokens-test', () => {

    /// Provider (local cluster) + program
    anchor.setProvider(anchor.Provider.env());
    const program = anchor.workspace.TokensTest as Program<TokensTest>;

    /// Some user accounts
    let token_creator: anchor.web3.Keypair;          // Token creator and mint authority
    let pancho_mint: spltoken.Token;                 // Token mint account

    let player: anchor.web3.Keypair;                 // Will play the game to earn 1 pancho
    let player_token_account: anchor.web3.PublicKey; // Will hold panchos here

    /// PDAs
    // seeds: "reserve"
    let reserveTokenAccount: anchor.web3.PublicKey;  // Token account where the Program will hold reward Panchos
    // seeds: "reserve-authority"
    let reserveAuthority_bump: number;
    let reserveAuthority: anchor.web3.PublicKey;     // Authority of the prev account; since it's owned
                                                     // by the program then it means the reserveTokenAccount
                                                     // is therefore only managed by the program too.
    // seeds: "game", player.pubkey
    let game: anchor.web3.PublicKey;                 // Data account for the game                                    

    before(async () => {
        /// Here we create/find the accounts, fund them, and create the token mint

        // Creating two accounts and funding them with 10 SOLS
        const FUND = 10;
        token_creator = anchor.web3.Keypair.generate();
        player = anchor.web3.Keypair.generate();

        await program.provider.connection.confirmTransaction(
            await program.provider.connection.requestAirdrop(
                token_creator.publicKey,
                FUND * anchor.web3.LAMPORTS_PER_SOL
            ),
            "processed"
        );
        await program.provider.connection.confirmTransaction(
            await program.provider.connection.requestAirdrop(
                player.publicKey,
                FUND * anchor.web3.LAMPORTS_PER_SOL
            ),
            "processed"
        );

        // Creating Token mint for PANCHO token (1 token = 1 pancho)
        pancho_mint = await spltoken.Token.createMint(
            program.provider.connection,        // Conn
            token_creator,                      // Payer
            token_creator.publicKey,            // Mint Authority
            null,                               // Freeze Authority
            8,                                  // Decimals
            spltoken.TOKEN_PROGRAM_ID           // Token Program
        );

        // Creating Token Account for Player to hold the panchos
        player_token_account = await pancho_mint.createAccount(player.publicKey);

        // Deriving pubkeys of the PDAs
        let _; // who cares
        [reserveAuthority, reserveAuthority_bump] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("reserve-authority")],
            program.programId
        );
        [reserveTokenAccount, _] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("reserve")],
            program.programId
        );
        [game, _] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("game"), player.publicKey.toBuffer()],
            program.programId
        );
    });

    it('Initializes the program', async () => {
        // Init program (Creates Token Account with PDA authority)
        await program.rpc.initialize({
            accounts: {
                initializer: program.provider.wallet.publicKey,
                mint: pancho_mint.publicKey,
                reserveAuthority: reserveAuthority,
                reserveTokenAccount: reserveTokenAccount,
                tokenProgram: spltoken.TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            },
        });

        // Mint 1000 tokens to the created Token Account
        const val = 1000;
        await pancho_mint.mintTo(
            reserveTokenAccount,
            token_creator.publicKey,
            [token_creator],
            val
        );

        // Assert it is initialized properly
        let reserveTokenAccount_info = await pancho_mint.getAccountInfo(reserveTokenAccount);
        let reserveAuthority_info = await program.provider.connection.getAccountInfo(reserveAuthority);

        assert.equal(reserveTokenAccount_info.amount, val);
        assert.equal(reserveTokenAccount_info.owner.toBase58(), reserveAuthority.toBase58());
        assert.equal(reserveTokenAccount_info.mint.toBase58(), pancho_mint.publicKey.toBase58());

        assert.equal(reserveAuthority_info.owner.toBase58(), program.programId.toBase58());
    });

    it('Starts a game for a given player', async () => {
        // Account doesn't exist yet
        let game_info = await program.provider.connection.getAccountInfo(game);
        assert.equal(game_info, null);

        // Create game instruction
        await program.rpc.createGame({
            accounts: {
                player: player.publicKey,
                game: game,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
            signers: [player],
        });

        // Check that Game is now an account with 16 bytes alloc'd and zeroed
        const GAME_LEN = 8+8+32;
        game_info = await program.provider.connection.getAccountInfo(game);
        let game_struct = await program.account.game.fetch(game);

        assert.equal(game_info.data.length, GAME_LEN);
        assert.equal(game_struct.currentAmount, 0);
        assert.equal(game_struct.player.toBase58(), player.publicKey.toBase58());
    });

    it('Plays 9 times and hasn\'t won yet', async () => {
        // Player initial pancho balance (0)
        let initial_panchos = (await pancho_mint.getAccountInfo(player_token_account)).amount;

        const ITERS = 9;
        for (let i=0; i<ITERS; i++) {
            await program.rpc.playGame(
                reserveAuthority_bump,
                {
                    accounts: {
                        player: player.publicKey,
                        playerTokenAccount: player_token_account,
                        reserveTokenAccount: reserveTokenAccount,
                        reserveAuthority: reserveAuthority,
                        game: game,
                        tokenProgram: spltoken.TOKEN_PROGRAM_ID,
                    },
                    signers: [player],
                }
            );
        }

        // Value unchanged
        let final_panchos = (await pancho_mint.getAccountInfo(player_token_account)).amount;
        assert.equal(initial_panchos.toNumber(), final_panchos.toNumber());

        // Counter in Game is now ITERS=9
        let game_struct = await program.account.game.fetch(game);
        assert.equal(game_struct.currentAmount, ITERS);
    });

    it('Doesn\'t let you play if your Pubkey does not match that of the provided Game', async () => {
        // Someone else, trying to play Player's game
        let impostor: anchor.web3.Keypair = anchor.web3.Keypair.generate();

        let game_struct = await program.account.game.fetch(game);
        assert.notEqual(game_struct.player.toBase58(), impostor.publicKey.toBase58());

        // Anchor checks that game.player == player.key, so if we play someone else's game it fails
        try {
            await program.rpc.playGame(
                reserveAuthority_bump,
                {
                    accounts: {
                        player: impostor.publicKey,
                        playerTokenAccount: player_token_account, // doesn't matter
                        reserveTokenAccount: reserveTokenAccount,
                        reserveAuthority: reserveAuthority,
                        game: game,                               // not impostor's game
                        tokenProgram: spltoken.TOKEN_PROGRAM_ID,
                    },
                    signers: [player],
                }
            );
        }
        catch (error) {
            assert.ok(error.toString().includes('Error: unknown signer:'));
            return;
        }

        assert.fail('Should have failed due to game.player != player.key');
    });

    it('Plays again and wins 1 pancho', async () => {
        // Player initial pancho balance (0)
        let initial_panchos = (await pancho_mint.getAccountInfo(player_token_account)).amount;

        // Final play
        await program.rpc.playGame(
            reserveAuthority_bump,
            {
                accounts: {
                    player: player.publicKey,
                    playerTokenAccount: player_token_account,
                    reserveTokenAccount: reserveTokenAccount,
                    reserveAuthority: reserveAuthority,
                    game: game,
                    tokenProgram: spltoken.TOKEN_PROGRAM_ID,
                },
                signers: [player],
            }
        );

        // Now has 1 (more) pancho!
        let final_panchos = (await pancho_mint.getAccountInfo(player_token_account)).amount;
        assert.equal(initial_panchos.toNumber() + 1, final_panchos.toNumber());

        // Counter in Game is now 10
        let game_struct = await program.account.game.fetch(game);
        assert.equal(game_struct.currentAmount, 10);
    });

    it('Fails if you try to play again after winning', async () => {
        try {
            await program.rpc.playGame(
                reserveAuthority_bump,
                {
                    accounts: {
                        player: player.publicKey,
                        playerTokenAccount: player_token_account,
                        reserveTokenAccount: reserveTokenAccount,
                        reserveAuthority: reserveAuthority,
                        game: game,
                        tokenProgram: spltoken.TOKEN_PROGRAM_ID,
                    },
                    signers: [player],
                }
            );
        }
        catch (error) {
            assert.equal(error.msg, 'The game has already finished!');
            return;
        }

        assert.fail('Should have returned GameOver error');
    });

    it('Doesn\'t let you start a game again if you already did it', async () => {
        // Account already exists
        let game_info = await program.provider.connection.getAccountInfo(game);
        assert.notEqual(game_info, null);

        // Create game instruction (fails)
        try {
            await program.rpc.createGame({
                accounts: {
                    player: player.publicKey,
                    game: game,
                    systemProgram: anchor.web3.SystemProgram.programId,
                },
                signers: [player],
            });
        }
        catch (error) {
            assert.ok(error.logs.join("").includes('already in use'));
            return;
        }

        assert.fail('Should have failed due to init attempt of an already existing account');
    });
});
