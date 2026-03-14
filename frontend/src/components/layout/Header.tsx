import { Coins, LogOut } from 'lucide-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { shortAddress } from '../../lib/format';
import type { Environment, OperatorSigner } from '../../app/types';

interface HeaderProps {
  environment: Environment;
  walletAddress: string | null;
  operatorSigner: OperatorSigner | null;
  clearOperatorSigner: () => void;
}

export function Header({
  environment,
  walletAddress,
  operatorSigner,
  clearOperatorSigner,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-white/10 bg-black/20 px-6 backdrop-blur-2xl md:px-8">
      <div className="flex items-center gap-3 text-emerald-400 md:hidden">
        <Coins className="h-6 w-6" />
        <span className="text-xl font-bold">SSS</span>
      </div>
      <div className="hidden items-center gap-4 md:flex">
        <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          {environment}
        </div>
        {walletAddress ? <Badge variant="success">Wallet {shortAddress(walletAddress)}</Badge> : null}
        {operatorSigner ? <Badge variant="warning">Operator {operatorSigner.label}</Badge> : null}
      </div>
      <div className="flex items-center gap-3">
        {operatorSigner ? (
          <Button variant="secondary" className="hidden md:inline-flex" onClick={clearOperatorSigner}>
            <LogOut className="mr-2 h-4 w-4" />
            Clear Operator
          </Button>
        ) : null}
        <WalletMultiButton />
      </div>
    </header>
  );
}
