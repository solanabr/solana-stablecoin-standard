import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { Transaction } from '@solana/web3.js';
import { useStablecoin } from '../contexts/StablecoinContext';
import { useToast } from '../contexts/ToastContext';
import {
  getIDL,
  findStatePDA,
  findMintAuthorityPDA,
  findMinterInfoPDA,
  findPermanentDelegatePDA,
  parseAmount,
} from '../lib/program';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import { Coins, Flame, ArrowUp, ArrowDown } from 'lucide-react';

const MintBurn: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { currentMint, stablecoinInfo } = useStablecoin();
  const { addToast } = useToast();

  // Mint form
  const [mintRecipient, setMintRecipient] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [mintLoading, setMintLoading] = useState(false);

  // Burn form
  const [burnFrom, setBurnFrom] = useState('');
  const [burnAmount, setBurnAmount] = useState('');
  const [burnLoading, setBurnLoading] = useState(false);

  const getProgram = () => {
    const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
    return new Program(getIDL(), provider);
  };

  const ensureATA = async (owner: PublicKey) => {
    const mint = new PublicKey(currentMint!);
    const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
    const info = await connection.getAccountInfo(ata);
    if (!info) {
      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey!,
          ata,
          owner,
          mint,
          TOKEN_2022_PROGRAM_ID
        )
      );
      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, 'confirmed');
    }
    return ata;
  };

  const handleMint = async () => {
    if (!currentMint || !mintRecipient.trim() || !mintAmount.trim()) return;
    setMintLoading(true);
    try {
      const program = getProgram();
      const mint = new PublicKey(currentMint);
      const [statePDA] = findStatePDA(mint);
      const [mintAuthority] = findMintAuthorityPDA(statePDA);
      const [minterInfo] = findMinterInfoPDA(statePDA, wallet.publicKey!);

      const recipient = new PublicKey(mintRecipient.trim());
      const recipientAta = await ensureATA(recipient);
      const amount = parseAmount(mintAmount, stablecoinInfo?.decimals || 6);

      const sig = await program.methods
        .mint(amount)
        .accounts({
          minter: wallet.publicKey!,
          state: statePDA,
          mint,
          minterInfo,
          recipientTokenAccount: recipientAta,
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      addToast({
        type: 'success',
        title: `Minted ${mintAmount} ${stablecoinInfo?.symbol || 'tokens'}`,
        txSig: sig,
      });
      setMintAmount('');
    } catch (err: any) {
      addToast({ type: 'error', title: 'Mint failed', message: err.message });
    } finally {
      setMintLoading(false);
    }
  };

  const handleBurn = async () => {
    if (!currentMint || !burnFrom.trim() || !burnAmount.trim()) return;
    setBurnLoading(true);
    try {
      const program = getProgram();
      const mint = new PublicKey(currentMint);
      const [statePDA] = findStatePDA(mint);
      const [permanentDelegate] = findPermanentDelegatePDA(statePDA);

      const from = new PublicKey(burnFrom.trim());
      const fromAta = getAssociatedTokenAddressSync(mint, from, false, TOKEN_2022_PROGRAM_ID);
      const amount = parseAmount(burnAmount, stablecoinInfo?.decimals || 6);

      const sig = await program.methods
        .burn(amount)
        .accounts({
          authority: wallet.publicKey!,
          state: statePDA,
          mint,
          fromTokenAccount: fromAta,
          permanentDelegate,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      addToast({
        type: 'success',
        title: `Burned ${burnAmount} ${stablecoinInfo?.symbol || 'tokens'}`,
        txSig: sig,
      });
      setBurnAmount('');
    } catch (err: any) {
      addToast({ type: 'error', title: 'Burn failed', message: err.message });
    } finally {
      setBurnLoading(false);
    }
  };

  if (!currentMint) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
        Load a stablecoin from the Dashboard first.
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 900 }}>
      {/* Mint Card */}
      <Card
        title="Mint Tokens"
        subtitle="Issue new tokens to a recipient"
        icon={<ArrowUp size={16} color="var(--green)" />}
        accent="var(--green)"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            label="Recipient"
            placeholder="Wallet address"
            value={mintRecipient}
            onChange={(e) => setMintRecipient(e.target.value)}
          />
          <Input
            label="Amount"
            placeholder={`e.g. 1000.00`}
            value={mintAmount}
            onChange={(e) => setMintAmount(e.target.value)}
            hint={`${stablecoinInfo?.symbol || 'tokens'} — ${stablecoinInfo?.decimals || 6} decimals`}
          />
          <div style={styles.quickAmounts}>
            {['100', '1,000', '10,000', '100,000'].map((a) => (
              <button
                key={a}
                onClick={() => setMintAmount(a.replace(/,/g, ''))}
                style={styles.quickBtn}
              >
                {a}
              </button>
            ))}
          </div>
          <Button
            size="lg"
            onClick={handleMint}
            loading={mintLoading}
            disabled={!mintRecipient.trim() || !mintAmount.trim()}
            icon={<Coins size={16} />}
            style={{ width: '100%', background: 'var(--green)', borderColor: 'var(--green)' }}
          >
            Mint {stablecoinInfo?.symbol}
          </Button>
        </div>
      </Card>

      {/* Burn Card */}
      <Card
        title="Burn Tokens"
        subtitle="Burn tokens from an account"
        icon={<Flame size={16} color="var(--red)" />}
        accent="var(--red)"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            label="From Account"
            placeholder="Token owner wallet address"
            value={burnFrom}
            onChange={(e) => setBurnFrom(e.target.value)}
          />
          <Input
            label="Amount"
            placeholder="e.g. 500.00"
            value={burnAmount}
            onChange={(e) => setBurnAmount(e.target.value)}
            hint={`${stablecoinInfo?.symbol || 'tokens'} — requires authority`}
          />
          <div style={styles.quickAmounts}>
            {['100', '1,000', '10,000', '100,000'].map((a) => (
              <button
                key={a}
                onClick={() => setBurnAmount(a.replace(/,/g, ''))}
                style={styles.quickBtn}
              >
                {a}
              </button>
            ))}
          </div>
          <Button
            variant="danger"
            size="lg"
            onClick={handleBurn}
            loading={burnLoading}
            disabled={!burnFrom.trim() || !burnAmount.trim()}
            icon={<Flame size={16} />}
            style={{ width: '100%' }}
          >
            Burn {stablecoinInfo?.symbol}
          </Button>
        </div>
      </Card>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  quickAmounts: {
    display: 'flex',
    gap: 6,
  },
  quickBtn: {
    flex: 1,
    padding: '6px 0',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'var(--transition)',
    fontFamily: 'inherit',
  },
};

export default MintBurn;
