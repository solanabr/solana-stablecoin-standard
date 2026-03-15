import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getMint, getAccount, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { findConfigPDA, findRolePDA, STABLECOIN_PROGRAM_ID, ROLES } from '../config';

// Deserialization matching on-chain IDL StablecoinConfig layout:
// bump(u8), mint(pubkey), authority(pubkey), preset(u8),
// features(FeatureFlags: 4 bools), paused(bool), defaultAccountFrozen(bool),
// totalMinted(u64), totalBurned(u64), decimals(u8),
// name([u8;32]), symbol([u8;10]), transferHookProgram(pubkey),
// createdAt(u64), updatedAt(u64), reserved([u8;128])
function parseConfigAccount(data) {
  let offset = 8; // skip 8-byte Anchor discriminator

  const bump = data[offset++];                                          // u8

  const mint = new PublicKey(data.slice(offset, offset + 32));          // pubkey
  offset += 32;

  const authority = new PublicKey(data.slice(offset, offset + 32));     // pubkey
  offset += 32;

  const preset = data[offset++];                                        // Preset enum (u8)

  // FeatureFlags: 4 bools (freezeAuthority, permanentDelegate, transferHook, confidentialTransfers)
  const freezeAuthority = !!data[offset++];
  const permanentDelegate = !!data[offset++];
  const transferHook = !!data[offset++];
  const confidentialTransfers = !!data[offset++];

  const paused = !!data[offset++];                                      // bool
  const defaultAccountFrozen = !!data[offset++];                        // bool

  const totalMinted = Number(data.readBigUInt64LE(offset));             // u64
  offset += 8;
  const totalBurned = Number(data.readBigUInt64LE(offset));             // u64
  offset += 8;

  const decimals = data[offset++];                                      // u8

  // name: [u8; 32] — read as UTF-8, trim nulls
  const nameRaw = data.slice(offset, offset + 32);
  offset += 32;
  const name = Buffer.from(nameRaw).toString('utf8').replace(/\0+$/, '');

  // symbol: [u8; 10] — read as UTF-8, trim nulls
  const symbolRaw = data.slice(offset, offset + 10);
  offset += 10;
  const symbol = Buffer.from(symbolRaw).toString('utf8').replace(/\0+$/, '');

  // transferHookProgram: pubkey
  const transferHookProgram = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // Map feature flags to the names the rest of the frontend expects
  // SSS-1 preset: freeze=true, rest=false
  // SSS-2 preset: freeze=true, permanentDelegate=true, transferHook=true
  const isSSS2 = preset === 1;
  return {
    authority,
    mint,
    preset,
    features: {
      canMint: true,               // all presets can mint
      canBurn: true,               // all presets can burn
      canFreeze: freezeAuthority,
      canPause: true,              // all presets can pause
      hasRoles: true,              // all presets have roles
      hasBlacklist: isSSS2,
      hasSeize: isSSS2 && permanentDelegate,
      hasTransferHook: transferHook,
    },
    paused,
    defaultAccountFrozen,
    totalMinted,
    totalBurned,
    decimals,
    name,
    symbol,
    bump,
  };
}

// RoleAssignment IDL: bump(u8), config(pubkey), holder(pubkey), roleMask(u8),
// mintQuota(u64), mintedAmount(u64), updatedAt(u64)
function parseRoleAccount(data) {
  let offset = 8; // skip discriminator

  const bump = data[offset++];                                          // u8

  const config = new PublicKey(data.slice(offset, offset + 32));        // pubkey
  offset += 32;

  const holder = new PublicKey(data.slice(offset, offset + 32));        // pubkey
  offset += 32;

  const roleMask = data[offset++];                                      // u8

  const mintQuota = Number(data.readBigUInt64LE(offset));               // u64
  offset += 8;

  const mintedAmount = Number(data.readBigUInt64LE(offset));            // u64
  offset += 8;

  const roles = [];
  for (const [name, val] of Object.entries(ROLES)) {
    if (roleMask & val) roles.push(name);
  }

  return { user: holder, config, roleMask, roles, mintQuota, mintedAmount, bump };
}

export function useStablecoin(mintAddress) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [config, setConfig] = useState(null);
  const [mintInfo, setMintInfo] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!mintAddress) return;
    setLoading(true);
    setError(null);

    try {
      const mint = new PublicKey(mintAddress);
      const [configPDA] = findConfigPDA(mint);

      // Fetch config account
      const configInfo = await connection.getAccountInfo(configPDA);
      if (!configInfo) {
        setError('Stablecoin config not found for this mint');
        setLoading(false);
        return;
      }
      const parsedConfig = parseConfigAccount(Buffer.from(configInfo.data));
      setConfig(parsedConfig);

      // Fetch mint info
      try {
        const mInfo = await getMint(connection, mint, undefined, TOKEN_2022_PROGRAM_ID);
        setMintInfo({
          supply: Number(mInfo.supply),
          decimals: mInfo.decimals,
          freezeAuthority: mInfo.freezeAuthority?.toBase58(),
          mintAuthority: mInfo.mintAuthority?.toBase58(),
          isInitialized: mInfo.isInitialized,
        });
      } catch (e) {
        console.warn('Could not fetch mint info:', e);
      }

      // Fetch user role if connected
      if (publicKey) {
        try {
          const [rolePDA] = findRolePDA(configPDA, publicKey);
          const roleInfo = await connection.getAccountInfo(rolePDA);
          if (roleInfo) {
            setUserRole(parseRoleAccount(Buffer.from(roleInfo.data)));
          } else {
            setUserRole(null);
          }
        } catch (e) {
          setUserRole(null);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connection, mintAddress, publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { config, mintInfo, userRole, loading, error, refresh };
}
