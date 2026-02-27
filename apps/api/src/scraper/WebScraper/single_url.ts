import * as cheerio from "cheerio";
import { extractMetadata } from "./utils/metadata";
import dotenv from "dotenv";
import { Document, PageOptions } from "../../lib/entities";
import { parseMarkdown } from "../../lib/html-to-markdown";
import { urlSpecificParams } from "./utils/custom/website_params";
import { removeUnwantedElements } from "./utils/removeUnwantedElements";
import { scrapeWithFetch } from "./scrapers/fetch";
import { scrapeWithPlaywright } from "./scrapers/playwright";
import { scrapeWithTlsClient, shutdownTlsClient } from "./scrapers/tls-client";
import { extractLinks } from "./utils/utils";
import { Logger } from "../../lib/logger";
import { clientSideError } from "../../strings";
import { rewriteUrl } from "../../lib/rewriteUrl";
import axios from "axios";
import { getForcedEngine } from "./utils/engine-forcing";

dotenv.config();

/** HTML larger than this byte threshold is returned as-is instead of being converted to Markdown. */
const MAX_HTML_FOR_MARKDOWN = 300 * 1024; // 300 KB

export const callWebhook = async (
  webhookUrls: string[],
  data: any,
  metadata: any,
  scrapeId?: string
) => {
  for (const webhookUrl of webhookUrls) {
    let retryCount = 0;
    while (retryCount < 3) {
      try {
        await axios.post(
          webhookUrl,
          {
            scrapeId: scrapeId ?? "unknown",
            data,
            metadata,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
            timeout: 10000,
          }
        );

        Logger.debug(`Webhook sent for scrape ID: ${scrapeId}`);
        break;
      } catch (error) {
        Logger.debug(
          `Error sending webhook to ${webhookUrl} for scrape ID: ${scrapeId}, retry ${retryCount}. Error: ${error}`
        );
      }

      retryCount++;
    }
  }
};

export const baseScrapers = ["playwright", "fetch", "tls-client"].filter(Boolean);

export async function generateRequestParams(
  url: string,
  wait_browser: string = "domcontentloaded",
  timeout: number = 60000
): Promise<any> {
  const defaultParams = {
    url: url,
    params: {
      timeout: timeout,
      wait_browser: wait_browser,
      stealth_proxy: true,
    },
    headers: { "ScrapingService-Request": "TRUE" },
  };

  try {
    const urlKey = new URL(url).hostname.replace(/^www\./, "");
    if (urlSpecificParams.hasOwnProperty(urlKey)) {
      return { ...defaultParams, ...urlSpecificParams[urlKey] };
    } else {
      return defaultParams;
    }
  } catch (error) {
    Logger.error(`Error generating URL key: ${error}`);
    return defaultParams;
  }
}

/**
 * Get the order of scrapers to be used for scraping a URL
 * If the user doesn't have envs set for a specific scraper, it will be removed from the order.
 * @param defaultScraper The default scraper to use if the URL does not have a specific scraper order defined
 * @param forcedEngine The engine to force for this URL (overrides default order)
 * @returns The order of scrapers to be used for scraping a URL
 */
function getScrapingFallbackOrder(
  defaultScraper?: string,
  forcedEngine?: string
) {
  const availableScrapers = baseScrapers.filter((scraper) => {
    switch (scraper) {
      case "playwright":
        return !!process.env.PLAYWRIGHT_MICROSERVICE_URL;
      case "tls-client":
        return process.env.TLS_CLIENT_ENABLED === "true";
      default:
        return true;
    }
  });

  let defaultOrder = ["fetch", "tls-client", "playwright"].filter(Boolean);

  const filteredDefaultOrder = defaultOrder.filter(
    (scraper: (typeof baseScrapers)[number]) =>
      availableScrapers.includes(scraper)
  );
  const uniqueScrapers = new Set(
    forcedEngine
      ? [forcedEngine, ...availableScrapers]
      : defaultScraper
      ? [defaultScraper, ...filteredDefaultOrder, ...availableScrapers]
      : [...filteredDefaultOrder, ...availableScrapers]
  );

  const scrapersInOrder = Array.from(uniqueScrapers);
  return scrapersInOrder as (typeof baseScrapers)[number][];
}

