import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction
} = await import("@solana/web3.js");
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAccount,
  getOrCreateAssociatedTokenAccount,
  transferCheckedWithTransferHook
} = await import("@solana/spl-token");
const sdk = await import("../sdk/dist/index.js");

const connection = new Connection("http://127.0.0.1:8899", "confirmed");

async function maybeLoadKeypair(path) {
  try {
    const raw = await readFile(path, "utf8");
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {
    return null;
  }
}

async function sendSingleInstruction(instruction, signer) {
  const tx = sdk.buildRegistryTransaction(instruction);
  tx.feePayer = signer.publicKey;
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latestBlockhash.blockhash;
  return sendAndConfirmTransaction(connection, tx, [signer], {
    commitment: "confirmed"
  });
}

function hexToBytes(hex) {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function generateZkProof({ subject, expiresAtSlot }) {
  const raw = execFileSync(
    "cargo",
    ["run", "-q", "-p", "sss-zk-compliance", "--bin", "sss-zk-prove"],
    {
      cwd: process.cwd(),
      input: JSON.stringify({
        subject: subject.toBase58(),
        expires_at_slot: expiresAtSlot,
        circuit: "sss3-merkle-schnorr-v1"
      }),
      encoding: "utf8"
    }
  );
  return JSON.parse(raw);
}

async function main() {
  const authority = (await maybeLoadKeypair(".local-validator-authority.json")) ?? Keypair.generate();
  const operator = Keypair.generate();

  const stablecoinProgramId = new PublicKey("Gm2SdmH1ydLKmPtjNE4W2ZLjW5kMvPrx784L7oUcw4w");
  const transferHookProgramId = new PublicKey("E24UT9RMiw9zBh51ZMzXRdmoiLQ2PkVZ1sYhBKqazYy8");
  const registryProgramId = new PublicKey("5vedffCtRhecm5sSXJCbgrwe7GYnGC9XK5vWLiMHLVXB");

  const registryConfigPda = sdk.findRegistryConfigPda(registryProgramId);
  const existingRegistry = await connection.getAccountInfo(registryConfigPda, "confirmed");
  if (!existingRegistry) {
    const registryInitSig = await sendSingleInstruction(
      sdk.buildInitializeRegistryInstruction(authority.publicKey, registryProgramId),
      authority
    );
    assert.ok(registryInitSig);
  }

  const sss2 = await sdk.SolanaStablecoin.createOnChain({
    connection,
    authority,
    programId: stablecoinProgramId,
    preset: sdk.Presets.SSS_2,
    name: "Local Regulated USD",
    symbol: "lrUSD",
    decimals: 6,
    standardVersion: "sss/1.0.0",
    transferHookProgramId
  });
  assert.ok(sss2.signature);
  const sss2MetaListSig = await sss2.stablecoin.initializeTransferHookMetaListOnChain(transferHookProgramId);
  assert.ok(sss2MetaListSig);

  const sss3 = await sdk.SolanaStablecoin.createOnChain({
    connection,
    authority,
    programId: stablecoinProgramId,
    preset: sdk.Presets.SSS_3,
    name: "Local Private USD",
    symbol: "lpUSD",
    decimals: 6,
    standardVersion: "sss/1.1.0",
    transferHookProgramId,
    compliance: {
      proofVerifierProgramId: stablecoinProgramId,
      compressedComplianceRoot: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      complianceCircuit: "sss3-merkle-schnorr-v1"
    }
  });
  assert.ok(sss3.signature);
  const currentSlot = await connection.getSlot("confirmed");
  const zkProof = generateZkProof({
    subject: authority.publicKey,
    expiresAtSlot: currentSlot + 500
  });
  const rootUpdateSig = await sss3.stablecoin.updateComplianceRootOnChain(zkProof.compliance_root);
  assert.ok(rootUpdateSig);
  const metaListSig = await sss3.stablecoin.initializeTransferHookMetaListOnChain(transferHookProgramId);
  assert.ok(metaListSig);

  const connected = await sdk.SolanaStablecoin.connect({
    connection,
    authority,
    programId: stablecoinProgramId,
    mint: sss2.stablecoin.getMintAddress()
  });
  const connectedConfig = await connected.getConfig();
  assert.equal(connectedConfig.preset, "sss-2");
  assert.equal(connectedConfig.standardVersion, "sss/1.0.0");

  const pauseSig = await connected.pauseOnChain(true);
  assert.ok(pauseSig);
  const unpauseSig = await connected.pauseOnChain(false);
  assert.ok(unpauseSig);

  const blacklistedAddress = Keypair.generate().publicKey;
  const blacklistAddSig = await connected.blacklistAddOnChain({
    address: blacklistedAddress,
    reason: "local-e2e"
  });
  assert.ok(blacklistAddSig);
  const blacklistRemoveSig = await connected.blacklistRemoveOnChain(blacklistedAddress);
  assert.ok(blacklistRemoveSig);
  const seizureOwner = Keypair.generate();
  const seizureSourceAta = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    sss2.stablecoin.getMintAddress(),
    seizureOwner.publicKey,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const seizureTreasuryAta = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    sss2.stablecoin.getMintAddress(),
    authority.publicKey,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const sourceThawSig = await connected.freezeOnChain(seizureSourceAta.address, true);
  assert.ok(sourceThawSig);
  const treasuryThawSig = await connected.freezeOnChain(seizureTreasuryAta.address, true);
  assert.ok(treasuryThawSig);
  const sourceMintSig = await sss2.stablecoin.mintOnChain({
    destination: seizureSourceAta.address,
    amount: 10n,
    minter: authority
  });
  assert.ok(sourceMintSig);
  const seizeSig = await connected.seizeOnChain({
    fromAccount: seizureSourceAta.address,
    toAccount: seizureTreasuryAta.address,
    seizer: authority
  });
  assert.ok(seizeSig);

  const grantSig = await connected.updateRoleOnChain({
    holder: operator.publicKey,
    role: "minter",
    isActive: true,
    mintQuota: 1_000_000n
  });
  assert.ok(grantSig);
  const revokeSig = await connected.updateRoleOnChain({
    holder: operator.publicKey,
    role: "minter",
    isActive: false,
    mintQuota: null
  });
  assert.ok(revokeSig);

  const privateEntry = await sss3.stablecoin.getRegistryEntry();
  assert.equal(privateEntry.preset, "sss-3");
  assert.equal(privateEntry.enableConfidentialTransfers, true);
  assert.equal(privateEntry.enableZkComplianceProofs, true);

  const sss3SourceKeypair = Keypair.generate();
  const sss3DestinationKeypair = Keypair.generate();
  const sourceAccount = await createAccount(
    connection,
    authority,
    sss3.stablecoin.getMintAddress(),
    authority.publicKey,
    sss3SourceKeypair,
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );
  const destinationAccount = await createAccount(
    connection,
    authority,
    sss3.stablecoin.getMintAddress(),
    authority.publicKey,
    sss3DestinationKeypair,
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );
  const sourceUnfreezeSig = await sss3.stablecoin.freezeOnChain(sourceAccount, true);
  assert.ok(sourceUnfreezeSig);
  const destinationUnfreezeSig = await sss3.stablecoin.freezeOnChain(destinationAccount, true);
  assert.ok(destinationUnfreezeSig);
  const sss3MintSig = await sss3.stablecoin.mintOnChain({
    destination: sourceAccount,
    amount: 10n,
    minter: authority
  });
  assert.ok(sss3MintSig);
  const performProofTransfer = () =>
    transferCheckedWithTransferHook(
      connection,
      authority,
      sourceAccount,
      sss3.stablecoin.getMintAddress(),
      destinationAccount,
      authority,
      1n,
      6,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

  await assert.rejects(
    () => performProofTransfer(),
    /MissingProofReceipt|missing compliance proof receipt|custom program error/i
  );

  const proofSubmitSig = await sss3.stablecoin.submitProofReceiptOnChain({
    subject: authority.publicKey,
    commitment: hexToBytes(zkProof.commitment),
    proofCommitment: hexToBytes(zkProof.proof_commitment),
    response: hexToBytes(zkProof.response),
    merkleSiblings: [],
    merkleDirections: [],
    circuit: "sss3-merkle-schnorr-v1",
    expiresAtSlot: BigInt(zkProof.expires_at_slot)
  });
  assert.ok(proofSubmitSig);

  const executeSig = await performProofTransfer();
  assert.ok(executeSig);

  const revokeProofSig = await sss3.stablecoin.revokeProofReceiptOnChain(authority.publicKey);
  assert.ok(revokeProofSig);
  await assert.rejects(
    () => performProofTransfer(),
    /MissingProofReceipt|missing compliance proof receipt|custom program error/i
  );

  const releasePda = sdk.findRegistryReleasePda("sss/1.1.0", registryProgramId);
  const existingRelease = await connection.getAccountInfo(releasePda, "confirmed");
  if (!existingRelease) {
    const releaseSig = await sendSingleInstruction(
      sdk.buildRegisterReleaseInstruction({
        authority: authority.publicKey,
        standardVersion: "sss/1.1.0",
        preset: "sss-3",
        schemaHash: privateEntry.configHash,
        notesUri: "https://local/sss-1-1-0"
      }, registryProgramId),
      authority
    );
    assert.ok(releaseSig);
  }

  const registerSig = await sendSingleInstruction(
    sdk.buildRegisterStablecoinInstruction({
      stablecoinProgramId,
      entry: privateEntry
    }, registryProgramId),
    authority
  );
  assert.ok(registerSig);

  process.stdout.write("localnet-e2e:ok\n");
}

main().catch((error) => {
  process.stderr.write(`localnet-e2e:failed:${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
