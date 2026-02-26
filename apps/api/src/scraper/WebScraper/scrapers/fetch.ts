import { request } from "undici";
import { universalTimeout } from "../global";
import { Logger } from "../../../lib/logger";

function isPDFContent(content: string): boolean {
  if (!content || typeof content !== "string") {
    return false;
  }
  const trimmedContent = content.trim();
  if (trimmedContent.startsWith("%PDF-")) {
    return true;
  }
  if (
    trimmedContent.includes("obj") &&
    trimmedContent.includes("endobj") &&
    trimmedContent.includes("stream") &&
    trimmedContent.includes("endstream")
  ) {
    return true;
  }
  const nonPrintableChars = (
    content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g) || []
  ).length;
  const totalChars = content.length;
  if (totalChars > 100 && nonPrintableChars / totalChars > 0.1) {
    return true;
  }
  return false;
}

export async function scrapeWithFetch(
  url: string,
  parsePDF: boolean = true
): Promise<{ content: string; pageStatusCode?: number; pageError?: string }> {
  const startTime = Date.now();

  try {
    const { statusCode, body } = await request(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
      headersTimeout: universalTimeout,
      bodyTimeout: universalTimeout,
    });

    // Always consume the body fully — undici holds the connection open until the
    // body stream is drained. Do this before the status check.
    const text = await body.text();

    if (statusCode !== 200) {
      Logger.debug(
        `⛏️ fetch: Failed to fetch url: ${url} with status: ${statusCode}`
      );
      return {
        content: "",
        pageStatusCode: statusCode,
        pageError: `HTTP ${statusCode}`,
      };
    }

    if (isPDFContent(text)) {
      Logger.debug(
        `⛏️ fetch: Detected PDF content for ${url}, skipping PDF processing`
      );
      return {
        content: "",
        pageStatusCode: statusCode,
        pageError: "PDF content detected - not suitable for text extraction",
      };
    }

    Logger.debug(
      `⛏️ fetch: Successfully fetched ${url} in ${Date.now() - startTime}ms`
    );
    return { content: text, pageStatusCode: statusCode, pageError: null };
  } catch (error) {
    const isTimeout =
      error?.code === "UND_ERR_HEADERS_TIMEOUT" ||
      error?.code === "UND_ERR_BODY_TIMEOUT" ||
      error?.code === "ECONNABORTED";

    if (isTimeout) {
      Logger.debug(`⛏️ fetch: Timed out for ${url}`);
      return { content: "", pageStatusCode: 408, pageError: "Request timed out" };
    }

    if (error?.code === "ENOTFOUND") {
      Logger.debug(`⛏️ fetch: DNS failure for ${url}`);
      return {
        content: "",
        pageStatusCode: 0,
        pageError: `DNS lookup failed: hostname not found for ${new URL(url).hostname}`,
      };
    }

    if (error?.code === "ECONNREFUSED") {
      Logger.debug(`⛏️ fetch: Connection refused for ${url}`);
      return {
        content: "",
        pageStatusCode: 0,
        pageError: `Connection refused by ${new URL(url).hostname}`,
      };
    }

    if (error?.code === "ECONNRESET") {
      Logger.debug(`⛏️ fetch: Connection reset for ${url}`);
      return {
        content: "",
        pageStatusCode: 0,
        pageError: `Connection reset by ${new URL(url).hostname} (server closed connection unexpectedly)`,
      };
    }

    Logger.debug(`⛏️ fetch: Failed to fetch ${url} | Error: ${error}`);
    return {
      content: "",
      pageStatusCode: null,
      pageError: error.message || String(error),
    };
  }
}
