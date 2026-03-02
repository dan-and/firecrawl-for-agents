import { request } from "undici";
import { universalTimeout } from "../global";
import { Logger } from "../../../lib/logger";
import { isDOCXUrl, parseDOCXBuffer } from "./docx";
import { isDOCUrl, parseDOCBuffer } from "./doc";
import { isSpreadsheetUrl, parseSpreadsheetBuffer } from "./xlsx";
import { extractPDFText } from "./pdf";

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
    if (isDOCXUrl(url)) {
      Logger.debug(`⛏️ fetch: DOCX URL detected, fetching as binary: ${url}`);
      const docxResp = await request(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        headersTimeout: universalTimeout,
        bodyTimeout: universalTimeout,
      });

      if (docxResp.statusCode !== 200) {
        return {
          content: "",
          pageStatusCode: docxResp.statusCode,
          pageError: `HTTP ${docxResp.statusCode}`,
        };
      }

      const docxBytes = await docxResp.body.bytes();
      const html = await parseDOCXBuffer(Buffer.from(docxBytes));
      Logger.debug(`⛏️ fetch: DOCX parsed to HTML (${html.length} chars)`);
      return { content: html, pageStatusCode: docxResp.statusCode, pageError: null };
    }

    if (isSpreadsheetUrl(url)) {
      Logger.debug(`⛏️ fetch: Spreadsheet URL detected, fetching as binary: ${url}`);
      const xlsxResp = await request(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        headersTimeout: universalTimeout,
        bodyTimeout: universalTimeout,
      });

      if (xlsxResp.statusCode !== 200) {
        return {
          content: "",
          pageStatusCode: xlsxResp.statusCode,
          pageError: `HTTP ${xlsxResp.statusCode}`,
        };
      }

      const contentType = (xlsxResp.headers?.["content-type"] as string | undefined) ?? "";
      if (contentType.includes("text/html")) {
        Logger.debug(`⛏️ fetch: Spreadsheet URL returned HTML (likely a redirect page), falling through to normal scrape`);
        // fall through — let the normal fetch path handle it
      } else {
        const xlsxBytes = await xlsxResp.body.bytes();
        const html = await parseSpreadsheetBuffer(Buffer.from(xlsxBytes));
        Logger.debug(`⛏️ fetch: Spreadsheet parsed to HTML (${html.length} chars)`);
        return { content: html, pageStatusCode: xlsxResp.statusCode, pageError: null };
      }
    }

    if (isDOCUrl(url)) {
      Logger.debug(`⛏️ fetch: Legacy .doc URL detected, fetching as binary: ${url}`);
      const docResp = await request(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        headersTimeout: universalTimeout,
        bodyTimeout: universalTimeout,
      });

      if (docResp.statusCode !== 200) {
        return {
          content: "",
          pageStatusCode: docResp.statusCode,
          pageError: `HTTP ${docResp.statusCode}`,
        };
      }

      try {
        const docBytes = await docResp.body.bytes();
        const text = await parseDOCBuffer(Buffer.from(docBytes));
        Logger.debug(`⛏️ fetch: .doc parsed (${text.length} chars)`);
        return { content: `<pre>${text}</pre>`, pageStatusCode: docResp.statusCode, pageError: null };
      } catch (docErr) {
        Logger.debug(`⛏️ fetch: .doc parse failed: ${docErr}`);
        return {
          content: "",
          pageStatusCode: docResp.statusCode,
          pageError: `Legacy .doc parse error: ${(docErr as Error).message}`,
        };
      }
    }

    const { statusCode, headers, body } = await request(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

    // Detect PDF by Content-Type header first, then fall back to body signature
    const contentType = ((headers["content-type"] as string) || "").toLowerCase();
    const isPDF = contentType.includes("application/pdf") || isPDFContent(text);

    if (isPDF) {
      if (!parsePDF) {
        // parsePDF=false: skip silently (used by crawler to filter PDF links)
        Logger.debug(`⛏️ fetch: PDF detected for ${url}, parsePDF=false — skipping`);
        return {
          content: "",
          pageStatusCode: statusCode,
          pageError: "PDF content skipped (parsePDF=false)",
        };
      }

      // parsePDF=true (default): re-fetch as raw bytes and extract text
      // We must re-fetch because body.text() above garbles binary data.
      Logger.debug(`⛏️ fetch: PDF detected for ${url}, attempting text extraction`);
      try {
        const pdfResp = await request(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "User-Agent":
              "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          },
          headersTimeout: universalTimeout,
          bodyTimeout: universalTimeout,
        });
        const pdfBytes = await pdfResp.body.bytes();
        const extracted = await extractPDFText(Buffer.from(pdfBytes));

        if (extracted.hasText) {
          Logger.debug(
            `⛏️ fetch: Extracted ${extracted.text.length} chars from ${extracted.pageCount}-page PDF at ${url}`
          );
          return {
            content: extracted.text,
            pageStatusCode: statusCode,
            pageError: null,
          };
        } else {
          Logger.debug(
            `⛏️ fetch: PDF at ${url} has ${extracted.pageCount} pages but no extractable text (likely a scanned image)`
          );
          return {
            content: "",
            pageStatusCode: statusCode,
            pageError:
              "PDF appears to be a scanned image with no extractable text. " +
              "Deploy a PDF OCR sidecar (see dan_documentations/pdf-to-markdown-analysis.md) to enable OCR.",
          };
        }
      } catch (pdfError) {
        Logger.debug(`⛏️ fetch: PDF extraction failed for ${url}: ${pdfError}`);
        return {
          content: "",
          pageStatusCode: statusCode,
          pageError: `PDF extraction failed: ${(pdfError as Error).message || String(pdfError)}`,
        };
      }
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
