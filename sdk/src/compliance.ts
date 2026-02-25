import { type Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import type { Program, AnchorProvider } from "@coral-xyz/anchor";
import anchorPkg from "@coral-xyz/anchor";
type AnchorMod = typeof import("@coral-xyz/anchor");
const {
  Program: ProgramCtor,
  AnchorProvider: ProviderCtor,
  Wallet,
  BN,
} = anchorPkg as unknown as AnchorMod;
import type { SssToken } from "./idl_types.js";
import {
  deriveStablecoinConfig,
  deriveRoleManager,
  deriveBlacklistEntry,
  deriveExtraAccountMetaList,
} from "./pda.js";
import { HOOK_PROGRAM_ID } from "./presets.js";

/**
 * ComplianceModule provides SSS-2 blacklist and seizure operations.
 *
 * Only available on tokens created with the SSS-2 preset
 * (enablePermanentDelegate = true). Calling any method on an SSS-1 token
 * will throw an error.
 */
export class ComplianceModule {
  private readonly program: Program<SssToken>;
  private readonly connection: Connection;
  private readonly mint: PublicKey;
  private readonly isCompliant: boolean;

  constructor(
    program: Program<SssToken>,
    connection: Connection,
    mint: PublicKey,
    isCompliant: boolean
  ) {
    this.program = program;
    this.connection = connection;
    this.mint = mint;
    this.isCompliant = isCompliant;
  }

  private assertCompliant(): void {
    if (!this.isCompliant) {
      throw new Error(
        "ComplianceModule operations are only available on SSS-2 tokens " +
          "(enablePermanentDelegate must be true). " +
          "This token was created with the SSS-1 preset."
      );
    }
  }

  private getProvider(signer: Keypair): AnchorProvider {
    const wallet = new Wallet(signer);
    return new ProviderCtor(this.connection, wallet, {
      commitment: "confirmed",
    });
  }

  /**
   * Add a wallet address to the compliance blacklist.
   *
   * Creates a BlacklistEntry PDA. The transfer hook program will reject
   * any transfer involving this address while the entry exists.
   *
   * @param blacklister - Keypair with the Blacklister role
   * @param address - The wallet address to blacklist
   * @param reason - Human-readable reason string (max 64 chars)
   * @returns Transaction signature
   */
  async addToBlacklist(
    blacklister: Keypair,
    address: PublicKey,
    reason: string
  ): Promise<string> {
    this.assertCompliant();

    const provider = this.getProvider(blacklister);
    const program = new ProgramCtor<SssToken>(
      this.program.idl,
      provider
    );

    const [configPda] = await deriveStablecoinConfig(this.mint);
    const [roleManagerPda] = await deriveRoleManager(configPda);
    const [blacklistEntryPda] = await deriveBlacklistEntry(this.mint, address);

    const tx = await program.methods
      .addToBlacklist(address, reason)
      .accountsPartial({
        blacklister: blacklister.publicKey,
        stablecoinConfig: configPda,
        roleManager: roleManagerPda,
        blacklistEntry: blacklistEntryPda,
      })
      .signers([blacklister])
      .rpc({ commitment: "confirmed" });

    return tx;
  }

  /**
   * Remove a wallet address from the compliance blacklist.
   *
   * Closes the BlacklistEntry PDA. The address will be able to transact again.
   *
   * @param blacklister - Keypair with the Blacklister role
   * @param address - The wallet address to remove from the blacklist
   * @returns Transaction signature
   */
  async removeFromBlacklist(
    blacklister: Keypair,
    address: PublicKey
  ): Promise<string> {
    this.assertCompliant();

    const provider = this.getProvider(blacklister);
    const program = new ProgramCtor<SssToken>(
      this.program.idl,
      provider
    );

    const [configPda] = await deriveStablecoinConfig(this.mint);
    const [roleManagerPda] = await deriveRoleManager(configPda);
    const [blacklistEntryPda] = await deriveBlacklistEntry(this.mint, address);

    const tx = await program.methods
      .removeFromBlacklist(address)
      .accountsPartial({
        blacklister: blacklister.publicKey,
        stablecoinConfig: configPda,
        roleManager: roleManagerPda,
        blacklistEntry: blacklistEntryPda,
      })
      .signers([blacklister])
      .rpc({ commitment: "confirmed" });

    return tx;
  }

  /**
   * Check whether a wallet address is currently blacklisted.
   *
   * Queries the chain for the BlacklistEntry PDA. Returns true if the account
   * exists (address is blacklisted), false if the account is absent.
   *
   * @param address - The wallet address to check
   * @returns true if blacklisted, false otherwise
   */
  async isBlacklisted(address: PublicKey): Promise<boolean> {
    this.assertCompliant();

    const [blacklistEntryPda] = await deriveBlacklistEntry(this.mint, address);
    const accountInfo = await this.connection.getAccountInfo(blacklistEntryPda);
    return accountInfo !== null;
  }

  async blacklistAdd(
    address: PublicKey,
    reason: string,
    blacklister: Keypair
  ): Promise<string> {
    return this.addToBlacklist(blacklister, address, reason);
  }

  async blacklistRemove(
    address: PublicKey,
    blacklister: Keypair
  ): Promise<string> {
    return this.removeFromBlacklist(blacklister, address);
  }

  /**
   * Seize tokens from a frozen account to a treasury account.
   *
   * Uses the PermanentDelegate extension — no token owner signature is required.
   * The source account must be frozen before seizing.
   *
   * Pass the transfer hook remaining accounts so the hook can validate the
   * seizure. The remaining accounts are:
   *   [HOOK_PROGRAM_ID, extraAccountMetaList, sssToken.programId,
   *    senderBlacklistPda, recipientBlacklistPda]
   *
   * @param seizer - Keypair with the Seizer role
   * @param fromTokenAccount - The frozen token account to seize from
   * @param toTokenAccount - The destination (treasury) token account
   * @param amount - Amount of raw token units to seize
   * @returns Transaction signature
   */
  async seize(
    seizer: Keypair,
    fromTokenAccount: PublicKey,
    toTokenAccount: PublicKey,
    amount: bigint
  ): Promise<string> {
    this.assertCompliant();

    const provider = this.getProvider(seizer);
    const program = new ProgramCtor<SssToken>(
      this.program.idl,
      provider
    );

    const [configPda] = await deriveStablecoinConfig(this.mint);
    const [roleManagerPda] = await deriveRoleManager(configPda);
    const [extraAccountMetaListPda] = await deriveExtraAccountMetaList(
      this.mint
    );

    // Resolve the owner of the destination token account for the recipient blacklist PDA.
    // The sender blacklist PDA must be keyed on the stablecoinConfig PDA (the permanent
    // delegate), because invoke_transfer_checked sets source_authority = permanent delegate,
    // and the transfer hook's execute derives the sender PDA from source_authority.
    const toAccountInfo = await this.connection.getAccountInfo(toTokenAccount);

    if (!toAccountInfo) {
      throw new Error(`Destination token account not found: ${toTokenAccount.toBase58()}`);
    }

    // Token account owner is stored at offset 32 (bytes 32-64 in Token-2022 layout)
    const toOwner = new PublicKey(toAccountInfo.data.slice(32, 64));

    // Sender blacklist: keyed on the permanent delegate (stablecoinConfig PDA)
    const [senderBlacklistPda] = await deriveBlacklistEntry(this.mint, configPda);
    const [recipientBlacklistPda] = await deriveBlacklistEntry(this.mint, toOwner);

    const tx = await program.methods
      .seize(new BN(amount.toString()))
      .accountsPartial({
        seizer: seizer.publicKey,
        stablecoinConfig: configPda,
        roleManager: roleManagerPda,
        mint: this.mint,
        sourceTokenAccount: fromTokenAccount,
        destinationTokenAccount: toTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: HOOK_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: extraAccountMetaListPda, isWritable: false, isSigner: false },
        { pubkey: this.program.programId, isWritable: false, isSigner: false },
        { pubkey: senderBlacklistPda, isWritable: false, isSigner: false },
        { pubkey: recipientBlacklistPda, isWritable: false, isSigner: false },
      ])
      .signers([seizer])
      .rpc({ commitment: "confirmed" });

    return tx;
  }
}
