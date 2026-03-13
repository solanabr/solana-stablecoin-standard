const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function utf8Bytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}

export function utf8String(value: Uint8Array): string {
  return textDecoder.decode(value);
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

export function encodeU32LE(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

export function encodeU64LE(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

export function encodeString(value: string): Uint8Array {
  const bytes = utf8Bytes(value);
  return concatBytes([encodeU32LE(bytes.length), bytes]);
}

export function hexEncode(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function readU32LE(data: Uint8Array, offset: number): { value: number; offset: number } {
  return {
    value: new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true),
    offset: offset + 4
  };
}

export function readU64LE(data: Uint8Array, offset: number): { value: bigint; offset: number } {
  return {
    value: new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true),
    offset: offset + 8
  };
}