export async function scrapeSingleUrl(
  urlToScrape: string,
  pageOptions: PageOptions,
  existingHtml?: string,
  webhookUrls?: string[],
  webhookMetadata?: any,
  scrapeId?: string
): Promise<Document> {
  pageOptions = {
    includeMarkdown: pageOptions.includeMarkdown ?? true,
    includeExtract: pageOptions.includeExtract ?? false,
    includeRawHtml: pageOptions.includeRawHtml ?? false,
    waitFor: pageOptions.waitFor ?? undefined,
    screenshot: pageOptions.screenshot ?? false,
    fullPageScreenshot: pageOptions.fullPageScreenshot ?? false,
    headers: pageOptions.headers ?? undefined,
    includeLinks: pageOptions.includeLinks ?? true,
    replaceAllPathsWithAbsolutePaths:
      pageOptions.replaceAllPathsWithAbsolutePaths ?? true,
    parsePDF: pageOptions.parsePDF ?? true,
    removeTags: pageOptions.removeTags ?? [],
    onlyIncludeTags: pageOptions.onlyIncludeTags ?? [],
    useFastMode: pageOptions.useFastMode ?? false,
    disableJsDom: pageOptions.disableJsDom ?? false,
    atsv: pageOptions.atsv ?? false,
  };

  if (!existingHtml) {
    existingHtml = "";
  }

  urlToScrape = urlToScrape.trim();
  const rewritten = rewriteUrl(urlToScrape);
  if (rewritten) {
    Logger.debug(`Rewriting URL: ${urlToScrape} → ${rewritten}`);
    urlToScrape = rewritten;
  }

  const attemptScraping = async (
    url: string,
    method: (typeof baseScrapers)[number]
  ) => {
    let scraperResponse: {
      text: string;
      screenshot: string;
      metadata: { pageStatusCode?: number; pageError?: string | null };
    } = { text: "", screenshot: "", metadata: {} };

    console.log("DEBUG attemptScraping called with method:", method);
    switch (method) {
       case "playwright":
         if (process.env.PLAYWRIGHT_MICROSERVICE_URL) {
           const response = await scrapeWithPlaywright(
             url,
             pageOptions.waitFor,
             pageOptions.headers,
             scrapeId
           );
           scraperResponse.text = response.content;
           scraperResponse.metadata.pageStatusCode = response.pageStatusCode;
           scraperResponse.metadata.pageError = response.pageError;
         }
         break;
      case "tls-client": {
        const response = await scrapeWithTlsClient(url);
        scraperResponse.text = response.content;
        scraperResponse.metadata.pageStatusCode = response.pageStatusCode;
        scraperResponse.metadata.pageError = response.pageError;
        break;
      }
      case "fetch": {
        console.log("DEBUG single_url: about to call scrapeWithFetch");
        const response = await scrapeWithFetch(url);
        scraperResponse.text = response.content;
        scraperResponse.metadata.pageStatusCode = response.pageStatusCode;
        scraperResponse.metadata.pageError = response.pageError;
        break;
      }
    }

    let cleanedHtml = removeUnwantedElements(scraperResponse.text, pageOptions);
    const text =
      cleanedHtml.length > MAX_HTML_FOR_MARKDOWN
        ? cleanedHtml
        : await parseMarkdown(cleanedHtml);

    return {
      text,
      html: cleanedHtml,
      rawHtml: scraperResponse.text,
      screenshot: scraperResponse.screenshot,
      pageStatusCode: scraperResponse.metadata.pageStatusCode,
      pageError: scraperResponse.metadata.pageError || undefined,
    };
  };

  let { text, html, rawHtml, screenshot, pageStatusCode, pageError } = {
    text: "",
    html: "",
    rawHtml: "",
    screenshot: "",
    pageStatusCode: 200,
    pageError: undefined,
  };
  try {
    let urlKey = urlToScrape;
    try {
      urlKey = new URL(urlToScrape).hostname.replace(/^www\./, "");
    } catch (error) {
      Logger.error(`Invalid URL key, trying: ${urlToScrape}`);
    }
    // proxy param overrides per-domain defaults: "basic" forces fetch, "stealth"/"enhanced" force Hero
    const proxyEngine =
      pageOptions.proxy === "basic"
        ? "fetch"
        : pageOptions.proxy === "stealth" || pageOptions.proxy === "enhanced"
        ? "playwright"
        : undefined;
    const defaultScraper =
      proxyEngine ?? urlSpecificParams[urlKey]?.defaultScraper ?? "";
    const forcedEngine = getForcedEngine(urlToScrape);
    const scrapersInOrder = getScrapingFallbackOrder(defaultScraper, forcedEngine);

    for (const scraper of scrapersInOrder) {
      // If exists text coming from crawler, use it
      if (
        existingHtml &&
        existingHtml.trim().length >= 100 &&
        !existingHtml.includes(clientSideError)
      ) {
        rawHtml = existingHtml;
        let cleanedHtml = removeUnwantedElements(existingHtml, pageOptions);
        text =
          cleanedHtml.length > MAX_HTML_FOR_MARKDOWN
            ? cleanedHtml
            : await parseMarkdown(cleanedHtml);
        html = cleanedHtml;
        break;
      }

      const attempt = await attemptScraping(urlToScrape, scraper);
      text = attempt.text ?? "";
      html = attempt.html ?? "";
      rawHtml = attempt.rawHtml ?? "";
      screenshot = attempt.screenshot ?? "";

      if (attempt.pageStatusCode) {
        pageStatusCode = attempt.pageStatusCode;
      }
      if (attempt.pageError && attempt.pageStatusCode >= 400) {
        pageError = attempt.pageError;
      } else if (
        attempt &&
        attempt.pageStatusCode &&
        attempt.pageStatusCode < 400
      ) {
        pageError = undefined;
      }

      if (
        (rawHtml && rawHtml.trim().length >= 100) ||
        (typeof screenshot === "string" && screenshot.length > 0)
      ) {
        Logger.debug(
          `⛏️ ${scraper}: Successfully scraped ${urlToScrape} with rawHtml length >= 100 or screenshot, breaking`
        );
        break;
      }
      if (
        pageStatusCode &&
        (pageStatusCode == 404 || pageStatusCode == 415 || pageStatusCode == 500)
      ) {
        Logger.debug(
          `⛏️ ${scraper}: Stopping fallback loop for ${urlToScrape}, status code ${pageStatusCode} is terminal`
        );
        break;
      }

      Logger.debug(
        `⛏️ ${scraper}: Failed to scrape ${urlToScrape}, trying next scraper`
      );
    }

    // Provide a clear error when screenshot was requested but the URL is a PDF.
    // A blank screenshot field is otherwise confusing to API callers.
    if (
      pageOptions.screenshot &&
      pageError &&
      pageError.includes("PDF content detected")
    ) {
      pageError =
        "Screenshot format is not supported for PDF or binary document URLs. " +
        "Use formats: [\"markdown\"] with parsePDF: true to extract text content instead.";
    }

    // Debug logging
    Logger.debug(`⛏️ single_url: pageError after fallback loop = ${pageError}`);

    if (!rawHtml) {
      const heroConfigured = !!process.env.PLAYWRIGHT_MICROSERVICE_URL;
      throw new Error(
        `Unable to retrieve content from ${urlToScrape}. ` +
        `Tried: ${scrapersInOrder.join(", ")}. ` +
        (heroConfigured
          ? "The site may be blocking automated requests. Try a different URL or check if the site requires login."
          : "The Hero browser service is not configured (PLAYWRIGHT_MICROSERVICE_URL is not set). " +
            "Set it to enable JavaScript rendering for sites that require it.")
      );
    }

    const soup = cheerio.load(rawHtml);
    const metadata = extractMetadata(soup, urlToScrape);

    let linksOnPage: string[] | undefined;

    if (pageOptions.includeLinks) {
      linksOnPage = extractLinks(rawHtml, urlToScrape);
    }

    let document: Document;
    if (screenshot && screenshot.length > 0) {
      document = {
        content: text,
        markdown:
          pageOptions.includeMarkdown || pageOptions.includeExtract
            ? text
            : undefined,
        html: pageOptions.includeRawHtml ? html : undefined,
        rawHtml: pageOptions.includeRawHtml ? rawHtml : undefined,
        linksOnPage: pageOptions.includeLinks ? linksOnPage : undefined,
        metadata: {
          ...metadata,
          screenshot: screenshot,
          sourceURL: urlToScrape,
          pageStatusCode: pageStatusCode,
          statusCode: pageStatusCode,
          pageError: pageError,
          scrapeId: scrapeId,
        },
      };
    } else {
      document = {
        content: text,
        markdown:
          pageOptions.includeMarkdown || pageOptions.includeExtract
            ? text
            : undefined,
        html: pageOptions.includeRawHtml ? html : undefined,
        rawHtml: pageOptions.includeRawHtml ? rawHtml : undefined,
        metadata: {
          ...metadata,
          sourceURL: urlToScrape,
          pageStatusCode: pageStatusCode,
          statusCode: pageStatusCode,
          pageError: pageError,
          scrapeId: scrapeId,
        },
        linksOnPage: pageOptions.includeLinks ? linksOnPage : undefined,
      };
    }

    if (webhookUrls && webhookUrls.length) {
      Logger.debug(
        `Sending webhook for scrape ID  ${scrapeId} to ${webhookUrls.join(
          ", "
        )}`
      );
      await callWebhook(webhookUrls, document, webhookMetadata, scrapeId);
    } else {
      Logger.debug(`No webhook URL provided, skipping webhook`);
    }

    return document;
  } catch (error) {
    Logger.debug(
      `⛏️ Error: ${error.message} - Failed to fetch URL: ${urlToScrape}`
    );

    return {
      content: "",
      markdown:
        pageOptions.includeMarkdown || pageOptions.includeExtract
          ? ""
          : undefined,
      html: "",
      linksOnPage: pageOptions.includeLinks ? [] : undefined,
      metadata: {
        sourceURL: urlToScrape,
        pageStatusCode: pageStatusCode,
        pageError: pageError,
      },
    } as Document;
  }
}
