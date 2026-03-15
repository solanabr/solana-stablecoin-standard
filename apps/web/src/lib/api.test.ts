import { serializeEventsQuery, serializeOperationsQuery } from "@/lib/api";

describe("serializeEventsQuery", () => {
  it("serializes supported event filters without mint", () => {
    expect(
      serializeEventsQuery({
        mint: "Mint111",
        event_type: "TokensMinted",
        sort: "block_time",
        order: "asc",
        limit: "50",
        offset: "100",
      }),
    ).toBe("event_type=TokensMinted&sort=block_time&order=asc&limit=50&offset=100");
  });

  it("omits empty values", () => {
    expect(
      serializeEventsQuery({
        mint: "Mint111",
        event_type: "",
        tx_signature: undefined,
      }),
    ).toBe("");
  });
});

describe("serializeOperationsQuery", () => {
  it("serializes operation list filters", () => {
    expect(
      serializeOperationsQuery({
        mint: "Mint111",
        status: "requested",
        type: "mint",
        limit: "25",
        offset: "0",
      }),
    ).toBe("mint=Mint111&status=requested&type=mint&limit=25&offset=0");
  });
});
