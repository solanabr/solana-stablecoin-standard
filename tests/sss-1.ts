import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  getMint,
  getPermanentDelegate,
  createMint,
} from "@solana/spl-token";
import { assert } from "chai";

describe("sss-1", () => {
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
  const admin = provider.wallet.publicKey;

  let mint: Keypair;
  let configPda: PublicKey;

  function findConfig(mintPk: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("config"), mintPk.toBuffer()], program.programId);
  }

  function findRole(config: PublicKey, authority: PublicKey, roleType: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("role"), config.toBuffer(), authority.toBuffer(), Buffer.from([roleType])],
      program.programId
    );
  }

  async function setupStablecoin() {
    mint = Keypair.generate();
    [configPda] = findConfig(mint.publicKey);

    await program.methods
      .initialize("", "", "", 6, true, true)
      .accounts({
        admin,
        config: configPda,
        mint: mint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();
  }

  async function createAta(owner: PublicKey, mintPk: PublicKey = mint.publicKey): Promise<PublicKey> {
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

    const tx = new anchor.web3.Transaction().add(ix);
    await provider.sendAndConfirm(tx, []);
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

  beforeEach(async () => {
    await ensureFunded();
    await setupStablecoin();
  });

  it("initializes a stablecoin", async () => {
    const config = await (program.account as any).stablecoinConfig.fetch(configPda);
    assert.ok(config.admin.equals(admin));
    assert.ok(config.mint.equals(mint.publicKey));
    assert.equal(config.decimals, 6);
    assert.equal(config.rolesEnabled, true);
    assert.equal(config.freezeEnabled, true);
    assert.equal(config.paused, false);
  });

  it("initializes Token-2022 mint with permanent delegate set to config PDA", async () => {
    const mintState = await getMint(provider.connection, mint.publicKey, undefined, TOKEN_2022_PROGRAM_ID);
    const permanentDelegate = getPermanentDelegate(mintState);
    assert.isNotNull(permanentDelegate);
    assert.ok(permanentDelegate!.delegate.equals(configPda));
  });

  it("supports pause/unpause gating for mint", async () => {
    const [minterRolePda] = findRole(configPda, admin, 1);
    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: admin,
        role: minterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const destinationAta = await createAta(admin);

    await program.methods
      .pause()
      .accounts({ admin, config: configPda })
      .rpc();

    try {
      await program.methods
        .mintTokens(new anchor.BN(1_000_000))
        .accounts({
          minter: admin,
          config: configPda,
          role: minterRolePda,
          mint: mint.publicKey,
          destination: destinationAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      assert.fail("mint while paused should fail");
    } catch {
      assert.ok(true);
    }

    await program.methods
      .unpause()
      .accounts({ admin, config: configPda })
      .rpc();

    await program.methods
      .mintTokens(new anchor.BN(1_000_000))
      .accounts({
        minter: admin,
        config: configPda,
        role: minterRolePda,
        mint: mint.publicKey,
        destination: destinationAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const account = await getAccount(provider.connection, destinationAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(account.amount), 1_000_000);
  });

  it("rejects non-admin pause/unpause attempts", async () => {
    const attacker = Keypair.generate();
    await fundKeypair(attacker);

    await expectFailure(
      async () =>
        program.methods
          .pause()
          .accounts({
            admin: attacker.publicKey,
            config: configPda,
          })
          .signers([attacker])
          .rpc(),
      "non-admin pause"
    );

    await program.methods
      .pause()
      .accounts({
        admin,
        config: configPda,
      })
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .unpause()
          .accounts({
            admin: attacker.publicKey,
            config: configPda,
          })
          .signers([attacker])
          .rpc(),
      "non-admin unpause"
    );

    await program.methods
      .unpause()
      .accounts({
        admin,
        config: configPda,
      })
      .rpc();
  });

  it("supports minter rotation path", async () => {
    const oldMinter = Keypair.generate();
    const newMinter = Keypair.generate();
    const destinationAta = await createAta(admin);

    const [oldMinterRolePda] = findRole(configPda, oldMinter.publicKey, 1);
    const [newMinterRolePda] = findRole(configPda, newMinter.publicKey, 1);

    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: oldMinter.publicKey,
        role: oldMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .mintTokens(new anchor.BN(100_000))
      .accounts({
        minter: oldMinter.publicKey,
        config: configPda,
        role: oldMinterRolePda,
        mint: mint.publicKey,
        destination: destinationAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([oldMinter])
      .rpc();

    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: newMinter.publicKey,
        role: newMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .revokeRole()
      .accounts({
        admin,
        config: configPda,
        authority: oldMinter.publicKey,
        role: oldMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .mintTokens(new anchor.BN(100_000))
          .accounts({
            minter: oldMinter.publicKey,
            config: configPda,
            role: oldMinterRolePda,
            mint: mint.publicKey,
            destination: destinationAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([oldMinter])
          .rpc(),
      "old minter mint"
    );

    await program.methods
      .mintTokens(new anchor.BN(200_000))
      .accounts({
        minter: newMinter.publicKey,
        config: configPda,
        role: newMinterRolePda,
        mint: mint.publicKey,
        destination: destinationAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([newMinter])
      .rpc();

    const account = await getAccount(provider.connection, destinationAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(account.amount), 300_000);
  });

  it("rejects non-admin minter rotation attempts", async () => {
    const oldMinter = Keypair.generate();
    const newMinter = Keypair.generate();
    const attacker = Keypair.generate();
    await fundKeypair(attacker);

    const [oldMinterRolePda] = findRole(configPda, oldMinter.publicKey, 1);
    const [newMinterRolePda] = findRole(configPda, newMinter.publicKey, 1);

    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: oldMinter.publicKey,
        role: oldMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .grantRole(1)
          .accounts({
            admin: attacker.publicKey,
            config: configPda,
            authority: newMinter.publicKey,
            role: newMinterRolePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc(),
      "non-admin grant new minter"
    );

    await expectFailure(
      async () =>
        program.methods
          .revokeRole()
          .accounts({
            admin: attacker.publicKey,
            config: configPda,
            authority: oldMinter.publicKey,
            role: oldMinterRolePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc(),
      "non-admin revoke old minter"
    );
  });

  it("supports minter rotation while paused and restores new-minter minting after unpause", async () => {
    const oldMinter = Keypair.generate();
    const newMinter = Keypair.generate();
    const destinationAta = await createAta(admin);

    const [oldMinterRolePda] = findRole(configPda, oldMinter.publicKey, 1);
    const [newMinterRolePda] = findRole(configPda, newMinter.publicKey, 1);

    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: oldMinter.publicKey,
        role: oldMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .pause()
      .accounts({
        admin,
        config: configPda,
      })
      .rpc();

    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: newMinter.publicKey,
        role: newMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .revokeRole()
      .accounts({
        admin,
        config: configPda,
        authority: oldMinter.publicKey,
        role: oldMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .unpause()
      .accounts({
        admin,
        config: configPda,
      })
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .mintTokens(new anchor.BN(50_000))
          .accounts({
            minter: oldMinter.publicKey,
            config: configPda,
            role: oldMinterRolePda,
            mint: mint.publicKey,
            destination: destinationAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([oldMinter])
          .rpc(),
      "old minter mint after paused rotation"
    );

    await program.methods
      .mintTokens(new anchor.BN(125_000))
      .accounts({
        minter: newMinter.publicKey,
        config: configPda,
        role: newMinterRolePda,
        mint: mint.publicKey,
        destination: destinationAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([newMinter])
      .rpc();

    const account = await getAccount(provider.connection, destinationAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(account.amount), 125_000);
  });

  it("enforces pause gating for burn/freeze/update", async () => {
    const [minterRolePda] = findRole(configPda, admin, 1);
    const [burnerRolePda] = findRole(configPda, admin, 2);
    const [freezerRolePda] = findRole(configPda, admin, 3);

    for (const roleType of [1, 2, 3]) {
      const [rolePda] = findRole(configPda, admin, roleType);
      await program.methods
        .grantRole(roleType)
        .accounts({
          admin,
          config: configPda,
          authority: admin,
          role: rolePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const tokenAta = await createAta(admin);
    await program.methods
      .mintTokens(new anchor.BN(500_000))
      .accounts({
        minter: admin,
        config: configPda,
        role: minterRolePda,
        mint: mint.publicKey,
        destination: tokenAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    await program.methods
      .pause()
      .accounts({ admin, config: configPda })
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .burnTokens(new anchor.BN(100_000))
          .accounts({
            burner: admin,
            config: configPda,
            role: burnerRolePda,
            mint: mint.publicKey,
            source: tokenAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
      "burn while paused"
    );

    await expectFailure(
      async () =>
        program.methods
          .freezeAccount()
          .accounts({
            freezer: admin,
            config: configPda,
            role: freezerRolePda,
            mint: mint.publicKey,
            tokenAccount: tokenAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
      "freeze while paused"
    );

    await expectFailure(
      async () =>
        program.methods
          .unfreezeAccount()
          .accounts({
            freezer: admin,
            config: configPda,
            role: freezerRolePda,
            mint: mint.publicKey,
            tokenAccount: tokenAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
      "unfreeze while paused"
    );

    await expectFailure(
      async () =>
        program.methods
          .updateMetadata("name", "Paused Update")
          .accounts({
            admin,
            config: configPda,
            mint: mint.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
      "metadata update while paused"
    );
  });

  it("transfers admin authority", async () => {
    const newAdmin = Keypair.generate();
    await fundKeypair(newAdmin);

    await program.methods
      .transferAdmin()
      .accounts({
        admin,
        config: configPda,
        newAdmin: newAdmin.publicKey,
      })
      .rpc();

    const config = await (program.account as any).stablecoinConfig.fetch(configPda);
    assert.ok(config.admin.equals(newAdmin.publicKey));

    const roleTarget = Keypair.generate().publicKey;
    const [rolePda] = findRole(configPda, roleTarget, 1);

    await program.methods
      .grantRole(1)
      .accounts({
        admin: newAdmin.publicKey,
        config: configPda,
        authority: roleTarget,
        role: rolePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([newAdmin])
      .rpc();

    const role = await (program.account as any).role.fetch(rolePda);
    assert.ok(role.grantedBy.equals(newAdmin.publicKey));

    const oldAdminRoleTarget = Keypair.generate().publicKey;
    const [oldAdminRolePda] = findRole(configPda, oldAdminRoleTarget, 1);
    await expectFailure(
      async () =>
        program.methods
          .grantRole(1)
          .accounts({
            admin,
            config: configPda,
            authority: oldAdminRoleTarget,
            role: oldAdminRolePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
      "old admin grant role after transfer"
    );

    await expectFailure(
      async () =>
        program.methods
          .revokeRole()
          .accounts({
            admin,
            config: configPda,
            authority: roleTarget,
            role: rolePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
      "old admin revoke role after transfer"
    );

    await expectFailure(
      async () =>
        program.methods
          .pause()
          .accounts({
            admin,
            config: configPda,
          })
          .rpc(),
      "old admin pause after transfer"
    );

    await program.methods
      .pause()
      .accounts({
        admin: newAdmin.publicKey,
        config: configPda,
      })
      .signers([newAdmin])
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .unpause()
          .accounts({
            admin,
            config: configPda,
          })
          .rpc(),
      "old admin unpause after transfer"
    );

    await program.methods
      .unpause()
      .accounts({
        admin: newAdmin.publicKey,
        config: configPda,
      })
      .signers([newAdmin])
      .rpc();
  });

  it("rejects non-admin transfer_admin attempts", async () => {
    const attacker = Keypair.generate();
    const proposedAdmin = Keypair.generate();
    await fundKeypair(attacker);

    await expectFailure(
      async () =>
        program.methods
          .transferAdmin()
          .accounts({
            admin: attacker.publicKey,
            config: configPda,
            newAdmin: proposedAdmin.publicKey,
          })
          .signers([attacker])
          .rpc(),
      "non-admin transfer admin"
    );

    const config = await (program.account as any).stablecoinConfig.fetch(configPda);
    assert.ok(config.admin.equals(admin));
  });

  it("rejects invalid transfer_admin targets (default or unchanged)", async () => {
    const defaultPubkey = new PublicKey("11111111111111111111111111111111");

    await expectFailure(
      async () =>
        program.methods
          .transferAdmin()
          .accounts({
            admin,
            config: configPda,
            newAdmin: defaultPubkey,
          })
          .rpc(),
      "transfer admin default pubkey"
    );

    await expectFailure(
      async () =>
        program.methods
          .transferAdmin()
          .accounts({
            admin,
            config: configPda,
            newAdmin: admin,
          })
          .rpc(),
      "transfer admin unchanged authority"
    );

    const config = await (program.account as any).stablecoinConfig.fetch(configPda);
    assert.ok(config.admin.equals(admin));
  });

  it("supports chained admin authority transfers and gates pause controls to current admin only", async () => {
    const secondAdmin = Keypair.generate();
    const thirdAdmin = Keypair.generate();
    await fundKeypair(secondAdmin);
    await fundKeypair(thirdAdmin);

    await program.methods
      .transferAdmin()
      .accounts({
        admin,
        config: configPda,
        newAdmin: secondAdmin.publicKey,
      })
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .pause()
          .accounts({
            admin,
            config: configPda,
          })
          .rpc(),
      "first admin pause after first transfer"
    );

    await program.methods
      .transferAdmin()
      .accounts({
        admin: secondAdmin.publicKey,
        config: configPda,
        newAdmin: thirdAdmin.publicKey,
      })
      .signers([secondAdmin])
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .pause()
          .accounts({
            admin: secondAdmin.publicKey,
            config: configPda,
          })
          .signers([secondAdmin])
          .rpc(),
      "second admin pause after second transfer"
    );

    await program.methods
      .pause()
      .accounts({
        admin: thirdAdmin.publicKey,
        config: configPda,
      })
      .signers([thirdAdmin])
      .rpc();

    await program.methods
      .unpause()
      .accounts({
        admin: thirdAdmin.publicKey,
        config: configPda,
      })
      .signers([thirdAdmin])
      .rpc();

    const config = await (program.account as any).stablecoinConfig.fetch(configPda);
    assert.ok(config.admin.equals(thirdAdmin.publicKey));
    assert.equal(config.paused, false);
  });

  it("allows only final admin in chained transfer to execute minter update path", async () => {
    const secondAdmin = Keypair.generate();
    const thirdAdmin = Keypair.generate();
    const oldMinter = Keypair.generate();
    const newMinter = Keypair.generate();
    await fundKeypair(secondAdmin);
    await fundKeypair(thirdAdmin);
    await fundKeypair(oldMinter);
    await fundKeypair(newMinter);

    const destinationAta = await createAta(admin);
    const [oldMinterRolePda] = findRole(configPda, oldMinter.publicKey, 1);
    const [newMinterRolePda] = findRole(configPda, newMinter.publicKey, 1);

    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: oldMinter.publicKey,
        role: oldMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .transferAdmin()
      .accounts({
        admin,
        config: configPda,
        newAdmin: secondAdmin.publicKey,
      })
      .rpc();

    await program.methods
      .transferAdmin()
      .accounts({
        admin: secondAdmin.publicKey,
        config: configPda,
        newAdmin: thirdAdmin.publicKey,
      })
      .signers([secondAdmin])
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .grantRole(1)
          .accounts({
            admin,
            config: configPda,
            authority: newMinter.publicKey,
            role: newMinterRolePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
      "first admin grant new minter after chained transfer"
    );

    await expectFailure(
      async () =>
        program.methods
          .grantRole(1)
          .accounts({
            admin: secondAdmin.publicKey,
            config: configPda,
            authority: newMinter.publicKey,
            role: newMinterRolePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([secondAdmin])
          .rpc(),
      "second admin grant new minter after chained transfer"
    );

    await program.methods
      .grantRole(1)
      .accounts({
        admin: thirdAdmin.publicKey,
        config: configPda,
        authority: newMinter.publicKey,
        role: newMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([thirdAdmin])
      .rpc();

    await program.methods
      .revokeRole()
      .accounts({
        admin: thirdAdmin.publicKey,
        config: configPda,
        authority: oldMinter.publicKey,
        role: oldMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([thirdAdmin])
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .mintTokens(new anchor.BN(50_000))
          .accounts({
            minter: oldMinter.publicKey,
            config: configPda,
            role: oldMinterRolePda,
            mint: mint.publicKey,
            destination: destinationAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([oldMinter])
          .rpc(),
      "old minter mint after chained transfer minter update path"
    );

    await program.methods
      .mintTokens(new anchor.BN(125_000))
      .accounts({
        minter: newMinter.publicKey,
        config: configPda,
        role: newMinterRolePda,
        mint: mint.publicKey,
        destination: destinationAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([newMinter])
      .rpc();

    const account = await getAccount(provider.connection, destinationAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(account.amount), 125_000);
  });

  it("allows only transferred admin to execute full minter update path", async () => {
    const oldMinter = Keypair.generate();
    const newMinter = Keypair.generate();
    const newAdmin = Keypair.generate();
    await fundKeypair(oldMinter);
    await fundKeypair(newMinter);
    await fundKeypair(newAdmin);

    const destinationAta = await createAta(admin);
    const [oldMinterRolePda] = findRole(configPda, oldMinter.publicKey, 1);
    const [newMinterRolePda] = findRole(configPda, newMinter.publicKey, 1);

    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: oldMinter.publicKey,
        role: oldMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .transferAdmin()
      .accounts({
        admin,
        config: configPda,
        newAdmin: newAdmin.publicKey,
      })
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .grantRole(1)
          .accounts({
            admin,
            config: configPda,
            authority: newMinter.publicKey,
            role: newMinterRolePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
      "old admin grant new minter after transfer"
    );

    await program.methods
      .grantRole(1)
      .accounts({
        admin: newAdmin.publicKey,
        config: configPda,
        authority: newMinter.publicKey,
        role: newMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([newAdmin])
      .rpc();

    await program.methods
      .revokeRole()
      .accounts({
        admin: newAdmin.publicKey,
        config: configPda,
        authority: oldMinter.publicKey,
        role: oldMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([newAdmin])
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .mintTokens(new anchor.BN(50_000))
          .accounts({
            minter: oldMinter.publicKey,
            config: configPda,
            role: oldMinterRolePda,
            mint: mint.publicKey,
            destination: destinationAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([oldMinter])
          .rpc(),
      "old minter mint after transfer-admin minter update path"
    );

    await program.methods
      .mintTokens(new anchor.BN(125_000))
      .accounts({
        minter: newMinter.publicKey,
        config: configPda,
        role: newMinterRolePda,
        mint: mint.publicKey,
        destination: destinationAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([newMinter])
      .rpc();

    const account = await getAccount(provider.connection, destinationAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(account.amount), 125_000);
  });

  it("allows admin transfer while paused and preserves incident controls", async () => {
    const newAdmin = Keypair.generate();
    await fundKeypair(newAdmin);

    await program.methods
      .pause()
      .accounts({
        admin,
        config: configPda,
      })
      .rpc();

    await program.methods
      .transferAdmin()
      .accounts({
        admin,
        config: configPda,
        newAdmin: newAdmin.publicKey,
      })
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .unpause()
          .accounts({
            admin,
            config: configPda,
          })
          .rpc(),
      "old admin unpause after paused transfer"
    );

    await program.methods
      .unpause()
      .accounts({
        admin: newAdmin.publicKey,
        config: configPda,
      })
      .signers([newAdmin])
      .rpc();

    const config = await (program.account as any).stablecoinConfig.fetch(configPda);
    assert.ok(config.admin.equals(newAdmin.publicKey));
    assert.equal(config.paused, false);
  });

  it("allows paused minter rotation by new admin immediately after admin transfer", async () => {
    const oldMinter = Keypair.generate();
    const newMinter = Keypair.generate();
    const newAdmin = Keypair.generate();
    await fundKeypair(oldMinter);
    await fundKeypair(newMinter);
    await fundKeypair(newAdmin);

    const destinationAta = await createAta(admin);
    const [oldMinterRolePda] = findRole(configPda, oldMinter.publicKey, 1);
    const [newMinterRolePda] = findRole(configPda, newMinter.publicKey, 1);

    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: oldMinter.publicKey,
        role: oldMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .pause()
      .accounts({
        admin,
        config: configPda,
      })
      .rpc();

    await program.methods
      .transferAdmin()
      .accounts({
        admin,
        config: configPda,
        newAdmin: newAdmin.publicKey,
      })
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .grantRole(1)
          .accounts({
            admin,
            config: configPda,
            authority: newMinter.publicKey,
            role: newMinterRolePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
      "old admin grant new minter during paused transfer"
    );

    await program.methods
      .grantRole(1)
      .accounts({
        admin: newAdmin.publicKey,
        config: configPda,
        authority: newMinter.publicKey,
        role: newMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([newAdmin])
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .revokeRole()
          .accounts({
            admin,
            config: configPda,
            authority: oldMinter.publicKey,
            role: oldMinterRolePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc(),
      "old admin revoke old minter during paused transfer"
    );

    await program.methods
      .revokeRole()
      .accounts({
        admin: newAdmin.publicKey,
        config: configPda,
        authority: oldMinter.publicKey,
        role: oldMinterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([newAdmin])
      .rpc();

    await program.methods
      .unpause()
      .accounts({
        admin: newAdmin.publicKey,
        config: configPda,
      })
      .signers([newAdmin])
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .mintTokens(new anchor.BN(50_000))
          .accounts({
            minter: oldMinter.publicKey,
            config: configPda,
            role: oldMinterRolePda,
            mint: mint.publicKey,
            destination: destinationAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([oldMinter])
          .rpc(),
      "old minter mint after paused transfer rotation"
    );

    await program.methods
      .mintTokens(new anchor.BN(125_000))
      .accounts({
        minter: newMinter.publicKey,
        config: configPda,
        role: newMinterRolePda,
        mint: mint.publicKey,
        destination: destinationAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([newMinter])
      .rpc();

    const account = await getAccount(provider.connection, destinationAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(account.amount), 125_000);
  });

  it("allows new admin to seize during paused incident immediately after admin transfer", async () => {
    const newAdmin = Keypair.generate();
    await fundKeypair(newAdmin);
    const [minterRolePda] = findRole(configPda, admin, 1);

    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: admin,
        role: minterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);

    await program.methods
      .mintTokens(new anchor.BN(500_000))
      .accounts({
        minter: admin,
        config: configPda,
        role: minterRolePda,
        mint: mint.publicKey,
        destination: sourceAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    await program.methods
      .pause()
      .accounts({
        admin,
        config: configPda,
      })
      .rpc();

    await program.methods
      .transferAdmin()
      .accounts({
        admin,
        config: configPda,
        newAdmin: newAdmin.publicKey,
      })
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .seizeTokens(new anchor.BN(100_000))
          .accounts({
            admin,
            config: configPda,
            mint: mint.publicKey,
            from: sourceAta,
            to: destinationAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
      "old admin seize during paused post-transfer incident"
    );

    await program.methods
      .seizeTokens(new anchor.BN(100_000))
      .accounts({
        admin: newAdmin.publicKey,
        config: configPda,
        mint: mint.publicKey,
        from: sourceAta,
        to: destinationAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([newAdmin])
      .rpc();

    const src = await getAccount(provider.connection, sourceAta, undefined, TOKEN_2022_PROGRAM_ID);
    const dst = await getAccount(provider.connection, destinationAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(src.amount), 400_000);
    assert.equal(Number(dst.amount), 100_000);
  });

  it("seizes tokens via permanent delegate authority", async () => {
    const [minterRolePda] = findRole(configPda, admin, 1);
    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: admin,
        role: minterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();

    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);

    await program.methods
      .mintTokens(new anchor.BN(1_500_000))
      .accounts({
        minter: admin,
        config: configPda,
        role: minterRolePda,
        mint: mint.publicKey,
        destination: sourceAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    await program.methods
      .seizeTokens(new anchor.BN(500_000))
      .accounts({
        admin,
        config: configPda,
        mint: mint.publicKey,
        from: sourceAta,
        to: destinationAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const src = await getAccount(provider.connection, sourceAta, undefined, TOKEN_2022_PROGRAM_ID);
    const dst = await getAccount(provider.connection, destinationAta, undefined, TOKEN_2022_PROGRAM_ID);

    assert.equal(Number(src.amount), 1_000_000);
    assert.equal(Number(dst.amount), 500_000);
  });

  it("allows seize while paused for incident response", async () => {
    const [minterRolePda] = findRole(configPda, admin, 1);
    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: admin,
        role: minterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);

    await program.methods
      .mintTokens(new anchor.BN(400_000))
      .accounts({
        minter: admin,
        config: configPda,
        role: minterRolePda,
        mint: mint.publicKey,
        destination: sourceAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    await program.methods
      .pause()
      .accounts({
        admin,
        config: configPda,
      })
      .rpc();

    await program.methods
      .seizeTokens(new anchor.BN(150_000))
      .accounts({
        admin,
        config: configPda,
        mint: mint.publicKey,
        from: sourceAta,
        to: destinationAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const src = await getAccount(provider.connection, sourceAta, undefined, TOKEN_2022_PROGRAM_ID);
    const dst = await getAccount(provider.connection, destinationAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(src.amount), 250_000);
    assert.equal(Number(dst.amount), 150_000);
  });

  it("blocks unauthorized seize attempts", async () => {
    const [minterRolePda] = findRole(configPda, admin, 1);
    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: admin,
        role: minterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);

    await program.methods
      .mintTokens(new anchor.BN(200_000))
      .accounts({
        minter: admin,
        config: configPda,
        role: minterRolePda,
        mint: mint.publicKey,
        destination: sourceAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const attacker = Keypair.generate();
    await expectFailure(
      async () =>
        program.methods
          .seizeTokens(new anchor.BN(100_000))
          .accounts({
            admin: attacker.publicKey,
            config: configPda,
            mint: mint.publicKey,
            from: sourceAta,
            to: destinationAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([attacker])
          .rpc(),
      "unauthorized seize"
    );

    await fundKeypair(sourceOwner);
    await expectFailure(
      async () =>
        program.methods
          .seizeTokens(new anchor.BN(100_000))
          .accounts({
            admin: sourceOwner.publicKey,
            config: configPda,
            mint: mint.publicKey,
            from: sourceAta,
            to: destinationAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([sourceOwner])
          .rpc(),
      "source-owner unauthorized seize"
    );
  });

  it("rejects zero-amount seize", async () => {
    const [minterRolePda] = findRole(configPda, admin, 1);
    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: admin,
        role: minterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);

    await program.methods
      .mintTokens(new anchor.BN(100_000))
      .accounts({
        minter: admin,
        config: configPda,
        role: minterRolePda,
        mint: mint.publicKey,
        destination: sourceAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .seizeTokens(new anchor.BN(0))
          .accounts({
            admin,
            config: configPda,
            mint: mint.publicKey,
            from: sourceAta,
            to: destinationAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
      "zero-amount seize"
    );
  });

  it("rejects old admin seizure after admin transfer", async () => {
    const newAdmin = Keypair.generate();
    const [minterRolePda] = findRole(configPda, admin, 1);

    await program.methods
      .grantRole(1)
      .accounts({
        admin,
        config: configPda,
        authority: admin,
        role: minterRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey);
    const destinationAta = await createAta(destinationOwner.publicKey);

    await program.methods
      .mintTokens(new anchor.BN(250_000))
      .accounts({
        minter: admin,
        config: configPda,
        role: minterRolePda,
        mint: mint.publicKey,
        destination: sourceAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    await program.methods
      .transferAdmin()
      .accounts({
        admin,
        config: configPda,
        newAdmin: newAdmin.publicKey,
      })
      .rpc();

    await expectFailure(
      async () =>
        program.methods
          .seizeTokens(new anchor.BN(50_000))
          .accounts({
            admin,
            config: configPda,
            mint: mint.publicKey,
            from: sourceAta,
            to: destinationAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
      "old admin seize after transfer"
    );

    await program.methods
      .seizeTokens(new anchor.BN(50_000))
      .accounts({
        admin: newAdmin.publicKey,
        config: configPda,
        mint: mint.publicKey,
        from: sourceAta,
        to: destinationAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([newAdmin])
      .rpc();

    const src = await getAccount(provider.connection, sourceAta, undefined, TOKEN_2022_PROGRAM_ID);
    const dst = await getAccount(provider.connection, destinationAta, undefined, TOKEN_2022_PROGRAM_ID);
    assert.equal(Number(src.amount), 200_000);
    assert.equal(Number(dst.amount), 50_000);
  });

  it("rejects seize_tokens when mint does not match config", async () => {
    const payer = (provider.wallet as any).payer as Keypair;
    const otherMint = await createMint(
      provider.connection,
      payer,
      admin,
      admin,
      6,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const sourceOwner = Keypair.generate();
    const destinationOwner = Keypair.generate();
    const sourceAta = await createAta(sourceOwner.publicKey, otherMint);
    const destinationAta = await createAta(destinationOwner.publicKey, otherMint);

    await expectFailure(
      async () =>
        program.methods
          .seizeTokens(new anchor.BN(1))
          .accounts({
            admin,
            config: configPda,
            mint: otherMint,
            from: sourceAta,
            to: destinationAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc(),
      "seize with mint different from config mint"
    );
  });
});
