import { load } from "cheerio";
import { PageOptions } from "../../../lib/entities";

/**
 * Structural/navigation elements stripped when onlyMainContent is true.
 * Mirrors the upstream firecrawl excludeNonMainTags list.
 */
const excludeNonMainTags = [
  "header",
  "footer",
  "nav",
  "aside",
  ".header",
  ".top",
  ".navbar",
  "#header",
  ".footer",
  ".bottom",
  "#footer",
  ".sidebar",
  ".side",
  ".aside",
  "#sidebar",
  ".modal",
  ".popup",
  "#modal",
  ".overlay",
  ".ad",
  ".ads",
  ".advert",
  "#ad",
  ".lang-selector",
  ".language",
  "#language-selector",
  ".social",
  ".social-media",
  ".social-links",
  "#social",
  ".menu",
  ".navigation",
  "#nav",
  ".breadcrumbs",
  "#breadcrumbs",
  ".share",
  "#share",
  ".widget",
  "#widget",
  ".cookie",
  "#cookie",
];

/**
 * Known Consent Management Platform (CMP) container selectors.
 * These are GDPR/CCPA consent walls that wrap the entire page and prevent
 * the real content from being reached. They are always removed unconditionally
 * because their presence means the scraper received a consent-gate page, not
 * real content — and leaving them in produces hundreds of KB of raw HTML
 * in the markdown output.
 *
 * Covers: Sourcepoint, OneTrust, Cookiebot, Didomi, Usercentrics,
 *         Quantcast, TrustArc, iubenda, Borlabs, Klaro, and generic patterns.
 */
const cmpSelectors = [
  // Sourcepoint (used by heise.de, many German publishers)
  "#sp-cc",
  ".sp-message-container",
  "[id^='sp_message']",
  // OneTrust
  "#onetrust-consent-sdk",
  "#onetrust-banner-sdk",
  "#onetrust-pc-sdk",
  // Cookiebot (Cybot)
  "#CybotCookiebotDialog",
  "#CybotCookiebotDialogBodyContent",
  "[id^='CybotCookiebot']",
  // Didomi
  "#didomi-host",
  "#didomi-notice",
  // Usercentrics
  "#usercentrics-root",
  // Quantcast
  "#qc-cmp2-container",
  "#qcCmpUi",
  // TrustArc
  "#truste-consent-track",
  "#truste-show-consent",
  // iubenda
  "#iubenda-cs-banner",
  // Borlabs Cookie
  "#borlabs-cookie",
  // Klaro
  ".klaro",
  // Consentmanager.net
  "#cmpbox",
  "#cmpwrapper",
  // Generic consent/cookie wall patterns — scoped to div/section/aside to avoid
  // matching root <html> or <body> elements that carry CMP data attributes as signals.
  "div[class*='consent-banner']",
  "div[class*='cookie-banner']",
  "div[class*='cookie-wall']",
  "div[class*='gdpr-banner']",
  "div[class*='privacy-banner']",
  "div[id*='consent-banner']",
  "div[id*='cookie-banner']",
  "section[class*='consent']",
];

/**
 * Elements that are always kept even if they match an excludeNonMainTags selector.
 */
const forceIncludeMainTags = [
  "#main",
  ".swoogo-cols",
  ".swoogo-text",
  ".swoogo-table-div",
  ".swoogo-space",
  ".swoogo-alert",
  ".swoogo-sponsors",
  ".swoogo-title",
  ".swoogo-tabs",
  ".swoogo-logo",
  ".swoogo-image",
  ".swoogo-button",
  ".swoogo-agenda",
];

