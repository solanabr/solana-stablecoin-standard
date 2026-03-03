import { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

export { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID };

export const ROLE = {
  Minter: 0,
  Burner: 1,
  Seizer: 2,
  Pauser: 3,
  ComplianceOfficer: 4,
} as const;
