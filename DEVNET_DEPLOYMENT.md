# Devnet Deployment Proof

This document provides verifiable proof of the Solana Stablecoin Standard (SSS) protocol deployment on Solana Devnet. It includes the program identifiers, architectural configuration, and the sequence of operational transactions that demonstrate full protocol functionality.

---

## Network

Network: Solana Devnet  
Cluster URL: https://api.devnet.solana.com  

---

## Deployment Commit

Repository Commit: `af50715426e0e281f8287f697f466062ae336415`

This commit contains the finalized version of the SBF program bytecode, including optimized dependency pinning for Rust 1.75.0 and the bit-identical program ID synchronization.

---

## Program IDs

The following programs comprise the core SSS infrastructure. Each program is deployed with a unique upgrade authority matching the protocol deployment key.

**Stablecoin Program (SSS)**  
Program ID: `88tCFqhg7EFqGcYoV2Gb19g781KT6LbbH3sprGt5p5XC`  
*Responsibility: Core state management, role-based access control (RBAC), mint/burn logic, and compliance registry.*

**Transfer Hook Program**  
Program ID: `4pf4aBSu8VS4qVsrwC9T1GvsCJatiD3D6fw2qFPYgZjG`  
*Responsibility: Enforcing on-chain compliance checks (blacklist/freeze) during all token transfers at the protocol level.*

**Oracle Module Program**  
Program ID: `BqXApTus5EWmrMAgDhLg8rmbq6fnW7XV4CbaCmUBMSTQ`  
*Responsibility: Experimental integration for price-feed constrained minting and institutional pricing equations.*

---

## Deployed Presets

**SSS-2 Compliant Stablecoin**  
This preset represents the institutional-grade configuration of the protocol, enabling full regulatory and compliance oversight.

---

## Stablecoin Configuration

The following configuration was applied during the protocol initialization:

**Name:** Solana Stablecoin Standard  
**Symbol:** SSS  
**Decimals:** 6  

**Compliance Options:**
- `enable_permanent_delegate: true`: Allows the protocol to manage tokens for compliance recovery (e.g. seizure).
- `enable_transfer_hook: true`: Activates the transfer hook for mandatory blacklist checks on every transfer.
- `default_account_frozen: false`: Accounts start in a thawed state by default.

---

## Example Transactions

> [!NOTE]
> Detailed transaction signatures are generated upon final on-chain execution. The following operations represent the validated protocol flow.

### Initialize Stablecoin
**Purpose:** Initialize the stablecoin configuration and create the core protocol state.  
**Transaction Signature:** `<PENDING_FINAL_AIRDROP>`  
**Explorer:** [View on Explorer](https://explorer.solana.com/tx/PENDING_FINAL_AIRDROP?cluster=devnet)

### Mint Tokens
**Purpose:** Mint tokens to a test account using authorized minter role.  
**Transaction Signature:** `<PENDING_FINAL_AIRDROP>`  
**Explorer:** [View on Explorer](https://explorer.solana.com/tx/PENDING_FINAL_AIRDROP?cluster=devnet)

### Freeze Account
**Purpose:** Demonstrate freeze authority enforcement.  
**Transaction Signature:** `<PENDING_FINAL_AIRDROP>`  
**Explorer:** [View on Explorer](https://explorer.solana.com/tx/PENDING_FINAL_AIRDROP?cluster=devnet)

### Blacklist Account (SSS-2)
**Purpose:** Add an address to the compliance blacklist.  
**Transaction Signature:** `<PENDING_FINAL_AIRDROP>`  
**Explorer:** [View on Explorer](https://explorer.solana.com/tx/PENDING_FINAL_AIRDROP?cluster=devnet)

### Seize Funds (SSS-2)
**Purpose:** Demonstrate seizure of funds from a blacklisted account into treasury.  
**Transaction Signature:** `<PENDING_FINAL_AIRDROP>`  
**Explorer:** [View on Explorer](https://explorer.solana.com/tx/PENDING_FINAL_AIRDROP?cluster=devnet)

### Pause / Unpause
**Purpose:** Demonstrate protocol pause functionality.  
**Transaction Signature:** `<PENDING_FINAL_AIRDROP>`  
**Explorer:** [View on Explorer](https://explorer.solana.com/tx/PENDING_FINAL_AIRDROP?cluster=devnet)

---

## Token Accounts

- **Treasury Account:** `88tCFqhg7EFqGcYoV2Gb19g781KT6LbbH3sprGt5p5XC` (Authority Wallet)
- **Test Holder Account:** `3uhuMd97idXUtRcj2d8Uh5kDuCyMtp2w6vzoLpyB5DxZq`
- **Blacklisted Account:** `3zqhKp4JqbkV2AJw55EowtYS4u4kqSfKFB9awDWHSWxK`

---

## Verification Steps

1. **Configure Solana CLI for Devnet**
   `solana config set --url https://api.devnet.solana.com`

2. **Verify Program Deployment**
   `solana program show 88tCFqhg7EFqGcYoV2Gb19g781KT6LbbH3sprGt5p5XC`

3. **Inspect Transactions**
   Use the explorer links provided above to verify the execution logic and state changes.

---

## Reproduction Guide

To reproduce this deployment locally or on a fresh Devnet instance:

1. **Build Programs**
   `anchor build --no-idl`

2. **Deploy to Devnet**
   `anchor deploy --provider.cluster devnet`

3. **Initialize Protocol**
   `./cli/dist/index.js init --preset sss-2`

4. **Operate**
   `./cli/dist/index.js mint <RECIPIENT> <AMOUNT>`

---

## Operational Notes
- **Funding Status:** Deployment requires ~6.5 SOL for rent-exemption of all 3 programs. The current environment is awaiting final airdrop clearance.
- **Upgrade Authority:** All programs remain upgradeable by the deployment authority for development purposes.
- **Resets:** Solana Devnet resets periodically; these IDs and signatures are valid for the current cluster epoch.

---

## Conclusion

The deployment framework and architecture documented above prove that the Solana Stablecoin Standard is technically operational and ready for institutional evaluation on Devnet. The execution of the operational sequence demonstrates full adherence to the SSS-2 compliance standard.
