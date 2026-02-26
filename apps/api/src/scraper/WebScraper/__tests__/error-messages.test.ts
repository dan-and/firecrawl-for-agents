import * as fetchModule from "../scrapers/fetch";
import * as playwrightModule from "../scrapers/playwright";

jest.mock("../scrapers/fetch");
jest.mock("../scrapers/playwright");

import { scrapeSingleUrl } from "../single_url";

describe("T1-Z — Improved user-facing error messages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it("T1-Y error messages should be human-readable and not begin with '(Internal server error)'", async () => {
    // Mock fetch to always fail
    const mockFetch = fetchModule.scrapeWithFetch as jest.MockedFunction<
      typeof fetchModule.scrapeWithFetch
    >;
    mockFetch.mockResolvedValue({
      content: "",
      pageStatusCode: 0,
      pageError: "Connection refused by example.com",
    });

    // Mock playwright to not be configured
    delete process.env.PLAYWRIGHT_MICROSERVICE_URL;

    const { scrapeSingleUrl } = await import("../single_url");

    try {
      await scrapeSingleUrl("https://example.com", { includeMarkdown: false });
      // Expected to throw
    } catch (error) {
      const errorMessage = (error as Error).message;

      // The error should NOT begin with "(Internal server error)"
      expect(errorMessage).not.toMatch(/^\(Internal server error\)/);

      // The error should mention what was tried
      expect(errorMessage).toMatch(/Tried:/);

      // The error should mention Hero configuration when not set
      expect(errorMessage).toMatch(/PLAYWRIGHT_MICROSERVICE_URL/);
    }
  });

  it("T1-Y error messages should work when Hero IS configured", async () => {
    // Mock fetch to fail
    const mockFetch = fetchModule.scrapeWithFetch as jest.MockedFunction<
      typeof fetchModule.scrapeWithFetch
    >;
    mockFetch.mockResolvedValue({
      content: "",
      pageStatusCode: 0,
      pageError: "DNS lookup failed",
    });

    // Mock playwright to be configured
    process.env.PLAYWRIGHT_MICROSERVICE_URL = "http://localhost:3003";

    const { scrapeSingleUrl } = await import("../single_url");

    try {
      await scrapeSingleUrl("https://example.com", { includeMarkdown: false });
      // Expected to throw
    } catch (error) {
      const errorMessage = (error as Error).message;

      // The error should NOT begin with "(Internal server error)"
      expect(errorMessage).not.toMatch(/^\(Internal server error\)/);

      // The error should mention what was tried
      expect(errorMessage).toMatch(/Tried:/);

      // The error should suggest checking the site's automation blocking
      expect(errorMessage).toMatch(/blocking automated requests/);
    }
  });

  it("T1-Y error message should be helpful when scraping succeeds", async () => {
    // Mock fetch to succeed
    const mockFetch = fetchModule.scrapeWithFetch as jest.MockedFunction<
      typeof fetchModule.scrapeWithFetch
    >;
    mockFetch.mockResolvedValue({
      content: "<p>Success</p>",
      pageStatusCode: 200,
      pageError: null,
    });

    const { scrapeSingleUrl } = await import("../single_url");

    // Scraping should succeed without throwing
    expect(async () => {
      await scrapeSingleUrl("https://example.com", { includeMarkdown: false });
    }).not.toThrow();
  });
});
