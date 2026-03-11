const solanaWeb3 = require("@solana/web3.js");
const { createMint, transfer, mintTo, getOrCreateAssociatedTokenAccount, burn } = require("@solana/spl-token");
const {
  createCreateMetadataAccountV2Instruction,
  createCreateMetadataAccountV3Instruction,
  DataV2
} = require("@metaplex-foundation/mpl-token-metadata");
const fs = require("fs");
const path = require("path");


const _argv = process.argv.slice(2);
const _firstArg = _argv[0] && typeof _argv[0] === 'string' ? _argv[0].toLowerCase() : null;
const networkArg = (_firstArg === 'dev' || _firstArg === 'devnet' || _firstArg === 'local' || _firstArg === 'localnet' || _firstArg === 'main' || _firstArg === 'mainnet') ? _firstArg : null;

let RPC = process.env.SOLANA_RPC || null;
if (!RPC) {
  if (networkArg === 'dev' || networkArg === 'devnet') RPC = 'https://api.devnet.solana.com';
  else if (networkArg === 'main' || networkArg === 'mainnet') RPC = 'https://api.mainnet-beta.solana.com';
  else RPC = 'http://127.0.0.1:8899';
}

const connection = new solanaWeb3.Connection(RPC, "confirmed");

const TOKEN_METADATA_PROGRAM_ID = new solanaWeb3.PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

function loadMyKeypair() {
    const configPath = path.join(process.env.HOME, ".config", "solana", "id.json");
    const secret = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return solanaWeb3.Keypair.fromSecretKey(Uint8Array.from(secret));
}

const wallet = loadMyKeypair();

async function main() {
  const shift = networkArg ? 1 : 0;
  const NAME = process.env.TOKEN_NAME || _argv[0 + shift] || "Example Stablecoin";
  const SYMBOL = process.env.TOKEN_SYMBOL || _argv[1 + shift] || "EXS";
  const URI = process.env.TOKEN_URI || _argv[2 + shift] || "https://raw.githubusercontent.com/Rahul-Prasad-07/solana-stablecoin-standard-br/sup-br/metadeta.json";

  const mint = await createToken(NAME, SYMBOL, URI);
  const tokenAccount = await createTokenAccount(mint);
  await mintTokens(mint, tokenAccount.address);

  let supply = await getSupply(mint);
  console.log("Total Supply:", supply);

  await burnTokens(tokenAccount.address, mint);

  supply = await getSupply(mint);
  console.log("Total Supply:", supply);

  const accounts = await getTokenAccounts(mint.toString());
  console.log("Token Accounts:", accounts);

  const holders = await getHolders(mint.toString());
  console.log("Token Holders:", holders);

    

}

main().catch((err) => {
    console.error("Error:", err);
});

const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");

async function getTokenAccounts(mint) {

  const accounts =
    await connection.getProgramAccounts(
      TOKEN_PROGRAM_ID,
      {
        filters: [
          { dataSize: 165 },
          {
            memcmp: {
              offset: 0,
              bytes: mint
            }
          }
        ]
      }
    );

  return accounts;
}

async function getHolders(mint) {

  const mintPubkey = (mint instanceof solanaWeb3.PublicKey) ? mint : new solanaWeb3.PublicKey(mint);

  try {
    const accounts = await connection.getParsedProgramAccounts(
      TOKEN_PROGRAM_ID,
      {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: mintPubkey.toString()
            }
          }
        ]
      }
    );

    const holders = accounts.map(acc => {
      const data = acc.account.data.parsed.info;
      return {
        owner: data.owner,
        balance: data.tokenAmount.uiAmount
      };
    });

    return holders;
  } catch (err) {
    // Some RPC endpoints (including certain public nodes) disable program-wide secondary index queries.
    // Fall back to querying the largest token accounts for the mint and fetching each account's parsed info.
    console.warn('getParsedProgramAccounts failed, falling back to getTokenLargestAccounts:', err.message || err);

    const largest = await connection.getTokenLargestAccounts(mintPubkey);
    const holders = [];
    for (const la of largest.value) {
      try {
        const accInfo = await connection.getParsedAccountInfo(new solanaWeb3.PublicKey(la.address));
        if (accInfo.value && accInfo.value.data && accInfo.value.data.parsed) {
          const info = accInfo.value.data.parsed.info;
          holders.push({ owner: info.owner, balance: info.tokenAmount.uiAmount });
        } else {
          holders.push({ owner: null, balance: Number(la.amount) / Math.pow(10, 9) });
        }
      } catch (innerErr) {
        console.warn('Failed to fetch parsed account for', la.address, innerErr.message || innerErr);
        holders.push({ owner: null, balance: Number(la.amount) / Math.pow(10, 9) });
      }
    }

    return holders;
  }
}

