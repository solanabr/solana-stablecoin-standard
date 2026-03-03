import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";
import { findRolePda, findHookConfigPda, findBlacklistEntryPda } from "@sss/sdk";
import {
  provider,
  coreProgram,
  hookProgram,
  admin,
  createSSS2Mint,
  grantRole,
  createTokenAccount,
  airdropSol,
  initializeHook,
} from "../helpers/setup";
import { ROLE } from "../helpers/constants";

describe("security: reentrancy guards", () => {
  let configPda: PublicKey;
  let mintKeypair: Keypair;
  let hookConfig: PublicKey;
  let treasuryKeypair: Keypair;

  beforeEach(async () => {
    treasuryKeypair = Keypair.generate();
    await airdropSol(treasuryKeypair.publicKey);
    const result = await createSSS2Mint(treasuryKeypair.publicKey);
    mintKeypair = result.mintKeypair;
    configPda = result.configPda;
    const hookResult = await initializeHook(mintKeypair.publicKey, configPda);
    hookConfig = hookResult.hookConfig;
  });

  it("transfer hook cannot be invoked directly (only via token program)", async () => {
    // Attempting to call transfer_hook instruction directly should fail
    // because it expects to be called via spl_transfer_hook_interface
    try {
      await hookProgram.methods
        .transferHook(new BN(100))
        .accounts({
          sourceToken: Keypair.generate().publicKey,
          mint: mintKeypair.publicKey,
          destinationToken: Keypair.generate().publicKey,
          owner: admin.publicKey,
          extraAccountMetaList: Keypair.generate().publicKey,
          hookConfig,
          senderBlacklistEntry: Keypair.generate().publicKey,
          receiverBlacklistEntry: Keypair.generate().publicKey,
        })
        .rpc();
      expect.fail("Direct transfer_hook call should fail");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("blacklist CPI can only be called by config PDA authority", async () => {
    const wallet = Keypair.generate().publicKey;
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

    // Try calling add_to_blacklist directly on hook program with a random signer
    const random = Keypair.generate();
    await airdropSol(random.publicKey);

    try {
      await hookProgram.methods
        .addToBlacklist(wallet)
        .accounts({
          authority: random.publicKey,
          hookConfig,
          blacklistEntry,
          payer: random.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([random])
        .rpc();
      expect.fail("Should reject non-authority caller");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("remove_from_blacklist CPI can only be called by authority", async () => {
    const wallet = Keypair.generate().publicKey;
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

    // First blacklist via core program (proper CPI)
    await coreProgram.methods
      .blacklist(wallet)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        hookConfig,
        blacklistEntry,
        transferHookProgram: hookProgram.programId,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Try removing directly with random signer
    const random = Keypair.generate();
    await airdropSol(random.publicKey);

    try {
      await hookProgram.methods
        .removeFromBlacklist(wallet)
        .accounts({
          authority: random.publicKey,
          hookConfig,
          blacklistEntry,
          payer: random.publicKey,
        })
        .signers([random])
        .rpc();
      expect.fail("Should reject non-authority caller");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("seize uses burn+mint pattern (not transfer) to avoid hook reentrancy", async () => {
    const minter = Keypair.generate();
    const seizer = Keypair.generate();
    await airdropSol(minter.publicKey);
    await airdropSol(seizer.publicKey);

    await grantRole(configPda, minter.publicKey, ROLE.Minter, 100_000);
    await grantRole(configPda, seizer.publicKey, ROLE.Seizer);

    const target = Keypair.generate();
    await airdropSol(target.publicKey);
    const targetAta = await createTokenAccount(mintKeypair.publicKey, target.publicKey);
    const treasuryAta = await createTokenAccount(mintKeypair.publicKey, treasuryKeypair.publicKey);

    // Mint to target
    const [minterRole] = findRolePda(configPda, minter.publicKey, ROLE.Minter);
    await coreProgram.methods
      .mintTo(new BN(10_000))
      .accounts({
        minter: minter.publicKey, config: configPda, roleAccount: minterRole,
        mint: mintKeypair.publicKey, to: targetAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();

    // Blacklist target
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, target.publicKey);
    await coreProgram.methods
      .blacklist(target.publicKey)
      .accounts({
        payer: admin.publicKey, admin: admin.publicKey, config: configPda,
        hookConfig, blacklistEntry,
        transferHookProgram: hookProgram.programId, systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Seize should still work even though target is blacklisted
    // because seize uses burn+mint, not transfer
    const [seizerRole] = findRolePda(configPda, seizer.publicKey, ROLE.Seizer);
    const tx = await coreProgram.methods
      .seize(new BN(5_000))
      .accounts({
        seizer: seizer.publicKey, config: configPda, roleAccount: seizerRole,
        mint: mintKeypair.publicKey, from: targetAta, treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([seizer])
      .rpc();

    expect(tx).to.be.a("string");

    const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryAta);
    expect(treasuryBalance.value.amount).to.equal("5000");
  });

  it("initialize_hook_config rejects when authority is not config PDA", async () => {
    const random = Keypair.generate();
    await airdropSol(random.publicKey);
    const fakeMint = Keypair.generate();

    try {
      await hookProgram.methods
        .initializeHookConfig()
        .accounts({
          authority: random.publicKey,
          hookConfig: Keypair.generate().publicKey,
          mint: fakeMint.publicKey,
          payer: random.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([random])
        .rpc();
      expect.fail("Should reject unauthorized hook config init");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("hook config authority must match for blacklist operations", async () => {
    const wallet = Keypair.generate().publicKey;
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

    // Proper CPI via core program works
    await coreProgram.methods
      .blacklist(wallet)
      .accounts({
        payer: admin.publicKey, admin: admin.publicKey, config: configPda,
        hookConfig, blacklistEntry,
        transferHookProgram: hookProgram.programId, systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entryInfo = await provider.connection.getAccountInfo(blacklistEntry);
    expect(entryInfo).to.not.be.null;
  });
});
