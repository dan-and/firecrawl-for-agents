// crawlerOptions.test.ts — unit tests for crawlerOptions schema and legacyCrawlerOptions mapper
import {
  crawlRequestSchema,
  mapRequestSchema,
  legacyCrawlerOptions,
  CrawlerOptions,
} from "../types";

describe("crawlRequestSchema — new crawler option fields", () => {
  const base = { url: "https://example.com" };

  describe("ignoreQueryParameters", () => {
    it("defaults to false for crawl", () => {
      const result = crawlRequestSchema.parse(base);
      expect(result.ignoreQueryParameters).toBe(false);
    });

    it("accepts ignoreQueryParameters=true", () => {
      const result = crawlRequestSchema.parse({ ...base, ignoreQueryParameters: true });
      expect(result.ignoreQueryParameters).toBe(true);
    });

    it("accepts ignoreQueryParameters=false explicitly", () => {
      const result = crawlRequestSchema.parse({ ...base, ignoreQueryParameters: false });
      expect(result.ignoreQueryParameters).toBe(false);
    });
  });

  describe("maxDiscoveryDepth", () => {
    it("is undefined by default", () => {
      const result = crawlRequestSchema.parse(base);
      expect(result.maxDiscoveryDepth).toBeUndefined();
    });

    it("accepts maxDiscoveryDepth=0 (seed URL only)", () => {
      const result = crawlRequestSchema.parse({ ...base, maxDiscoveryDepth: 0 });
      expect(result.maxDiscoveryDepth).toBe(0);
    });

    it("accepts positive integer values", () => {
      const result = crawlRequestSchema.parse({ ...base, maxDiscoveryDepth: 3 });
      expect(result.maxDiscoveryDepth).toBe(3);
    });

    it("rejects negative values", () => {
      expect(() =>
        crawlRequestSchema.parse({ ...base, maxDiscoveryDepth: -1 }),
      ).toThrow();
    });

    it("rejects non-integer values", () => {
      expect(() =>
        crawlRequestSchema.parse({ ...base, maxDiscoveryDepth: 1.5 }),
      ).toThrow();
    });
  });

  describe("currentDiscoveryDepth", () => {
    it("is undefined by default", () => {
      const result = crawlRequestSchema.parse(base);
      expect(result.currentDiscoveryDepth).toBeUndefined();
    });

    it("accepts currentDiscoveryDepth=0", () => {
      const result = crawlRequestSchema.parse({ ...base, currentDiscoveryDepth: 0 });
      expect(result.currentDiscoveryDepth).toBe(0);
    });
  });
});

describe("mapRequestSchema — ignoreQueryParameters", () => {
  const base = { url: "https://example.com" };

  it("defaults to true for map (asymmetric default)", () => {
    const result = mapRequestSchema.parse(base);
    expect(result.ignoreQueryParameters).toBe(true);
  });

  it("accepts ignoreQueryParameters=false explicitly", () => {
    const result = mapRequestSchema.parse({ ...base, ignoreQueryParameters: false });
    expect(result.ignoreQueryParameters).toBe(false);
  });
});

describe("legacyCrawlerOptions mapper", () => {
  const makeOptions = (overrides: Partial<CrawlerOptions> = {}): CrawlerOptions => ({
    includePaths: [],
    excludePaths: [],
    maxDepth: 10,
    limit: 10000,
    allowBackwardLinks: false,
    allowExternalLinks: false,
    ignoreSitemap: true,
    regexOnFullUrl: true,
    sitemapOnly: false,
    ignoreQueryParameters: false,
    ...overrides,
  });

  it("passes through ignoreQueryParameters=false", () => {
    const result = legacyCrawlerOptions(makeOptions({ ignoreQueryParameters: false }));
    expect(result.ignoreQueryParameters).toBe(false);
  });

  it("passes through ignoreQueryParameters=true", () => {
    const result = legacyCrawlerOptions(makeOptions({ ignoreQueryParameters: true }));
    expect(result.ignoreQueryParameters).toBe(true);
  });

  it("passes through maxDiscoveryDepth when set", () => {
    const result = legacyCrawlerOptions(makeOptions({ maxDiscoveryDepth: 2 }));
    expect(result.maxDiscoveryDepth).toBe(2);
  });

  it("passes through maxDiscoveryDepth=0", () => {
    const result = legacyCrawlerOptions(makeOptions({ maxDiscoveryDepth: 0 }));
    expect(result.maxDiscoveryDepth).toBe(0);
  });

  it("passes through maxDiscoveryDepth=undefined", () => {
    const result = legacyCrawlerOptions(makeOptions({ maxDiscoveryDepth: undefined }));
    expect(result.maxDiscoveryDepth).toBeUndefined();
  });

  it("defaults currentDiscoveryDepth to 0 when not provided", () => {
    const result = legacyCrawlerOptions(makeOptions({ currentDiscoveryDepth: undefined }));
    expect(result.currentDiscoveryDepth).toBe(0);
  });

  it("passes through explicit currentDiscoveryDepth value", () => {
    const result = legacyCrawlerOptions(makeOptions({ currentDiscoveryDepth: 3 }));
    expect(result.currentDiscoveryDepth).toBe(3);
  });
});