async function getSupply(mint) {

  const pubkey = (mint instanceof solanaWeb3.PublicKey) ? mint : new solanaWeb3.PublicKey(mint);

  const supply = await connection.getTokenSupply(pubkey);

  return supply.value.uiAmount;
}

async function getTransactions(address) {

  const signatures =
    await connection.getSignaturesForAddress(
      new solanaWeb3.PublicKey(address)
    );

  return signatures;
}

async function createToken(name, symbol, uri){

    const mint = await createMint(
        connection,
        wallet,
        wallet.publicKey,
        wallet.publicKey, // Freeze authority (optional)
        9

    );

    console.log("Token Mint Address:", mint.toString());

    // Use provided values
    name = name || "Example Stablecoin";
    symbol = symbol || "EXS";
    uri = uri || "https://example.com/example-stablecoin-metadata.json"; // should point to valid JSON

    // Build DataV2
    const data = {
      name,
      symbol,
      uri,
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null
    };

    // Check whether the metadata program exists on this RPC (local validators don't include Metaplex programs)
    const metaInfo = await connection.getAccountInfo(TOKEN_METADATA_PROGRAM_ID);
    if (!metaInfo) {
      console.warn('Token Metadata program not found on RPC', RPC);
      console.warn('Skipping on-chain metadata creation. To create metadata, run against devnet/mainnet or deploy the metadata program to your local validator.');
      return mint;
    }

    // Derive metadata PDA
    const [metadataPDA] = await solanaWeb3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer()
      ],
      TOKEN_METADATA_PROGRAM_ID
    );

    let createMetadataIx;
    if (typeof createCreateMetadataAccountV3Instruction === 'function') {
      // V3 requires that `creators` is either null or a non-empty array. If it's empty, set to null.
      if (Array.isArray(data.creators) && data.creators.length === 0) {
        data.creators = null;
      }
      // Use V3 instruction when available (newer mpl versions)
      createMetadataIx = createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataPDA,
          mint: mint,
          mintAuthority: wallet.publicKey,
          payer: wallet.publicKey,
          updateAuthority: wallet.publicKey
        },
        {
          createMetadataAccountArgsV3: {
            data: data,
            isMutable: true,
            collectionDetails: null
          }
        }
      );
    } else {
      // Fallback to V2: older mpl versions may expect an explicit creators array; if null, set to empty array
      if (data.creators === null) data.creators = [];

      createMetadataIx = createCreateMetadataAccountV2Instruction(
        {
          metadata: metadataPDA,
          mint: mint,
          mintAuthority: wallet.publicKey,
          payer: wallet.publicKey,
          updateAuthority: wallet.publicKey
        },
        {
          createMetadataAccountArgsV2: {
            data: data,
            isMutable: true
          }
        }
      );
    }

    // Ensure programId and all instruction keys are PublicKey instances (avoid passing invalid values accidentally)
    // Force the metadata instruction's programId to the canonical TOKEN_METADATA_PROGRAM_ID
    createMetadataIx.programId = TOKEN_METADATA_PROGRAM_ID;

    // Normalize keys' pubkeys to PublicKey instances

    createMetadataIx.keys = createMetadataIx.keys.map(k => {
      try {
        const pub = (k.pubkey instanceof solanaWeb3.PublicKey) ? k.pubkey : new solanaWeb3.PublicKey(k.pubkey);
        return Object.assign({}, k, { pubkey: pub });
      } catch (e) {
        console.error('Failed to normalize instruction key pubkey (raw):', k.pubkey, ' type:', typeof k.pubkey, 'constructor:', k.pubkey && k.pubkey.constructor && k.pubkey.constructor.name);
        throw e;
      }
    });

    const tx = new solanaWeb3.Transaction().add(createMetadataIx);
    try {
      await solanaWeb3.sendAndConfirmTransaction(connection, tx, [wallet]);
    } catch (err) {
      console.error('Error sending metadata transaction, instruction keys:');
      createMetadataIx.keys.forEach(k => console.error(k.pubkey && k.pubkey.toString ? k.pubkey.toString() : k.pubkey, ' type:', typeof k.pubkey, 'constructor:', k.pubkey && k.pubkey.constructor && k.pubkey.constructor.name));
      // If it's a SendTransactionError, print any simulation logs to help debugging
      if (err && err.transactionLogs) {
        console.error('Transaction simulation logs:');
        err.transactionLogs.forEach(l => console.error(l));
      }
      throw err;
    }

    console.log("Created metadata (name, symbol, uri) for mint.");

    // Try to fetch and print on-chain + off-chain metadata for verification
    try {
      await fetchOnChainMetadata(mint);
    } catch (err) {
      console.warn('Could not fetch on-chain/off-chain metadata:', err.message || err);
    }

    return mint;
}

