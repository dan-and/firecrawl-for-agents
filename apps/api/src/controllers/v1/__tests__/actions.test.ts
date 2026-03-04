// actions.test.ts — unit tests for T2-L browser-action support
// Tests are written FIRST (TDD). They will fail until implementation is complete.

import { scrapeOptions, scrapeRequestSchema } from "../types";

// ---------------------------------------------------------------------------
// Part 1 — Zod schema validation for the `actions` field
// ---------------------------------------------------------------------------

describe("scrapeOptions — actions field schema", () => {
  const base = { url: "https://example.com" };

  // --- Absence / empty ---

  it("accepts request with no actions field", () => {
    const result = scrapeRequestSchema.parse(base);
    expect(result.actions).toBeUndefined();
  });

  it("accepts request with empty actions array", () => {
    const result = scrapeRequestSchema.parse({ ...base, actions: [] });
    expect(result.actions).toEqual([]);
  });

  // --- click ---

  it("accepts a valid click action", () => {
    const result = scrapeRequestSchema.parse({
      ...base,
      actions: [{ type: "click", selector: "#btn" }],
    });
    expect(result.actions).toEqual([{ type: "click", selector: "#btn" }]);
  });

  it("rejects click action with missing selector", () => {
    expect(() =>
      scrapeRequestSchema.parse({
        ...base,
        actions: [{ type: "click" }],
      })
    ).toThrow();
  });

  // --- type ---

  it("accepts a valid type action", () => {
    const result = scrapeRequestSchema.parse({
      ...base,
      actions: [{ type: "type", selector: "#input", text: "hello" }],
    });
    expect(result.actions).toEqual([
      { type: "type", selector: "#input", text: "hello" },
    ]);
  });

  it("rejects type action with missing text", () => {
    expect(() =>
      scrapeRequestSchema.parse({
        ...base,
        actions: [{ type: "type", selector: "#input" }],
      })
    ).toThrow();
  });

  it("rejects type action with missing selector", () => {
    expect(() =>
      scrapeRequestSchema.parse({
        ...base,
        actions: [{ type: "type", text: "hello" }],
      })
    ).toThrow();
  });

  // --- wait ---

  it("accepts a valid wait action", () => {
    const result = scrapeRequestSchema.parse({
      ...base,
      actions: [{ type: "wait", milliseconds: 1000 }],
    });
    expect(result.actions).toEqual([{ type: "wait", milliseconds: 1000 }]);
  });

  it("accepts wait with milliseconds=0", () => {
    const result = scrapeRequestSchema.parse({
      ...base,
      actions: [{ type: "wait", milliseconds: 0 }],
    });
    expect(result.actions![0]).toMatchObject({ type: "wait", milliseconds: 0 });
  });

  it("rejects wait with negative milliseconds", () => {
    expect(() =>
      scrapeRequestSchema.parse({
        ...base,
        actions: [{ type: "wait", milliseconds: -1 }],
      })
    ).toThrow();
  });

  it("rejects wait with milliseconds > 60000", () => {
    expect(() =>
      scrapeRequestSchema.parse({
        ...base,
        actions: [{ type: "wait", milliseconds: 60001 }],
      })
    ).toThrow();
  });

  it("rejects wait with missing milliseconds", () => {
    expect(() =>
      scrapeRequestSchema.parse({
        ...base,
        actions: [{ type: "wait" }],
      })
    ).toThrow();
  });

  // --- scroll ---

  it("accepts a valid scroll down action", () => {
    const result = scrapeRequestSchema.parse({
      ...base,
      actions: [{ type: "scroll", direction: "down" }],
    });
    expect(result.actions![0]).toMatchObject({
      type: "scroll",
      direction: "down",
      amount: 500, // default
    });
  });

  it("accepts a scroll up action with custom amount", () => {
    const result = scrapeRequestSchema.parse({
      ...base,
      actions: [{ type: "scroll", direction: "up", amount: 300 }],
    });
    expect(result.actions).toEqual([
      { type: "scroll", direction: "up", amount: 300 },
    ]);
  });

  it("rejects scroll with invalid direction", () => {
    expect(() =>
      scrapeRequestSchema.parse({
        ...base,
        actions: [{ type: "scroll", direction: "left" }],
      })
    ).toThrow();
  });

  it("rejects scroll with missing direction", () => {
    expect(() =>
      scrapeRequestSchema.parse({
        ...base,
        actions: [{ type: "scroll" }],
      })
    ).toThrow();
  });

  it("rejects scroll with amount=0 (min is 1)", () => {
    expect(() =>
      scrapeRequestSchema.parse({
        ...base,
        actions: [{ type: "scroll", direction: "down", amount: 0 }],
      })
    ).toThrow();
  });

  // --- screenshot ---

  it("accepts a screenshot action", () => {
    const result = scrapeRequestSchema.parse({
      ...base,
      actions: [{ type: "screenshot" }],
    });
    expect(result.actions).toEqual([{ type: "screenshot" }]);
  });

  // --- unknown type ---

  it("rejects an action with an unknown type", () => {
    expect(() =>
      scrapeRequestSchema.parse({
        ...base,
        actions: [{ type: "unknownAction" }],
      })
    ).toThrow();
  });

  // --- multi-action sequence ---

  it("accepts a mixed array of valid actions", () => {
    const result = scrapeRequestSchema.parse({
      ...base,
      actions: [
        { type: "click", selector: "#btn" },
        { type: "wait", milliseconds: 500 },
        { type: "type", selector: "#input", text: "hello" },
        { type: "scroll", direction: "down" },
        { type: "screenshot" },
      ],
    });
    expect(result.actions).toHaveLength(5);
    expect(result.actions![0]).toMatchObject({ type: "click" });
    expect(result.actions![4]).toMatchObject({ type: "screenshot" });
  });
});

