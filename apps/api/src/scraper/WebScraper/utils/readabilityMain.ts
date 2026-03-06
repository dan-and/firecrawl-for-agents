import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

/**
 * Best-effort main-content extraction using Mozilla Readability.
 *
 * Returns a smaller HTML fragment when it can confidently identify an article.
 * Falls back to null on error or when no meaningful reduction is found.
 */
export function extractMainContentWithReadability(
  html: string,
  url?: string
): string | null {
  try {
    if (!html || html.trim().length < 200) {
      return null;
    }

    const dom = new JSDOM(html, { url: url ?? "https://example.com" });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.content) {
      return null;
    }

    const content = article.content.trim();

    if (!content || content.length === 0) {
      return null;
    }

    // If Readability returns something bigger than or equal to the original,
    // treat it as a no-op.
    if (content.length >= html.length) {
      return null;
    }

    return content;
  } catch {
    return null;
  }
}

