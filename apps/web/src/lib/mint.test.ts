import { isMintAddress } from "@/lib/mint";

describe("isMintAddress", () => {
  it("accepts valid base58-looking mints", () => {
    expect(isMintAddress("Mint111111111111111111111111111111111111111")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isMintAddress("not-a-mint")).toBe(false);
    expect(isMintAddress("")).toBe(false);
  });
});
