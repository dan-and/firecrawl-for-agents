import { Request, Response } from "express";
import { z } from "zod";
import { PageOptions } from "../../lib/entities";
import { protocolIncluded, checkUrl } from "../../lib/validateUrl";
import { PlanType } from "../../types";

export type Format = "markdown" | "html" | "rawHtml" | "links" | "screenshot";

export const url = z.preprocess(
  (x) => {
    if (!protocolIncluded(x as string)) {
      return `http://${x}`;
    }
    return x;
  },
  z
    .string()
    .regex(/^https?:\/\//, "URL uses unsupported protocol")
    .refine((x) => {
      try {
        checkUrl(x as string);
        return true;
      } catch (error) {
        throw error;
      }
    })
);

const strictMessage =
  "Unrecognized key in body -- please review the v1 API documentation for request body changes";

export const extractOptions = z
  .object({
    mode: z.enum(["llm"]).default("llm"),
    schema: z.any().optional(),
    systemPrompt: z
      .string()
      .default(
        "Based on the information on the page, extract all the information from the schema. Try to extract all the fields even those that might not be marked as required."
      ),
    prompt: z.string().optional(),
  })
  .strict(strictMessage);

export type ExtractOptions = z.infer<typeof extractOptions>;

export type ScrapeAction = any;

export const scrapeOptions = z
  .object({
    formats: z
      .enum(["markdown", "html", "rawHtml", "links", "screenshot"])
      .array()
      .optional()
      .default(["markdown"]),
    headers: z.record(z.string(), z.string()).optional(),
    includeTags: z.string().array().optional(),
    excludeTags: z.string().array().optional(),
    onlyMainContent: z.boolean().default(true),
    timeout: z.number().int().positive().finite().safe().default(30000),
    waitFor: z.number().int().nonnegative().finite().safe().default(0),
    extract: extractOptions.optional(),
    proxy: z.enum(["basic", "stealth", "enhanced"]).optional(),
    actions: z.array(z.any()).optional(), // Array of browser action objects
    minAge: z.number().int().min(0).optional(),
  })
  .strict(strictMessage);

export type ScrapeOptions = z.infer<typeof scrapeOptions>;

export const scrapeRequestSchema = scrapeOptions
  .extend({
    url,
    origin: z.string().optional().default("api"),
    webhookUrls: z.string().url().array().optional(),
    metadata: z.any().optional(),
  })
  .strict(strictMessage);

export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>;

export const bulkScrapeRequestSchema = scrapeOptions.extend({
  urls: url.array().min(1, "At least one URL is required"),
  origin: z.string().optional().default("api"),
}).strict(strictMessage);

export type BulkScrapeRequest = z.infer<typeof bulkScrapeRequestSchema>;

const crawlerOptions = z
  .object({
    includePaths: z.string().array().default([]),
    excludePaths: z.string().array().default([]),
    maxDepth: z.number().default(10),
    limit: z.number().default(10000),
    allowBackwardLinks: z.boolean().default(false),
    allowExternalLinks: z.boolean().default(false),
    ignoreSitemap: z.boolean().default(true),
    regexOnFullUrl: z.boolean().default(true), // true = match against full URL, false = path only
    sitemapOnly: z.boolean().default(false), // only scrape URLs from sitemap, fallback to single URL if no sitemap
    maxDiscoveryDepth: z.number().int().min(0).optional(), // max link-hops from seed URL (hop-based, not path-based)
    currentDiscoveryDepth: z.number().int().min(0).optional(), // internal: current hop depth, incremented per child job
    ignoreQueryParameters: z.boolean().default(false), // treat URLs differing only in query params as duplicates
  })
  .strict(strictMessage);

export type CrawlerOptions = z.infer<typeof crawlerOptions>;

export const crawlRequestSchema = crawlerOptions
  .extend({
    url,
    origin: z.string().optional().default("api"),
    scrapeOptions: scrapeOptions.omit({ timeout: true }).default({}),
    webhookUrls: z.string().url().array().optional(),
    webhookMetadata: z.any().optional(),
    limit: z.number().default(10000),
  })
  .strict(strictMessage);

export type CrawlRequest = z.infer<typeof crawlRequestSchema>;

export const mapRequestSchema = crawlerOptions
  .extend({
    url,
    origin: z.string().optional().default("api"),
    includeSubdomains: z.boolean().default(true),
    search: z.string().optional(),
    ignoreSitemap: z.boolean().default(true),
    ignoreCache: z.boolean().default(false),
    ignoreQueryParameters: z.boolean().default(true), // default true for map (deduplicate query-param variants)
    limit: z.number().min(1).max(5000).default(5000).optional(),
  })
  .strict(strictMessage);

export type MapRequest = z.infer<typeof mapRequestSchema>;

export type Document = {
  markdown?: string;
  extract?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  screenshot?: string;
  metadata: {
    title?: string;
    description?: string;
    language?: string;
    keywords?: string;
    robots?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogUrl?: string;
    ogImage?: string;
    ogAudio?: string;
    ogDeterminer?: string;
    ogLocale?: string;
    ogLocaleAlternate?: string[];
    ogSiteName?: string;
    ogVideo?: string;
    dcTermsCreated?: string;
    dcDateCreated?: string;
    dcDate?: string;
    dcTermsType?: string;
    dcType?: string;
    dcTermsAudience?: string;
    dcTermsSubject?: string;
    dcSubject?: string;
    dcDescription?: string;
    dcTermsKeywords?: string;
    modifiedTime?: string;
    publishedTime?: string;
    articleTag?: string;
    articleSection?: string;
    sourceURL?: string;
    statusCode?: number;
    scrapeId?: string;
    error?: string;
  };
};

export type ErrorResponse = {
  success: false;
  error: string;
  details?: any;
};

export type ScrapeResponse =
  | ErrorResponse
  | {
      success: true;
      warning?: string;
      data: Document;
      scrape_id?: string;
    };

export interface ScrapeResponseRequestTest {
  statusCode: number;
  body: ScrapeResponse;
  error?: string;
}

export type CrawlResponse =
  | ErrorResponse
  | {
      success: true;
      id: string;
      url: string;
    };

export type MapResponse =
  | ErrorResponse
  | {
      success: true;
      links: string[];
      scrape_id?: string;
    };

export type CrawlStatusParams = {
  jobId: string;
};

export type CrawlStatusResponse =
  | ErrorResponse
  | {
      success: true;
      status: "scraping" | "completed" | "failed" | "cancelled";
      completed: number;
      total: number;
      expiresAt: string;
      next?: string;
      data: Document[];
    };

type AuthObject = {
  team_id: string;
  plan: PlanType;
};

export interface RequestWithMaybeAuth<
  ReqParams = {},
  ReqBody = undefined,
  ResBody = undefined
> extends Request<ReqParams, ReqBody, ResBody> {
  auth?: AuthObject;
}

export interface RequestWithAuth<
  ReqParams = {},
  ReqBody = undefined,
  ResBody = undefined
> extends Request<ReqParams, ReqBody, ResBody> {
  auth: AuthObject;
}

export interface ResponseWithSentry<ResBody = undefined>
  extends Response<ResBody> {
  sentry?: string;
}

export function legacyCrawlerOptions(x: CrawlerOptions) {
  return {
    includes: x.includePaths,
    excludes: x.excludePaths,
    maxCrawledLinks: x.limit,
    maxDepth: x.maxDepth,
    limit: x.limit,
    allowExternalLinks: x.allowExternalLinks,
    regexOnFullUrl: x.regexOnFullUrl,
    sitemapOnly: x.sitemapOnly,
    maxDiscoveryDepth: x.maxDiscoveryDepth,
    currentDiscoveryDepth: x.currentDiscoveryDepth ?? 0,
    ignoreQueryParameters: x.ignoreQueryParameters,
  };
}

export function legacyScrapeOptions(x: ScrapeOptions): PageOptions {
  return {
    includeMarkdown: x.formats.includes("markdown"),
    includeHtml: x.formats.includes("html"),
    includeRawHtml: x.formats.includes("rawHtml"),
    includeLinks: x.formats.includes("links"),
    onlyIncludeTags: x.includeTags,
    removeTags: x.excludeTags,
    onlyMainContent: x.onlyMainContent,
    waitFor: x.waitFor,
    headers: x.headers,
    screenshot: x.formats.includes("screenshot"),
    proxy: x.proxy,
    actions: x.actions,
    minAge: x.minAge,
  };
}

export function legacyDocumentConverter(doc: any): Document {
  if (doc === null || doc === undefined) return null;

  if (doc.metadata) {
    if (doc.metadata.screenshot) {
      doc.screenshot = doc.metadata.screenshot;
      delete doc.metadata.screenshot;
    }

    if (doc.metadata.fullPageScreenshot) {
      doc.fullPageScreenshot = doc.metadata.fullPageScreenshot;
      delete doc.metadata.fullPageScreenshot;
    }
  }

  return {
    markdown: doc.markdown,
    // Only emit the links key when linksOnPage was actually populated (i.e. the
    // "links" format was requested). An empty array here would leak an unexpected
    // key on every response regardless of what the caller asked for.
    ...(doc.linksOnPage != null
      ? { links: doc.linksOnPage.filter((x: any) => x !== null) }
      : {}),
    rawHtml: doc.rawHtml,
    html: doc.html,
    extract: doc.llm_extraction,
    screenshot: doc.screenshot ?? doc.fullPageScreenshot,
    metadata: {
      ...doc.metadata,
      pageError: undefined,
      pageStatusCode: undefined,
      error: doc.metadata.pageError,
      statusCode: doc.metadata.pageStatusCode,
      scrapeId: doc.metadata.scrapeId,
    },
  };
}
