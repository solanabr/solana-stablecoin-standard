import { PublicKey } from "@solana/web3.js";

// Pyth price feed addresses — Mainnet Beta
export const PYTH_FEEDS_MAINNET: Record<string, PublicKey> = {
  "USDC/USD": new PublicKey("Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD"),
  "USDT/USD": new PublicKey("3vxLXJqLqF3JG5TCbYycbKWRBbCJQLxQmBGCkyqEEefL"),
  "SOL/USD": new PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"),
  "BTC/USD": new PublicKey("GVXRSBjFk6e6J3NbVPXbvvaHbaNRoKwFVZSAkMQwCi9p"),
  "ETH/USD": new PublicKey("JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB"),
};

// Pyth price feed addresses — Devnet
export const PYTH_FEEDS_DEVNET: Record<string, PublicKey> = {
  "USDC/USD": new PublicKey("5SSkXsEKQepHHAewytPVwdej4epN1nxgLVM84L4KXgy7"),
  "USDT/USD": new PublicKey("38xoQ4oeJCBrcVvca2cGk7iV1dAfrmTR1kmhSCJQ8Jto"),
  "SOL/USD": new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix"),
};
