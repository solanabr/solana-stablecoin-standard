import { readFile } from "node:fs/promises";

export interface AnchorIdl {
  address?: string;
  metadata?: Record<string, unknown>;
  instructions?: Array<Record<string, unknown>>;
}

export async function loadIdl(path: string): Promise<AnchorIdl> {
  const file = await readFile(path, "utf8");
  return JSON.parse(file) as AnchorIdl;
}
