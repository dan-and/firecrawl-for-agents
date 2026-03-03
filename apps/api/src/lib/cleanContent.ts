import OpenAI from "openai";
import { Logger } from "./logger";

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

/**
 * Passes Markdown through an LLM to strip boilerplate (nav, footer, ads, banners)
 * and return only the main article content.
 * Returns the original markdown unchanged if OPENAI_API_KEY is not set.
 */
export async function cleanContent(markdown: string, url: string): Promise<string> {
  const client = getClient();
  if (!client) {
    Logger.debug("cleanContent: OPENAI_API_KEY not set, returning raw markdown");
    return markdown;
  }

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_CLEANING_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a content extractor. Given a Markdown document scraped from a web page, " +
            "return ONLY the main article or document content. " +
            "Strip navigation menus, cookie banners, advertisements, social media share buttons, " +
            "headers, footers, sidebars, and any repetitive boilerplate. " +
            "Preserve all headings, code blocks, tables, images, and links that are part of the main content. " +
            "Return valid Markdown only. Do not add any explanation or preamble.",
        },
        {
          role: "user",
          content: `URL: ${url}\n\n---\n\n${markdown}`,
        },
      ],
      max_tokens: 8192,
    });

    const cleaned = response.choices[0]?.message?.content;
    if (!cleaned) {
      Logger.warn("cleanContent: OpenAI returned empty content, using original markdown");
      return markdown;
    }
    return cleaned;
  } catch (err) {
    Logger.error(`cleanContent: OpenAI call failed: ${err}`);
    return markdown; // graceful fallback
  }
}