async function fetchOnChainMetadata(mint){
  const [metadataPDA] = await solanaWeb3.PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer()
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  const acc = await connection.getAccountInfo(metadataPDA);
  if (!acc) {
    console.log('No on-chain metadata account found at', metadataPDA.toString());
    return null;
  }

  const data = acc.data;
  // try to locate an http/https uri inside the account data
  const httpIdx = data.indexOf(Buffer.from('http'));
  if (httpIdx >= 0) {
    let end = httpIdx;
    while (end < data.length && data[end] !== 0) end++;
    const uri = data.slice(httpIdx, end).toString('utf8');
    console.log('On-chain metadata URI:', uri);

    try {
      const res = await fetch(uri);
      const json = await res.json();
      console.log('Off-chain metadata JSON:', json);
      return json;
    } catch (err) {
      console.warn('Failed to fetch off-chain metadata at', uri, err.message || err);
      return null;
    }
  }

  console.log('Could not find URI string in metadata account; raw data (base64):', data.toString('base64').slice(0,200),'...');
  return null;
}

async function createTokenAccount(mint){
    const account = await getOrCreateAssociatedTokenAccount(
        connection,
        wallet,
        mint,
        wallet.publicKey
    );
    console.log("Token Account Address:", account.address.toString());
    return account;
}

async function mintTokens(mint, tokenAccount){

    await mintTo(
        connection,
        wallet,
        mint,
        tokenAccount,
        wallet.publicKey,
        100000000000 // Mint 1000 tokens (considering 9 decimals)
    );

    console.log("Minted 1000 tokens to", tokenAccount.toString());
}

async function transferTokens(senderTokenAccount, recTokenAccount){

    await transfer(
        connection,
        wallet,
        senderTokenAccount,
        recTokenAccount,
        wallet.publicKey,
        500000000 // Transfer 500 tokens (considering 9 decimals
        
    )

    console.log("Transferred 500 tokens from", senderTokenAccount.toString(), "to", recTokenAccount.toString());
}

async function burnTokens(tokenAccount, mint){
    
    await burn(
        connection,
        wallet,
        tokenAccount,
        mint,
        wallet.publicKey,
        20000000000 // Burn 200 tokens (considering 9 decimals)
    );

    console.log("Burned 200 tokens from", tokenAccount.toString());
}
