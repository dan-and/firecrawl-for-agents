import axios from "axios";
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
 * Scrapes a URL with Axios
 * @param url The URL to scrape
 * @returns The scraped content
 */
export async function scrapeWithFetch(
  url: string
): Promise<{ content: string; pageStatusCode?: number; pageError?: string }> {
  const logParams = {
    url,
    scraper: "fetch",
    success: false,
    response_code: null,
    time_taken_seconds: null,
    error_message: null,
    html: "",
    startTime: Date.now(),
  };

  try {
    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: universalTimeout,
      transformResponse: [(data) => data], // Prevent axios from parsing JSON automatically
    });

    if (response.status !== 200) {
      Logger.debug(
        `⛏️ Axios: Failed to fetch url: ${url} with status: ${response.status}`
      );
      logParams.error_message = response.statusText;
      logParams.response_code = response.status;
      return {
        content: "",
        pageStatusCode: response.status,
        pageError: response.statusText,
      };
    }

    const text = response.data;
    
    // Check if the content is a PDF file
    if (isPDFContent(text)) {
      Logger.debug(`⛏️ fetch: Detected PDF content for ${url}, skipping PDF processing`);
      logParams.error_message = "PDF content detected - not suitable for text extraction";
      logParams.response_code = response.status;
      return {
        content: "",
        pageStatusCode: response.status,
        pageError: "PDF content detected - not suitable for text extraction",
      };
    }
    
    logParams.success = true;
    logParams.html = text;
    logParams.response_code = response.status;
    return { content: text, pageStatusCode: response.status, pageError: null };
  } catch (error) {
    if (error.code === "ECONNABORTED") {
      logParams.error_message = "Request timed out";
      Logger.debug(`⛏️ Axios: Request timed out for ${url}`);
    } else {
      logParams.error_message = error.message || error;
      Logger.debug(`⛏️ Axios: Failed to fetch url: ${url} | Error: ${error}`);
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
