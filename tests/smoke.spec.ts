import { strict as assert } from 'assert';
import { Keypair, PublicKey } from '@solana/web3.js';

describe('workspace smoke', () => {
  it('derives stablecoin pda deterministically', () => {
    const programId = new PublicKey('AmBgA4sV1xFrT4BwbqUU3P3cFqLa6yNJmHyX98k4eW1j');
    const authority = Keypair.generate().publicKey;
    const symbol = 'SSS';

    const [first] = PublicKey.findProgramAddressSync(
      [Buffer.from('stablecoin'), authority.toBuffer(), Buffer.from(symbol)],
      programId,
    );
    const [second] = PublicKey.findProgramAddressSync(
      [Buffer.from('stablecoin'), authority.toBuffer(), Buffer.from(symbol)],
      programId,
    );

    assert.equal(first.toBase58(), second.toBase58());
  });

  it('derives role registry pda deterministically', () => {
    const programId = new PublicKey('AmBgA4sV1xFrT4BwbqUU3P3cFqLa6yNJmHyX98k4eW1j');
    const config = Keypair.generate().publicKey;

    const [first] = PublicKey.findProgramAddressSync(
      [Buffer.from('role_registry'), config.toBuffer()],
      programId,
    );
    const [second] = PublicKey.findProgramAddressSync(
      [Buffer.from('role_registry'), config.toBuffer()],
      programId,
    );

    assert.equal(first.toBase58(), second.toBase58());
  });
});
