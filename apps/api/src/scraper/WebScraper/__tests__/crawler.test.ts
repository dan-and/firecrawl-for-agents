// crawler.test.ts
import { WebCrawler } from "../crawler";
import axios from "axios";
import robotsParser from "robots-parser";

jest.mock("axios");
jest.mock("robots-parser");

describe("WebCrawler", () => {
  let crawler: WebCrawler;
  const mockAxios = axios as jest.Mocked<typeof axios>;
  const mockRobotsParser = robotsParser as jest.MockedFunction<
    typeof robotsParser
  >;

  beforeEach(() => {
    // Setup default mocks
    mockAxios.get.mockImplementation((url) => {
      if (url.includes("robots.txt")) {
        return Promise.resolve({ data: "User-agent: *\nAllow: /" });
      } else if (url.includes("sitemap.xml")) {
        return Promise.resolve({ data: "sitemap content" }); // You would normally parse this to URLs
      }
      return Promise.resolve({ data: "<html></html>" });
    });

    mockRobotsParser.mockReturnValue({
      isAllowed: jest.fn().mockReturnValue(true),
      isDisallowed: jest.fn().mockReturnValue(false),
      getMatchingLineNumber: jest.fn().mockReturnValue(0),
      getCrawlDelay: jest.fn().mockReturnValue(0),
      getSitemaps: jest.fn().mockReturnValue([]),
      getPreferredHost: jest.fn().mockReturnValue("example.com"),
    });
  });

  it("should ignore social media and email links", async () => {
    const urlsWhichShouldGetBlocked = [
      "http://facebook.com",
      "http://www.facebook.com",
      "https://facebook.com",
      "https://test.facebook.com",
      "https://en.wikipedia.com/barman",
      "https://docs.mux.com/guides/player",
      "https://mux.com",
      "https://x.com",
    ];

    crawler = new WebCrawler({
      jobId: "TEST",
      initialUrl: "http://example.com",
      includes: [],
      excludes: [],
      limit: 100,
      maxCrawledDepth: 10,
      crawlId: "TEST",
    });

    const filteredLinks = urlsWhichShouldGetBlocked.filter(
      (url) => !crawler.isSocialMediaOrEmail(url),
    );

    expect(filteredLinks).toContain("https://docs.mux.com/guides/player");
    expect(filteredLinks.length).toBe(2);
  });

  describe("regexOnFullUrl", () => {
    const makeOptions = (regexOnFullUrl: boolean, includes: string[]) => ({
      jobId: "TEST",
      initialUrl: "https://example.com",
      includes,
      excludes: [],
      maxCrawledDepth: 10,
      limit: 100,
      allowExternalLinks: false,
      crawlId: "TEST",
      crawlerOptions: {
        includes,
        excludes: [],
        maxDepth: 10,
        limit: 100,
        allowBackwardLinks: false,
        allowExternalLinks: false,
        regexOnFullUrl,
      },
      pageOptions: {},
    });

    it("regexOnFullUrl=true (default): matches domain in pattern against full URL", () => {
      const crawler = new WebCrawler(makeOptions(true, ["example\\.com/blog"]));
      expect(crawler.filterURL("https://example.com/blog/post-1")).toBeTruthy();
      expect(crawler.filterURL("https://example.com/about")).toBeNull();
    });

    it("regexOnFullUrl=false: matches /blog pattern against path only", () => {
      const crawler = new WebCrawler(makeOptions(false, ["/blog"]));
      expect(crawler.filterURL("https://example.com/blog/post-1")).toBeTruthy();
      expect(crawler.filterURL("https://example.com/about")).toBeNull();
    });

    it("regexOnFullUrl=false: domain pattern does NOT match path", () => {
      const crawler = new WebCrawler(makeOptions(false, ["example\\.com/blog"]));
      // Path is /blog/post-1, which does not contain "example.com/blog"
      expect(crawler.filterURL("https://example.com/blog/post-1")).toBeNull();
    });
  });

  describe("sitemapOnly mode", () => {
    const makeCrawlOptions = (sitemapOnly: boolean, ignoreSitemap: boolean) => ({
      jobId: "TEST",
      initialUrl: "https://example.com",
      includes: [],
      excludes: [],
      maxCrawledDepth: 10,
      limit: 100,
      allowExternalLinks: false,
      crawlId: "TEST",
      crawlerOptions: {
        includes: [],
        excludes: [],
        maxDepth: 10,
        limit: 100,
        allowBackwardLinks: false,
        allowExternalLinks: false,
        ignoreSitemap,
        regexOnFullUrl: true,
        sitemapOnly,
      },
      pageOptions: {},
    });

    it("sitemapOnly=false (default) with ignoreSitemap=true: should return empty sitemap", async () => {
      // When ignoreSitemap=true, tryGetSitemap should return null
      const crawler = new WebCrawler(makeCrawlOptions(false, true));
      const result = await crawler.tryGetSitemap();
      // Should be null when ignoreSitemap=true
      expect(result).toBeNull();
    });

    it("sitemapOnly=true with ignoreSitemap=true: should return empty sitemap", async () => {
      // When both ignoreSitemap=true and sitemapOnly=true, no sitemap fetching
      const crawler = new WebCrawler(makeCrawlOptions(true, true));
      const result = await crawler.tryGetSitemap();
      // Should be null since ignoreSitemap=true
      expect(result).toBeNull();
    });

    it("sitemapOnly=true with ignoreSitemap=false: sitemapOnly parameter is accepted", async () => {
      // When sitemapOnly=true, the parameter is accepted (controller behavior differs)
      const crawler = new WebCrawler(makeCrawlOptions(true, false));
      // The crawler tries to fetch sitemap, but we're just confirming
      // the parameter doesn't cause errors
      expect(crawler).toBeDefined();
    });
  });
});
