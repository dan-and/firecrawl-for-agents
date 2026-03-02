// crawlRedis.test.ts — unit tests for normalizeURL
import { normalizeURL, StoredCrawl } from "../crawl-redis";

const makeSC = (ignoreQueryParameters: boolean): StoredCrawl => ({
  originUrl: "https://example.com",
  crawlerOptions: { ignoreQueryParameters },
  pageOptions: {},
  team_id: "test",
  plan: "standard",
  createdAt: Date.now(),
});

describe("normalizeURL", () => {
  describe("ignoreQueryParameters=false (default)", () => {
    it("preserves query parameters when ignoreQueryParameters is false", () => {
      const sc = makeSC(false);
      const result = normalizeURL("https://example.com/page?foo=1&bar=2", sc);
      expect(new URL(result).search).toBe("?foo=1&bar=2");
    });

    it("preserves query parameters when crawlerOptions is absent", () => {
      const sc: StoredCrawl = {
        originUrl: "https://example.com",
        crawlerOptions: null,
        pageOptions: {},
        team_id: "test",
        plan: "standard",
        createdAt: Date.now(),
      };
      const result = normalizeURL("https://example.com/page?foo=1", sc);
      expect(new URL(result).search).toBe("?foo=1");
    });
  });

  describe("ignoreQueryParameters=true", () => {
    it("strips query parameters when ignoreQueryParameters is true", () => {
      const sc = makeSC(true);
      const result = normalizeURL("https://example.com/page?foo=1&bar=2", sc);
      expect(new URL(result).search).toBe("");
    });

    it("leaves URL unchanged when there are no query parameters", () => {
      const sc = makeSC(true);
      const result = normalizeURL("https://example.com/page", sc);
      expect(result).toBe("https://example.com/page");
    });

    it("two URLs differing only in query params normalise to the same value", () => {
      const sc = makeSC(true);
      const a = normalizeURL("https://example.com/page?page=1", sc);
      const b = normalizeURL("https://example.com/page?page=2", sc);
      expect(a).toBe(b);
    });
  });

  describe("hash handling (SPA route preservation)", () => {
    it("strips plain fragment hashes", () => {
      const sc = makeSC(false);
      const result = normalizeURL("https://example.com/page#section", sc);
      expect(new URL(result).hash).toBe("");
    });

    it("strips short hashes (length <= 2)", () => {
      const sc = makeSC(false);
      const result = normalizeURL("https://example.com/page##", sc);
      expect(new URL(result).hash).toBe("");
    });

    it("preserves #/ SPA hash routes", () => {
      const sc = makeSC(false);
      const result = normalizeURL("https://example.com/app#/dashboard", sc);
      expect(new URL(result).hash).toBe("#/dashboard");
    });

    it("preserves #!/ SPA hash routes", () => {
      const sc = makeSC(false);
      const result = normalizeURL("https://example.com/app#!/settings", sc);
      expect(new URL(result).hash).toBe("#!/settings");
    });

    it("strips query params AND preserves SPA hash when both apply", () => {
      const sc = makeSC(true);
      const result = normalizeURL("https://example.com/app?foo=1#/route", sc);
      const u = new URL(result);
      expect(u.search).toBe("");
      expect(u.hash).toBe("#/route");
    });
  });
});
