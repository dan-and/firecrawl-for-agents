import axios from "axios";
import { generateRequestParams } from "../single_url";
import { universalTimeout } from "../global";
import { Logger } from "../../../lib/logger";

/**
 * Detects if the content is a PDF file
 * @param content The content to check
 * @returns true if the content is a PDF
 */
function isPDFContent(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }
  
  const trimmedContent = content.trim();
  
  // Check for PDF header signature
  if (trimmedContent.startsWith('%PDF-')) {
    return true;
  }
  
  // Check for PDF binary content indicators
  if (trimmedContent.includes('obj') && trimmedContent.includes('endobj') && 
      trimmedContent.includes('stream') && trimmedContent.includes('endstream')) {
    return true;
  }
  
  // Check for high ratio of non-printable characters (typical of binary PDF content)
  const nonPrintableChars = (content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g) || []).length;
  const totalChars = content.length;
  if (totalChars > 100 && nonPrintableChars / totalChars > 0.1) {
    return true;
  }
  
  return false;
}

/**
 * Scrapes a URL with Playwright
 * @param url The URL to scrape
 * @param waitFor The time to wait for the page to load
 * @param headers The headers to send with the request
 * @param scrapeId The scrape ID for logging
 * @param actions Optional array of browser actions to execute
 * @returns The scraped content
 */
export async function scrapeWithPlaywright(
  url: string,
  waitFor: number = 0,
  headers?: Record<string, string>,
  scrapeId?: string,
  actions?: any[],
): Promise<{ content: string; pageStatusCode?: number; pageError?: string }> {
  const logParams = {
    url,
    scraper: "playwright",
    success: false,
    response_code: null,
    time_taken_seconds: null,
    error_message: null,
    html: "",
    startTime: Date.now(),
  };
  let microserviceUrl: string | undefined;

  try {
    const raw = process.env.PLAYWRIGHT_MICROSERVICE_URL?.trim() ?? "";
    const baseUrl =
      raw && !/^https?:\/\//i.test(raw) ? `http://${raw}` : raw;
    if (!baseUrl) {
      return {
        content: "",
        pageStatusCode: null,
        pageError: "PLAYWRIGHT_MICROSERVICE_URL is not set",
      };
    }
    const base = baseUrl.replace(/\/+$/, "");
    const urlWithPath = base.endsWith("/scrape") ? base : `${base}/scrape`;
    try {
      microserviceUrl = new URL(urlWithPath).href;
    } catch (urlError) {
      Logger.debug(
        `⛏️ Playwright: Invalid PLAYWRIGHT_MICROSERVICE_URL (${baseUrl}), cannot call Hero`
      );
      return {
        content: "",
        pageStatusCode: null,
        pageError: `PLAYWRIGHT_MICROSERVICE_URL is not a valid URL: ${baseUrl}`,
      };
    }

    const reqParams = await generateRequestParams(url);
    const waitParam = reqParams["params"]?.wait ?? waitFor;

    const response = await axios.post(
      microserviceUrl,
      {
        url: url,
        wait_after_load: waitParam,
        headers: headers,
        scrapeId: scrapeId,
        actions: actions,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: universalTimeout + waitParam,
        transformResponse: [(data) => data],
      }
    );

    if (response.status !== 200) {
      Logger.debug(
        `⛏️ Playwright: Failed to fetch url: ${url} | status: ${response.status}, microservice: ${microserviceUrl}, error: ${response.data?.pageError}`
      );
      logParams.error_message = response.data?.pageError;
      logParams.response_code = response.data?.pageStatusCode;
      return {
        content: "",
        pageStatusCode: response.data?.pageStatusCode,
        pageError: response.data?.pageError,
      };
    }

    const textData = response.data;
    try {
      const data = JSON.parse(textData);
      const html = data.content;
      
      // Check if the content is a PDF file
      if (isPDFContent(html)) {
        Logger.debug(`⛏️ Playwright: Detected PDF content for ${url}, skipping PDF processing`);
        logParams.error_message = "PDF content detected - not suitable for text extraction";
        logParams.response_code = data.pageStatusCode;
        return {
          content: "",
          pageStatusCode: data.pageStatusCode,
          pageError: "PDF content detected - not suitable for text extraction",
        };
      }
      
      logParams.success = true;
      logParams.html = html;
      logParams.response_code = data.pageStatusCode;
      logParams.error_message = data.pageError;
      return {
        content: html ?? "",
        pageStatusCode: data.pageStatusCode,
        pageError: data.pageError,
      };
    } catch (jsonError) {
      logParams.error_message = jsonError.message || jsonError;
      Logger.debug(
        `⛏️ Playwright: Error parsing JSON response for url: ${url} | Error: ${jsonError}`
      );
      return {
        content: "",
        pageStatusCode: null,
        pageError: logParams.error_message,
      };
    }
  } catch (error) {
    if (error.code === "ECONNABORTED") {
      logParams.error_message = "Request timed out";
      Logger.debug(`⛏️ Playwright: Request timed out for ${url}`);
    } else {
      logParams.error_message = error.message || error;
      const microserviceHint =
        typeof microserviceUrl !== "undefined"
          ? ` microservice: ${microserviceUrl}`
          : "";
      Logger.debug(
        `⛏️ Playwright: Failed to fetch url: ${url} | Error: ${error}${microserviceHint}`
      );
    }
    return {
      content: "",
      pageStatusCode: null,
      pageError: logParams.error_message,
    };
  } finally {
    const endTime = Date.now();
    logParams.time_taken_seconds = (endTime - logParams.startTime) / 1000;
  }
}
