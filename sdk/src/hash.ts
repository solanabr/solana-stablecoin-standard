import { sha256 } from "@noble/hashes/sha256";

import { concatBytes, hexEncode, utf8Bytes } from "./bytes.js";

function normalizePart(value: Uint8Array | string): Uint8Array {
  return typeof value === "string" ? utf8Bytes(value) : value;
}

export function sha256Bytes(...parts: Array<Uint8Array | string>): Uint8Array {
  return Uint8Array.from(sha256(concatBytes(parts.map(normalizePart))));
}

export function sha256Hex(...parts: Array<Uint8Array | string>): string {
  return hexEncode(sha256Bytes(...parts));
}

export function anchorDiscriminator(name: string): Uint8Array {
  return sha256Bytes(`global:${name}`).slice(0, 8);
}

export function interfaceDiscriminator(name: string): Uint8Array {
  return sha256Bytes(name).slice(0, 8);
}
