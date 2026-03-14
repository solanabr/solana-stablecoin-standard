const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} = require("@solana/spl-token");
const {
  SolanaStablecoin,
  Presets,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} = require("../dist/index.js");

function loadPayer() {
  const explicitPath = process.env.SSS_DEVNET_KEYPAIR;
  const keypairPath = explicitPath || path.join(os.homedir(), ".config", "solana", "id.json");
  const raw = fs.readFileSync(keypairPath, "utf8");
  const secret = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secret);
}

async function fundFromPayer(connection, payer, recipients, solAmountEach) {
  const tx = new Transaction();
  const lamports = Math.floor(solAmountEach * LAMPORTS_PER_SOL);

  for (const recipient of recipients) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: recipient,
        lamports,
      })
    );
  }

  const sig = await connection.sendTransaction(tx, [payer]);
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

async function ensureAta(connection, payer, mint, owner) {
  const ata = getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022_PROGRAM_ID);
  const existing = await connection.getAccountInfo(ata, "confirmed");
  if (existing) {
    return ata;
  }

  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      owner,
      mint,
      TOKEN_2022_PROGRAM_ID
    )
  );

  const sig = await connection.sendTransaction(tx, [payer]);
  await connection.confirmTransaction(sig, "confirmed");
  return ata;
}

test(
  "Devnet integration: create + roles + mint/burn/freeze/thaw/pause/blacklist/seize",
  { timeout: 240_000 },
  async () => {
    const rpc = process.env.SSS_DEVNET_RPC || "https://api.devnet.solana.com";
    const enableHook = process.env.SSS_ENABLE_HOOK === "true";
    const connection = new Connection(rpc, "confirmed");
    const payer = loadPayer();

    const minter = Keypair.generate();
    const burner = Keypair.generate();
    const freezer = Keypair.generate();
    const pauser = Keypair.generate();
    const blacklister = Keypair.generate();
    const seizer = Keypair.generate();
    const recipient = Keypair.generate();
    const treasuryOwner = Keypair.generate();

    const payerBalance = await connection.getBalance(payer.publicKey, "confirmed");
    assert.ok(payerBalance > 0.08 * LAMPORTS_PER_SOL, "Payer balance too low on devnet");

    let stablecoin;
    let initializeTx = "";
    const existingMint = process.env.SSS_EXISTING_MINT;

    if (existingMint) {
      stablecoin = await SolanaStablecoin.load(connection, new PublicKey(existingMint));
    } else {
      try {
        const initParams = Presets.SSS_2({
          name: `Devnet USD ${Date.now()}`,
          symbol: `D${String(Date.now()).slice(-3)}`,
        });
        if (!enableHook) {
          initParams.hookProgramId = undefined;
        }

        const created = await SolanaStablecoin.create(
          connection,
          initParams,
          payer
        );
        stablecoin = created.stablecoin;
        initializeTx = created.tx;
      } catch (error) {
        const message = String(error && error.message ? error.message : error);
        if (message.includes("insufficient funds for rent")) {
          throw new Error(
            "Initialize failed due on-chain mint rent sizing (program-side issue in initialize account space/lamports for Token-2022 metadata). " +
            "Use SSS_EXISTING_MINT=<mint> to run operational flows on an already initialized mint, or redeploy program with initialize rent fix."
          );
        }
        throw error;
      }
    }

    const fundingSig = await fundFromPayer(
      connection,
      payer,
      [
        minter.publicKey,
        burner.publicKey,
        freezer.publicKey,
        pauser.publicKey,
        blacklister.publicKey,
        seizer.publicKey,
      ],
      0.008
    );

    await stablecoin.roles.grant(minter.publicKey, "MINTER", payer);
    await stablecoin.roles.grant(burner.publicKey, "BURNER", payer);
    await stablecoin.roles.grant(freezer.publicKey, "FREEZER", payer);
    await stablecoin.roles.grant(pauser.publicKey, "PAUSER", payer);
    await stablecoin.roles.grant(blacklister.publicKey, "BLACKLISTER", payer);
    await stablecoin.roles.grant(seizer.publicKey, "SEIZER", payer);
    await stablecoin.roles.grant(payer.publicKey, "PAUSER", payer);

    await ensureAta(connection, payer, stablecoin.mintAddress, burner.publicKey);
    await ensureAta(connection, payer, stablecoin.mintAddress, treasuryOwner.publicKey);
    const burnerAta = getAssociatedTokenAddressSync(
      stablecoin.mintAddress,
      burner.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    const treasuryAta = getAssociatedTokenAddressSync(
      stablecoin.mintAddress,
      treasuryOwner.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    const mintSig = await stablecoin.mint(burner.publicKey, 5_000_000n, minter);
    const burnSig = await stablecoin.burn(1_000_000n, burner);

    await stablecoin.freeze(burnerAta, freezer);
    await stablecoin.thaw(burnerAta, freezer);

    await stablecoin.pause(pauser);
    await stablecoin.unpause(payer);

    await stablecoin.compliance.blacklistAdd(recipient.publicKey, blacklister);
    await stablecoin.compliance.blacklistRemove(recipient.publicKey, blacklister);

    const seizeSig = await stablecoin.compliance.seize(
      burnerAta,
      treasuryAta,
      500_000n,
      seizer,
      enableHook
        ? [{ pubkey: SSS_TRANSFER_HOOK_PROGRAM_ID, isWritable: false, isSigner: false }]
        : []
    );

    const burnerBalance = await stablecoin.getBalance(burner.publicKey);
    const treasuryBalance = await stablecoin.getBalance(treasuryOwner.publicKey);

    assert.equal(burnerBalance, 3_500_000n);
    assert.equal(treasuryBalance, 500_000n);

    const liveConfig = await stablecoin.getConfig();
    assert.equal(liveConfig.preset, 1);
    assert.equal(liveConfig.decimals, 6);

    console.log("fundingTx:", fundingSig);
    console.log("initializeTx:", initializeTx || "(loaded existing mint)");
    console.log("mintTx:", mintSig);
    console.log("burnTx:", burnSig);
    console.log("seizeTx:", seizeSig);
    console.log("hookEnabled:", enableHook);
    console.log("mint:", stablecoin.mintAddress.toBase58());
    console.log("config:", stablecoin.config.toBase58());
  }
);