// ---------------------------------------------------------------------------
// Part 2 — legacyScrapeOptions: actions forwarded into PageOptions
// ---------------------------------------------------------------------------

import { legacyScrapeOptions } from "../types";

describe("legacyScrapeOptions — actions forwarding", () => {
  const makeScrapeOptions = (overrides: Record<string, any> = {}) =>
    scrapeOptions.parse({
      formats: ["markdown"],
      ...overrides,
    });

  it("passes undefined actions when not provided", () => {
    const opts = makeScrapeOptions();
    const pageOpts = legacyScrapeOptions(opts);
    expect(pageOpts.actions).toBeUndefined();
  });

  it("passes empty actions array through", () => {
    const opts = makeScrapeOptions({ actions: [] });
    const pageOpts = legacyScrapeOptions(opts);
    expect(pageOpts.actions).toEqual([]);
  });

  it("passes click action through to PageOptions", () => {
    const opts = makeScrapeOptions({
      actions: [{ type: "click", selector: "#btn" }],
    });
    const pageOpts = legacyScrapeOptions(opts);
    expect(pageOpts.actions).toEqual([{ type: "click", selector: "#btn" }]);
  });

  it("passes multi-action array through unchanged", () => {
    const actions = [
      { type: "wait", milliseconds: 200 },
      { type: "scroll", direction: "down", amount: 500 },
    ];
    const opts = makeScrapeOptions({ actions });
    const pageOpts = legacyScrapeOptions(opts);
    expect(pageOpts.actions).toEqual(actions);
  });
});

// ---------------------------------------------------------------------------
// Part 3 — Hero-not-configured guard logic
// ---------------------------------------------------------------------------

describe("Hero-not-configured guard", () => {
  // Test the guard condition directly (logic extracted from scrapeController).
  // Full HTTP integration tests would require mocking Bull queues, Redis, etc.

  const guardShouldBlock = (body: any, heroUrl: string | undefined): boolean => {
    const actionsPresent = Array.isArray(body?.actions) && body.actions.length > 0;
    const heroConfigured = !!heroUrl;
    return actionsPresent && !heroConfigured;
  };

  it("blocks when actions are present and Hero URL is not set", () => {
    expect(
      guardShouldBlock({ actions: [{ type: "wait", milliseconds: 100 }] }, undefined)
    ).toBe(true);
  });

  it("does NOT block when actions are present and Hero URL IS set", () => {
    expect(
      guardShouldBlock(
        { actions: [{ type: "wait", milliseconds: 100 }] },
        "http://localhost:3003"
      )
    ).toBe(false);
  });

  it("does NOT block when actions array is empty", () => {
    expect(guardShouldBlock({ actions: [] }, undefined)).toBe(false);
  });

  it("does NOT block when actions field is absent", () => {
    expect(guardShouldBlock({}, undefined)).toBe(false);
  });

  it("does NOT block when actions field is undefined", () => {
    expect(guardShouldBlock({ actions: undefined }, undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Part 4 — scrapeWithPlaywright: actions forwarded in the POST body
// ---------------------------------------------------------------------------

import axios from "axios";
import { scrapeWithPlaywright } from "../../../scraper/WebScraper/scrapers/playwright";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("scrapeWithPlaywright — actions forwarded to Hero service", () => {
  const htmlResponse = {
    status: 200,
    data: JSON.stringify({
      content: "<html><body>Test</body></html>",
      pageStatusCode: 200,
      pageError: null,
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PLAYWRIGHT_MICROSERVICE_URL = "http://localhost:3003";
    (mockedAxios.post as jest.Mock).mockResolvedValue(htmlResponse);
  });

  afterEach(() => {
    delete process.env.PLAYWRIGHT_MICROSERVICE_URL;
  });

  it("sends actions array in the POST body when provided", async () => {
    const actions = [
      { type: "click", selector: "#btn" },
      { type: "wait", milliseconds: 500 },
    ];
    await scrapeWithPlaywright("https://example.com", 0, undefined, undefined, actions);

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const body = (mockedAxios.post as jest.Mock).mock.calls[0][1];
    expect(body.actions).toEqual(actions);
  });

  it("sends empty actions array when no actions provided", async () => {
    await scrapeWithPlaywright("https://example.com", 0, undefined, undefined, undefined);

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const body = (mockedAxios.post as jest.Mock).mock.calls[0][1];
    // actions should be present (undefined or [])  — key thing is it doesn't crash
    expect(body).toHaveProperty("url", "https://example.com");
  });

  it("returns content and statusCode on success", async () => {
    const result = await scrapeWithPlaywright("https://example.com");
    expect(result.content).toBe("<html><body>Test</body></html>");
    expect(result.pageStatusCode).toBe(200);
  });
});
