// proxy.test.ts — schema tests for the proxy parameter (engine selection: basic / stealth / enhanced)

import { scrapeRequestSchema } from "../types";

describe("scrapeRequestSchema — proxy field", () => {
  const base = { url: "https://example.com" };

  it("accepts request with no proxy field (undefined)", () => {
    const result = scrapeRequestSchema.parse(base);
    expect(result.proxy).toBeUndefined();
  });

  it("accepts proxy: basic and passes through", () => {
    const result = scrapeRequestSchema.parse({ ...base, proxy: "basic" });
    expect(result.proxy).toBe("basic");
  });

  it("accepts proxy: stealth and passes through", () => {
    const result = scrapeRequestSchema.parse({ ...base, proxy: "stealth" });
    expect(result.proxy).toBe("stealth");
  });

  it("accepts proxy: enhanced and passes through", () => {
    const result = scrapeRequestSchema.parse({ ...base, proxy: "enhanced" });
    expect(result.proxy).toBe("enhanced");
  });

  it("rejects invalid proxy value (e.g. playwright)", () => {
    expect(() =>
      scrapeRequestSchema.parse({ ...base, proxy: "playwright" })
    ).toThrow();
  });

  it("rejects invalid proxy value (empty string)", () => {
    expect(() =>
      scrapeRequestSchema.parse({ ...base, proxy: "" })
    ).toThrow();
  });

  it("rejects invalid proxy value (random string)", () => {
    expect(() =>
      scrapeRequestSchema.parse({ ...base, proxy: "fetch" })
    ).toThrow();
  });
});