export const removeUnwantedElements = (
  html: string,
  pageOptions: PageOptions
) => {
  let soup = load(html);

  // 1. Apply includeTags filter first (keep only matching elements)
  if (
    pageOptions.onlyIncludeTags &&
    pageOptions.onlyIncludeTags.length > 0 &&
    pageOptions.onlyIncludeTags[0] !== ""
  ) {
    if (typeof pageOptions.onlyIncludeTags === "string") {
      pageOptions.onlyIncludeTags = [pageOptions.onlyIncludeTags];
    }
    if (pageOptions.onlyIncludeTags.length !== 0) {
      const newRoot = load("<div></div>")("div");
      pageOptions.onlyIncludeTags.forEach((tag) => {
        soup(tag).each((_, element) => {
          newRoot.append(soup(element).clone());
        });
      });
      soup = load(newRoot.html());
    }
  }

  // 2. Always remove structural noise + known CMP consent wall containers.
  //    CMP containers are removed unconditionally because when they are present
  //    the real page content is hidden behind them — leaving them produces raw
  //    HTML in the markdown output.
  soup("script, style, iframe, noscript, meta, head").remove();
  cmpSelectors.forEach((sel) => {
    try {
      soup(sel).remove();
    } catch (_) {
      // Some attribute selectors may throw in older Cheerio versions — skip
    }
  });

  // 3. Apply user-specified excludeTags
  if (
    pageOptions.removeTags &&
    pageOptions.removeTags.length > 0 &&
    pageOptions.removeTags[0] !== ""
  ) {
    if (typeof pageOptions.removeTags === "string") {
      pageOptions.removeTags = [pageOptions.removeTags];
    }

    if (Array.isArray(pageOptions.removeTags)) {
      pageOptions.removeTags.forEach((tag) => {
        let elementsToRemove: any;
        if (tag.startsWith("*") && tag.endsWith("*")) {
          let classMatch = false;
          const regexPattern = new RegExp(tag.slice(1, -1), "i");
          elementsToRemove = soup("*").filter((_, element) => {
            if (element.type === "tag") {
              const attributes = element.attribs;
              const tagNameMatches = regexPattern.test(element.name);
              const attributesMatch = Object.keys(attributes).some((attr) =>
                regexPattern.test(`${attr}="${attributes[attr]}"`)
              );
              if (tag.startsWith("*.")) {
                classMatch = Object.keys(attributes).some((attr) =>
                  regexPattern.test(`class="${attributes[attr]}"`)
                );
              }
              return tagNameMatches || attributesMatch || classMatch;
            }
            return false;
          });
        } else {
          elementsToRemove = soup(tag);
        }
        elementsToRemove.remove();
      });
    }
  }

  // 4. Strip structural navigation/chrome when onlyMainContent is true.
  if (pageOptions.onlyMainContent) {
    const forceSelector = forceIncludeMainTags
      .map((x) => `:not(:has(${x}))`)
      .join("");
    excludeNonMainTags.forEach((tag) => {
      try {
        soup(tag).filter(forceSelector).remove();
      } catch (_) {
        soup(tag).remove();
      }
    });
  }

  // 5. Resolve srcset to highest-resolution image, then absolutise img src and a href.
  const baseUrl: string | undefined = (pageOptions as any).url;

  soup("img[srcset]").each((_, el) => {
    const srcset = el.attribs.srcset || "";
    const sizes = srcset.split(",").map((x: string) => {
      const tok = x.trim().split(" ");
      return {
        url: tok[0],
        size: parseInt(((tok[1] ?? "1x").slice(0, -1)) as string, 10) || 1,
        isX: (tok[1] ?? "").endsWith("x"),
      };
    });

    if (sizes.every((x: any) => x.isX) && el.attribs.src) {
      sizes.push({ url: el.attribs.src, size: 1, isX: true });
    }

    sizes.sort((a: any, b: any) => b.size - a.size);

    if (sizes[0]?.url) {
      el.attribs.src = sizes[0].url;
    }
  });

  if (baseUrl) {
    soup("img[src]").each((_, el) => {
      try {
        el.attribs.src = new URL(el.attribs.src, baseUrl).href;
      } catch (_) {}
    });
    soup("a[href]").each((_, el) => {
      try {
        el.attribs.href = new URL(el.attribs.href, baseUrl).href;
      } catch (_) {}
    });
  }

  return soup.html();
};
