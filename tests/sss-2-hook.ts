import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createMint,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";

describe("sss-1 hook module", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  async function ensureFunded(minSol = 0.05) {
    const bal = await provider.connection.getBalance(provider.wallet.publicKey);
    const minLamports = minSol * anchor.web3.LAMPORTS_PER_SOL;
    if (bal < minLamports) {
      const sig = await provider.connection.requestAirdrop(provider.wallet.publicKey, minLamports - bal + anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
    }
  }

  async function fundKeypair(keypair: Keypair, minSol = 2) {
    const minLamports = minSol * anchor.web3.LAMPORTS_PER_SOL;
    const current = await provider.connection.getBalance(keypair.publicKey);
    if (current >= minLamports) {
      return;
    }
    const sig = await provider.connection.requestAirdrop(
      keypair.publicKey,
      minLamports - current
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  const program = anchor.workspace.Sss1 as Program;
  const authority = provider.wallet.publicKey;
  let mint: PublicKey;

  let hookConfigPda: PublicKey;
  let delegatedAuthority: Keypair | null = null;

  function findHookConfig(mintPk: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("hook_config"), mintPk.toBuffer()],
      program.programId
    );
  }

  function findBlacklist(hookConfig: PublicKey, address: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("blacklist"), hookConfig.toBuffer(), address.toBuffer()],
      program.programId
    );
  }

  function findExtraAccountMetaList(mintPk: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), mintPk.toBuffer()],
      program.programId
    );
  }

  async function createAta(owner: PublicKey, mintPk: PublicKey = mint): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(
      mintPk,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const ix = createAssociatedTokenAccountInstruction(
      provider.wallet.publicKey,
      ata,
      owner,
      mintPk,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix), []);
    return ata;
  }

  async function expectFailure(action: () => Promise<unknown>, label: string): Promise<void> {
    try {
      await action();
      assert.fail(`${label} should fail`);
    } catch {
      assert.ok(true);
    }
  }

  before(async () => {
    await ensureFunded();
    const payer = (provider.wallet as any).payer as Keypair;
    mint = await createMint(
      provider.connection,
      payer,
      authority,
      authority,
      6,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    [hookConfigPda] = findHookConfig(mint);

    await program.methods
      .initializeHookModule()
      .accounts({
        authority,
        hookConfig: hookConfigPda,
        mint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("initializes hook config with compliance mode enabled", async () => {
    const config = await (program.account as any).hookConfig.fetch(hookConfigPda);
    assert.ok(config.authority.equals(authority));
    assert.ok(config.mint.equals(mint));
    assert.equal(config.complianceEnabled, true);
  });

  it("toggles compliance mode", async () => {
    await program.methods
      .setComplianceMode(false)
      .accounts({
        authority,
        hookConfig: hookConfigPda,
      })
      .rpc();

    let config = await (program.account as any).hookConfig.fetch(hookConfigPda);
    assert.equal(config.complianceEnabled, false);

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority,
        hookConfig: hookConfigPda,
      })
      .rpc();

    config = await (program.account as any).hookConfig.fetch(hookConfigPda);
    assert.equal(config.complianceEnabled, true);
  });

  it("transfers hook authority", async () => {
    const newAuthority = Keypair.generate();
    await fundKeypair(newAuthority);

    await program.methods
      .transferHookAuthority()
      .accounts({
        authority,
        hookConfig: hookConfigPda,
        newAuthority: newAuthority.publicKey,
      })
      .rpc();

    let config = await (program.account as any).hookConfig.fetch(hookConfigPda);
    assert.ok(config.authority.equals(newAuthority.publicKey));

    await program.methods
      .setComplianceMode(false)
      .accounts({
        authority: newAuthority.publicKey,
        hookConfig: hookConfigPda,
      })
      .signers([newAuthority])
      .rpc();

    config = await (program.account as any).hookConfig.fetch(hookConfigPda);
    assert.equal(config.complianceEnabled, false);

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority: newAuthority.publicKey,
        hookConfig: hookConfigPda,
      })
      .signers([newAuthority])
      .rpc();

    delegatedAuthority = newAuthority;
  });

  it("rejects invalid transfer_hook_authority targets (default or unchanged)", async () => {
    if (!delegatedAuthority) {
      assert.fail("delegated authority not initialized");
    }

    const activeAuthority = delegatedAuthority.publicKey;
    const signers = [delegatedAuthority];
    const defaultPubkey = new PublicKey("11111111111111111111111111111111");

    await expectFailure(
      async () =>
        program.methods
          .transferHookAuthority()
          .accounts({
            authority: activeAuthority,
            hookConfig: hookConfigPda,
            newAuthority: defaultPubkey,
          })
          .signers(signers)
          .rpc(),
      "transfer hook authority default pubkey"
    );

    await expectFailure(
      async () =>
        program.methods
          .transferHookAuthority()
          .accounts({
            authority: activeAuthority,
            hookConfig: hookConfigPda,
            newAuthority: activeAuthority,
          })
          .signers(signers)
          .rpc(),
      "transfer hook authority unchanged"
    );

    const config = await (program.account as any).hookConfig.fetch(hookConfigPda);
    assert.ok(config.authority.equals(activeAuthority));
  });

  it("supports chained hook authority transfer and keeps compliance control with active authority only", async () => {
    if (!delegatedAuthority) {
      assert.fail("delegated authority not initialized");
    }

    const secondAuthority = delegatedAuthority;
    const thirdAuthority = Keypair.generate();
    await fundKeypair(thirdAuthority);

    await program.methods
      .transferHookAuthority()
      .accounts({
        authority: secondAuthority.publicKey,
        hookConfig: hookConfigPda,
        newAuthority: thirdAuthority.publicKey,
      })
      .signers([secondAuthority])
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .setComplianceMode(false)
          .accounts({
            authority: secondAuthority.publicKey,
            hookConfig: hookConfigPda,
          })
          .signers([secondAuthority])
          .rpc(),
      "second authority compliance toggle after chained transfer"
    );

    await program.methods
      .setComplianceMode(false)
      .accounts({
        authority: thirdAuthority.publicKey,
        hookConfig: hookConfigPda,
      })
      .signers([thirdAuthority])
      .rpc();

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority: thirdAuthority.publicKey,
        hookConfig: hookConfigPda,
      })
      .signers([thirdAuthority])
      .rpc();

    delegatedAuthority = thirdAuthority;

    const config = await (program.account as any).hookConfig.fetch(hookConfigPda);
    assert.ok(config.authority.equals(thirdAuthority.publicKey));
    assert.equal(config.complianceEnabled, true);
  });

  it("allows only final authority in chained transfer to mutate blacklist", async () => {
    if (!delegatedAuthority) {
      assert.fail("delegated authority not initialized");
    }

    const secondAuthority = delegatedAuthority;
    const thirdAuthority = Keypair.generate();
    await fundKeypair(thirdAuthority);

    await program.methods
      .transferHookAuthority()
      .accounts({
        authority: secondAuthority.publicKey,
        hookConfig: hookConfigPda,
        newAuthority: thirdAuthority.publicKey,
      })
      .signers([secondAuthority])
      .rpc();

    const chainedBlocked = Keypair.generate().publicKey;
    const [blacklistPda] = findBlacklist(hookConfigPda, chainedBlocked);

    await expectFailure(
      async () =>
        program.methods
          .addToBlacklist()
          .accounts({
            authority: secondAuthority.publicKey,
            hookConfig: hookConfigPda,
            blacklist: blacklistPda,
            address: chainedBlocked,
            systemProgram: SystemProgram.programId,
          })
          .signers([secondAuthority])
          .rpc(),
      "second authority add to blacklist after chained transfer"
    );

    await program.methods
      .addToBlacklist()
      .accounts({
        authority: thirdAuthority.publicKey,
        hookConfig: hookConfigPda,
        blacklist: blacklistPda,
        address: chainedBlocked,
        systemProgram: SystemProgram.programId,
      })
      .signers([thirdAuthority])
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .removeFromBlacklist()
          .accounts({
            authority: secondAuthority.publicKey,
            hookConfig: hookConfigPda,
            address: chainedBlocked,
            blacklist: blacklistPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([secondAuthority])
          .rpc(),
      "second authority remove from blacklist after chained transfer"
    );

    await program.methods
      .removeFromBlacklist()
      .accounts({
        authority: thirdAuthority.publicKey,
        hookConfig: hookConfigPda,
        address: chainedBlocked,
        blacklist: blacklistPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([thirdAuthority])
      .rpc();

    delegatedAuthority = thirdAuthority;
  });

  it("adds and removes address from blacklist", async () => {
    const activeAuthority = delegatedAuthority?.publicKey ?? authority;
    const signers = delegatedAuthority ? [delegatedAuthority] : [];

    const blacklistedAddress = Keypair.generate().publicKey;
    const [blacklistPda] = findBlacklist(hookConfigPda, blacklistedAddress);

    await program.methods
      .addToBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        blacklist: blacklistPda,
        address: blacklistedAddress,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    const entry = await (program.account as any).blacklist.fetch(blacklistPda);
    assert.ok(entry.address.equals(blacklistedAddress));

    await program.methods
      .removeFromBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        address: blacklistedAddress,
        blacklist: blacklistPda,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    try {
      await (program.account as any).blacklist.fetch(blacklistPda);
      assert.fail("Should have been removed");
    } catch (e: any) {
      assert.include(e.toString(), "Account does not exist");
    }
  });

  it("blocks previous authority after transfer", async () => {
    if (!delegatedAuthority) {
      assert.fail("delegated authority not initialized");
    }

    await expectFailure(
      async () =>
        program.methods
          .setComplianceMode(false)
          .accounts({
            authority,
            hookConfig: hookConfigPda,
          })
          .rpc(),
      "old authority compliance update"
    );
  });

  it("rejects non-authority compliance and rotation attempts", async () => {
    const attacker = Keypair.generate();
    await fundKeypair(attacker);

    await expectFailure(
      async () =>
        program.methods
          .setComplianceMode(false)
          .accounts({
            authority: attacker.publicKey,
            hookConfig: hookConfigPda,
          })
          .signers([attacker])
          .rpc(),
      "non-authority compliance update"
    );

    await expectFailure(
      async () =>
        program.methods
          .transferHookAuthority()
          .accounts({
            authority: attacker.publicKey,
            hookConfig: hookConfigPda,
            newAuthority: Keypair.generate().publicKey,
          })
          .signers([attacker])
          .rpc(),
      "non-authority transfer hook authority"
    );
  });

  it("blocks previous authority from transferring hook authority again", async () => {
    if (!delegatedAuthority) {
      assert.fail("delegated authority not initialized");
    }

    await expectFailure(
      async () =>
        program.methods
          .transferHookAuthority()
          .accounts({
            authority,
            hookConfig: hookConfigPda,
            newAuthority: Keypair.generate().publicKey,
          })
          .rpc(),
      "old authority transfer hook authority"
    );
  });

  it("blocks previous authority from blacklist mutations after transfer", async () => {
    if (!delegatedAuthority) {
      assert.fail("delegated authority not initialized");
    }

    const activeAuthority = delegatedAuthority.publicKey;
    const signers = [delegatedAuthority];
    const oldAuthorityBlocked = Keypair.generate().publicKey;
    const [blacklistPda] = findBlacklist(hookConfigPda, oldAuthorityBlocked);

    await program.methods
      .addToBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        blacklist: blacklistPda,
        address: oldAuthorityBlocked,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .addToBlacklist()
          .accounts({
            authority,
            hookConfig: hookConfigPda,
            blacklist: blacklistPda,
            address: oldAuthorityBlocked,
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
      "old authority add to blacklist"
    );

    await expectFailure(
      async () =>
        program.methods
          .removeFromBlacklist()
          .accounts({
            authority,
            hookConfig: hookConfigPda,
            address: oldAuthorityBlocked,
            blacklist: blacklistPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
      "old authority remove from blacklist"
    );

    await program.methods
      .removeFromBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        address: oldAuthorityBlocked,
        blacklist: blacklistPda,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();
  });

  it("rejects non-authority blacklist mutations", async () => {
    const activeAuthority = delegatedAuthority?.publicKey ?? authority;
    const activeSigners = delegatedAuthority ? [delegatedAuthority] : [];
    const attacker = Keypair.generate();
    await fundKeypair(attacker);

    const targetAddress = Keypair.generate().publicKey;
    const [blacklistPda] = findBlacklist(hookConfigPda, targetAddress);

    await expectFailure(
      async () =>
        program.methods
          .addToBlacklist()
          .accounts({
            authority: attacker.publicKey,
            hookConfig: hookConfigPda,
            blacklist: blacklistPda,
            address: targetAddress,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc(),
      "non-authority add to blacklist"
    );

    await program.methods
      .addToBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        blacklist: blacklistPda,
        address: targetAddress,
        systemProgram: SystemProgram.programId,
      })
      .signers(activeSigners)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .removeFromBlacklist()
          .accounts({
            authority: attacker.publicKey,
            hookConfig: hookConfigPda,
            address: targetAddress,
            blacklist: blacklistPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc(),
      "non-authority remove from blacklist"
    );

    await program.methods
      .removeFromBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        address: targetAddress,
        blacklist: blacklistPda,
        systemProgram: SystemProgram.programId,
      })
      .signers(activeSigners)
      .rpc();
  });

  it("blocks previous authority from initializing extra account meta list after rotation", async () => {
    const [extraAccountMetaList] = findExtraAccountMetaList(mint);

    await expectFailure(
      async () =>
        program.methods
          .initializeExtraAccountMetaList()
          .accounts({
            authority,
            extraAccountMetaList,
            mint,
            hookConfig: hookConfigPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
      "old authority initialize extra account meta list"
    );
  });

  it("rejects non-authority initialize extra account meta list attempts", async () => {
    const attacker = Keypair.generate();
    await fundKeypair(attacker);
    const [extraAccountMetaList] = findExtraAccountMetaList(mint);

    await expectFailure(
      async () =>
        program.methods
          .initializeExtraAccountMetaList()
          .accounts({
            authority: attacker.publicKey,
            extraAccountMetaList,
            mint,
            hookConfig: hookConfigPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc(),
      "non-authority initialize extra account meta list"
    );
  });

  it("initializes extra account meta list using active authority", async () => {
    const activeAuthority = delegatedAuthority?.publicKey ?? authority;
    const signers = delegatedAuthority ? [delegatedAuthority] : [];
    const [extraAccountMetaList] = findExtraAccountMetaList(mint);

    await program.methods
      .initializeExtraAccountMetaList()
      .accounts({
        authority: activeAuthority,
        extraAccountMetaList,
        mint,
        hookConfig: hookConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    const accountInfo = await provider.connection.getAccountInfo(extraAccountMetaList);
    assert.isNotNull(accountInfo);
    assert.ok(accountInfo!.owner.equals(program.programId));
  });

  it("keeps compliance enforcement under rotated hook authority", async () => {
    if (!delegatedAuthority) {
      assert.fail("delegated authority not initialized");
    }

    const activeAuthority = delegatedAuthority.publicKey;
    const signers = [delegatedAuthority];
    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaList(mint);
    const [sourceBlacklistPda] = findBlacklist(hookConfigPda, sourceOwner.publicKey);
    const [destinationBlacklistPda] = findBlacklist(hookConfigPda, destinationOwner.publicKey);

    await program.methods
      .addToBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        blacklist: sourceBlacklistPda,
        address: sourceOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .setComplianceMode(false)
          .accounts({
            authority,
            hookConfig: hookConfigPda,
          })
          .rpc(),
      "old authority compliance disable after rotation"
    );

    await expectFailure(
      async () =>
        program.methods
          .transferHook(new anchor.BN(1))
          .accounts({
            source: sourceAta,
            mint,
            destination: destinationAta,
            owner: sourceOwner.publicKey,
            extraAccountMetaList,
            hookConfig: hookConfigPda,
            sourceBlacklist: sourceBlacklistPda,
            destinationBlacklist: destinationBlacklistPda,
          })
          .rpc(),
      "transfer hook compliance enforcement with rotated authority"
    );
  });

  it("allows only rotated authority to control compliance gating state", async () => {
    if (!delegatedAuthority) {
      assert.fail("delegated authority not initialized");
    }

    const activeAuthority = delegatedAuthority.publicKey;
    const signers = [delegatedAuthority];
    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaList(mint);
    const [sourceBlacklistPda] = findBlacklist(hookConfigPda, sourceOwner.publicKey);
    const [destinationBlacklistPda] = findBlacklist(hookConfigPda, destinationOwner.publicKey);

    await program.methods
      .addToBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        blacklist: sourceBlacklistPda,
        address: sourceOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    await program.methods
      .setComplianceMode(false)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .setComplianceMode(true)
          .accounts({
            authority,
            hookConfig: hookConfigPda,
          })
          .rpc(),
      "old authority cannot re-enable compliance mode"
    );

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .transferHook(new anchor.BN(1))
          .accounts({
            source: sourceAta,
            mint,
            destination: destinationAta,
            owner: sourceOwner.publicKey,
            extraAccountMetaList,
            hookConfig: hookConfigPda,
            sourceBlacklist: sourceBlacklistPda,
            destinationBlacklist: destinationBlacklistPda,
          })
          .rpc(),
      "transfer hook blocked after rotated authority re-enables compliance mode"
    );

    await program.methods
      .setComplianceMode(false)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await program.methods
      .transferHook(new anchor.BN(1))
      .accounts({
        source: sourceAta,
        mint,
        destination: destinationAta,
        owner: sourceOwner.publicKey,
        extraAccountMetaList,
        hookConfig: hookConfigPda,
        sourceBlacklist: sourceBlacklistPda,
        destinationBlacklist: destinationBlacklistPda,
      })
      .rpc();
  });

  it("enforces compliance gating in transfer_hook and bypasses when disabled", async () => {
    const activeAuthority = delegatedAuthority?.publicKey ?? authority;
    const signers = delegatedAuthority ? [delegatedAuthority] : [];

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);

    const [extraAccountMetaList] = findExtraAccountMetaList(mint);
    const [sourceBlacklistPda] = findBlacklist(hookConfigPda, sourceOwner.publicKey);
    const [destinationBlacklistPda] = findBlacklist(hookConfigPda, destinationOwner.publicKey);

    await program.methods
      .addToBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        blacklist: sourceBlacklistPda,
        address: sourceOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .transferHook(new anchor.BN(1))
          .accounts({
            source: sourceAta,
            mint,
            destination: destinationAta,
            owner: sourceOwner.publicKey,
            extraAccountMetaList,
            hookConfig: hookConfigPda,
            sourceBlacklist: sourceBlacklistPda,
            destinationBlacklist: destinationBlacklistPda,
          })
          .rpc(),
      "transfer hook while compliance enabled and blacklisted"
    );

    await program.methods
      .setComplianceMode(false)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await program.methods
      .transferHook(new anchor.BN(1))
      .accounts({
        source: sourceAta,
        mint,
        destination: destinationAta,
        owner: sourceOwner.publicKey,
        extraAccountMetaList,
        hookConfig: hookConfigPda,
        sourceBlacklist: sourceBlacklistPda,
        destinationBlacklist: destinationBlacklistPda,
      })
      .rpc();

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .transferHook(new anchor.BN(1))
          .accounts({
            source: sourceAta,
            mint,
            destination: destinationAta,
            owner: sourceOwner.publicKey,
            extraAccountMetaList,
            hookConfig: hookConfigPda,
            sourceBlacklist: sourceBlacklistPda,
            destinationBlacklist: destinationBlacklistPda,
          })
          .rpc(),
      "transfer hook while compliance re-enabled and blacklisted"
    );
  });

  it("uses source wallet owner for compliance checks instead of delegate", async () => {
    const activeAuthority = delegatedAuthority?.publicKey ?? authority;
    const signers = delegatedAuthority ? [delegatedAuthority] : [];

    const sourceOwner = Keypair.generate();
    const delegate = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaList(mint);
    const [sourceBlacklistPda] = findBlacklist(hookConfigPda, sourceOwner.publicKey);
    const [destinationBlacklistPda] = findBlacklist(hookConfigPda, destinationOwner.publicKey);
    const [delegateBlacklistPda] = findBlacklist(hookConfigPda, delegate.publicKey);

    await program.methods
      .addToBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        blacklist: delegateBlacklistPda,
        address: delegate.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await program.methods
      .transferHook(new anchor.BN(1))
      .accounts({
        source: sourceAta,
        mint,
        destination: destinationAta,
        owner: delegate.publicKey,
        extraAccountMetaList,
        hookConfig: hookConfigPda,
        sourceBlacklist: sourceBlacklistPda,
        destinationBlacklist: destinationBlacklistPda,
      })
      .rpc();

    await program.methods
      .addToBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        blacklist: sourceBlacklistPda,
        address: sourceOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .transferHook(new anchor.BN(1))
          .accounts({
            source: sourceAta,
            mint,
            destination: destinationAta,
            owner: delegate.publicKey,
            extraAccountMetaList,
            hookConfig: hookConfigPda,
            sourceBlacklist: sourceBlacklistPda,
            destinationBlacklist: destinationBlacklistPda,
          })
          .rpc(),
      "transfer hook while source wallet owner blacklisted and delegate provided"
    );
  });

  it("rejects transfer_hook calls with mismatched blacklist PDAs", async () => {
    const activeAuthority = delegatedAuthority?.publicKey ?? authority;
    const signers = delegatedAuthority ? [delegatedAuthority] : [];

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaList(mint);

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .transferHook(new anchor.BN(1))
          .accounts({
            source: sourceAta,
            mint,
            destination: destinationAta,
            owner: sourceOwner.publicKey,
            extraAccountMetaList,
            hookConfig: hookConfigPda,
            sourceBlacklist: Keypair.generate().publicKey,
            destinationBlacklist: Keypair.generate().publicKey,
          })
          .rpc(),
      "transfer hook with mismatched blacklist PDAs"
    );
  });

  it("bypasses blacklist PDA validation when compliance mode is disabled", async () => {
    const activeAuthority = delegatedAuthority?.publicKey ?? authority;
    const signers = delegatedAuthority ? [delegatedAuthority] : [];

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaList(mint);

    await program.methods
      .setComplianceMode(false)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await program.methods
      .transferHook(new anchor.BN(1))
      .accounts({
        source: sourceAta,
        mint,
        destination: destinationAta,
        owner: sourceOwner.publicKey,
        extraAccountMetaList,
        hookConfig: hookConfigPda,
        sourceBlacklist: Keypair.generate().publicKey,
        destinationBlacklist: Keypair.generate().publicKey,
      })
      .rpc();
  });

  it("blocks transfers when destination owner is blacklisted", async () => {
    const activeAuthority = delegatedAuthority?.publicKey ?? authority;
    const signers = delegatedAuthority ? [delegatedAuthority] : [];

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);

    const [extraAccountMetaList] = findExtraAccountMetaList(mint);
    const [sourceBlacklistPda] = findBlacklist(hookConfigPda, sourceOwner.publicKey);
    const [destinationBlacklistPda] = findBlacklist(hookConfigPda, destinationOwner.publicKey);

    await program.methods
      .addToBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        blacklist: destinationBlacklistPda,
        address: destinationOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .transferHook(new anchor.BN(1))
          .accounts({
            source: sourceAta,
            mint,
            destination: destinationAta,
            owner: sourceOwner.publicKey,
            extraAccountMetaList,
            hookConfig: hookConfigPda,
            sourceBlacklist: sourceBlacklistPda,
            destinationBlacklist: destinationBlacklistPda,
          })
          .rpc(),
      "transfer hook while destination owner blacklisted"
    );
  });

  it("allows transfer_hook again after blacklist removal with compliance still enabled", async () => {
    const activeAuthority = delegatedAuthority?.publicKey ?? authority;
    const signers = delegatedAuthority ? [delegatedAuthority] : [];

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaList(mint);
    const [sourceBlacklistPda] = findBlacklist(hookConfigPda, sourceOwner.publicKey);
    const [destinationBlacklistPda] = findBlacklist(hookConfigPda, destinationOwner.publicKey);

    await program.methods
      .addToBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        blacklist: sourceBlacklistPda,
        address: sourceOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .transferHook(new anchor.BN(1))
          .accounts({
            source: sourceAta,
            mint,
            destination: destinationAta,
            owner: sourceOwner.publicKey,
            extraAccountMetaList,
            hookConfig: hookConfigPda,
            sourceBlacklist: sourceBlacklistPda,
            destinationBlacklist: destinationBlacklistPda,
          })
          .rpc(),
      "transfer hook while source owner remains blacklisted"
    );

    await program.methods
      .removeFromBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        address: sourceOwner.publicKey,
        blacklist: sourceBlacklistPda,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    await program.methods
      .transferHook(new anchor.BN(1))
      .accounts({
        source: sourceAta,
        mint,
        destination: destinationAta,
        owner: sourceOwner.publicKey,
        extraAccountMetaList,
        hookConfig: hookConfigPda,
        sourceBlacklist: sourceBlacklistPda,
        destinationBlacklist: destinationBlacklistPda,
      })
      .rpc();
  });

  it("allows transfer_hook again after destination blacklist removal with compliance still enabled", async () => {
    const activeAuthority = delegatedAuthority?.publicKey ?? authority;
    const signers = delegatedAuthority ? [delegatedAuthority] : [];

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaList(mint);
    const [sourceBlacklistPda] = findBlacklist(hookConfigPda, sourceOwner.publicKey);
    const [destinationBlacklistPda] = findBlacklist(hookConfigPda, destinationOwner.publicKey);

    await program.methods
      .addToBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        blacklist: destinationBlacklistPda,
        address: destinationOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .transferHook(new anchor.BN(1))
          .accounts({
            source: sourceAta,
            mint,
            destination: destinationAta,
            owner: sourceOwner.publicKey,
            extraAccountMetaList,
            hookConfig: hookConfigPda,
            sourceBlacklist: sourceBlacklistPda,
            destinationBlacklist: destinationBlacklistPda,
          })
          .rpc(),
      "transfer hook while destination owner remains blacklisted"
    );

    await program.methods
      .removeFromBlacklist()
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
        address: destinationOwner.publicKey,
        blacklist: destinationBlacklistPda,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    await program.methods
      .transferHook(new anchor.BN(1))
      .accounts({
        source: sourceAta,
        mint,
        destination: destinationAta,
        owner: sourceOwner.publicKey,
        extraAccountMetaList,
        hookConfig: hookConfigPda,
        sourceBlacklist: sourceBlacklistPda,
        destinationBlacklist: destinationBlacklistPda,
      })
      .rpc();
  });

  it("rejects transfer_hook when source/destination token accounts use a different mint", async () => {
    const activeAuthority = delegatedAuthority?.publicKey ?? authority;
    const signers = delegatedAuthority ? [delegatedAuthority] : [];

    const payer = (provider.wallet as any).payer as Keypair;
    const otherMint = await createMint(
      provider.connection,
      payer,
      authority,
      authority,
      6,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey, otherMint);
    const destinationAta = await createAta(destinationOwner.publicKey, otherMint);

    const [extraAccountMetaList] = findExtraAccountMetaList(mint);
    const [sourceBlacklistPda] = findBlacklist(hookConfigPda, sourceOwner.publicKey);
    const [destinationBlacklistPda] = findBlacklist(hookConfigPda, destinationOwner.publicKey);

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .transferHook(new anchor.BN(1))
          .accounts({
            source: sourceAta,
            mint,
            destination: destinationAta,
            owner: sourceOwner.publicKey,
            extraAccountMetaList,
            hookConfig: hookConfigPda,
            sourceBlacklist: sourceBlacklistPda,
            destinationBlacklist: destinationBlacklistPda,
          })
          .rpc(),
      "transfer hook with token accounts from a different mint (compliance enabled)"
    );

    await program.methods
      .setComplianceMode(false)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .transferHook(new anchor.BN(1))
          .accounts({
            source: sourceAta,
            mint,
            destination: destinationAta,
            owner: sourceOwner.publicKey,
            extraAccountMetaList,
            hookConfig: hookConfigPda,
            sourceBlacklist: sourceBlacklistPda,
            destinationBlacklist: destinationBlacklistPda,
          })
          .rpc(),
      "transfer hook with token accounts from a different mint (compliance disabled)"
    );
  });

  it("rejects transfer_hook when source/destination are not Token-2022 token accounts", async () => {
    const activeAuthority = delegatedAuthority?.publicKey ?? authority;
    const signers = delegatedAuthority ? [delegatedAuthority] : [];

    const sourceSystemAccount = provider.wallet.publicKey;
    const destinationSystemAccount = Keypair.generate();
    await fundKeypair(destinationSystemAccount);

    const [extraAccountMetaList] = findExtraAccountMetaList(mint);
    const [sourceBlacklistPda] = findBlacklist(hookConfigPda, sourceSystemAccount);
    const [destinationBlacklistPda] = findBlacklist(hookConfigPda, destinationSystemAccount.publicKey);

    await program.methods
      .setComplianceMode(true)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .transferHook(new anchor.BN(1))
          .accounts({
            source: sourceSystemAccount,
            mint,
            destination: destinationSystemAccount.publicKey,
            owner: sourceSystemAccount,
            extraAccountMetaList,
            hookConfig: hookConfigPda,
            sourceBlacklist: sourceBlacklistPda,
            destinationBlacklist: destinationBlacklistPda,
          })
          .rpc(),
      "transfer hook with system-owned source/destination (compliance enabled)"
    );

    await program.methods
      .setComplianceMode(false)
      .accounts({
        authority: activeAuthority,
        hookConfig: hookConfigPda,
      })
      .signers(signers)
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .transferHook(new anchor.BN(1))
          .accounts({
            source: sourceSystemAccount,
            mint,
            destination: destinationSystemAccount.publicKey,
            owner: sourceSystemAccount,
            extraAccountMetaList,
            hookConfig: hookConfigPda,
            sourceBlacklist: sourceBlacklistPda,
            destinationBlacklist: destinationBlacklistPda,
          })
          .rpc(),
      "transfer hook with system-owned source/destination (compliance disabled)"
    );
  });
});
