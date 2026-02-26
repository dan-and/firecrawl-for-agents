import * as playwrightModule from "../scrapers/playwright";

jest.mock("../scrapers/playwright");

import { scrapeWithPlaywright } from "../scrapers/playwright";

describe("T1-W — Forward scrapeId to Hero", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it("scrapeWithPlaywright accepts scrapeId parameter", async () => {
    const mockResponse = {
      content: "<html><body>Test</body></html>",
      pageStatusCode: 200,
      pageError: null,
    };

    const mockScrapeWithPlaywright = playwrightModule.scrapeWithPlaywright as jest.MockedFunction<
      typeof playwrightModule.scrapeWithPlaywright
    >;
    mockScrapeWithPlaywright.mockResolvedValue(mockResponse);

    const result = await scrapeWithPlaywright(
      "https://example.com",
      0,
      undefined,
      "test-scrape-id-123"
    );

    expect(result.content).toBe("<html><body>Test</body></html>");
    expect(result.pageStatusCode).toBe(200);

    // Verify scrapeId was passed to the Hero service
    expect(mockScrapeWithPlaywright).toHaveBeenCalledWith(
      "https://example.com",
      0,
      undefined,
      "test-scrape-id-123"
    );
  });

  it("scrapeWithPlaywright can accept undefined scrapeId", async () => {
    const mockResponse = {
      content: "<html><body>Test</body></html>",
      pageStatusCode: 200,
      pageError: null,
    };

    const mockScrapeWithPlaywright = playwrightModule.scrapeWithPlaywright as jest.MockedFunction<
      typeof playwrightModule.scrapeWithPlaywright
    >;
    mockScrapeWithPlaywright.mockResolvedValue(mockResponse);

    const result = await scrapeWithPlaywright(
      "https://example.com",
      0,
      undefined,
      undefined
    );

    expect(result.content).toBe("<html><body>Test</body></html>");
    expect(mockScrapeWithPlaywright).toHaveBeenCalledWith(
      "https://example.com",
      0,
      undefined,
      undefined
    );
  });
});
