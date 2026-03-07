import { PublicKey } from "@solana/web3.js";

/** Switchboard on-demand feed addresses on mainnet */
export const FEED_ADDRESSES = {
  // Fiat pegs
  "USD/USD": new PublicKey("GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR"),
  "USD/BRL": new PublicKey("5wGVJMHH3NHzSS7rFVKkHkHBkDJcWiYkJg4phBnrXzFs"),
  "USD/EUR": new PublicKey("HNStfhaLnqwF2ZtJUizaA9uHDAVB976ZFhXYLbe3jsR5"),
  "USD/GBP": new PublicKey("GdHQNJ7PNsAMQgjYjQfzFjJd6EPLF5TRGt5R2JRSMZJP"),
  // Commodity pegs
  "XAU/USD": new PublicKey("8y3WWjvmSmVGWVKH1rCA7VTRmuU7QbJ9axafSsBX5FcD"),
  // CPI / inflation-indexed (approximated via FRED data bridge)
  "CPI/USD": new PublicKey("6NpdXrQEpmDZ3jZKmM2rhdmkd3H6QAk23j2x8bkXcHKA"),
} as const;

export type FeedSymbol = keyof typeof FEED_ADDRESSES;

/** Devnet feed addresses (Switchboard devnet deployment) */
export const DEVNET_FEED_ADDRESSES: Record<string, PublicKey> = {
  "USD/USD": new PublicKey("GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR"),
  "USD/BRL": new PublicKey("5wGVJMHH3NHzSS7rFVKkHkHBkDJcWiYkJg4phBnrXzFs"),
};
