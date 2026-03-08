import { Response } from "express";
import { v7 as uuidv7 } from "uuid";
import {
  legacyCrawlerOptions,
  mapRequestSchema,
  RequestWithAuth,
} from "./types";
import { crawlToCrawler, StoredCrawl } from "../../lib/crawl-redis";
import { MapResponse, MapRequest } from "./types";
import { configDotenv } from "dotenv";
import { Logger } from "../../lib/logger";
import {
  checkAndUpdateURLForMap,
  isSameDomain,
  isSameSubdomain,
  removeDuplicateUrls,
} from "../../lib/validateUrl";

configDotenv();

/**
 * @openapi
 * /v1/map:
 *   post:
 *     tags:
 *       - Mapping
 *     summary: Discover all URLs on a site
 *     description: Crawls sitemaps and follows links to return a flat list of all discovered URLs. Fast — does not scrape page content.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com"
 *               limit:
 *                 type: integer
 *                 default: 5000
 *                 description: Maximum number of URLs to return
 *               ignoreCache:
 *                 type: boolean
 *                 default: false
 *                 description: Bypass cached URL list and re-crawl
 *               includeSubdomains:
 *                 type: boolean
 *                 default: false
 *                 description: Include URLs from subdomains
 *     responses:
 *       200:
 *         description: List of discovered URLs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 links:
 *                   type: array
 *                   items:
 *                     type: string
 *                     format: uri
 *                   example: ["https://example.com/", "https://example.com/about"]
 *       400:
 *         description: Bad request — invalid URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *       401:
 *         description: Unauthorized — missing or invalid API key
 */
export async function mapController(
  req: RequestWithAuth<{}, MapResponse, MapRequest>,
  res: Response<MapResponse>
) {
  req.body = mapRequestSchema.parse(req.body);

  const limit: number = req.body.limit ?? 5000;
  const ignoreCache: boolean = req.body.ignoreCache ?? false;

  if (ignoreCache) {
    Logger.debug(
      `/map: ignoreCache=true — bypassing any URL cache for ${req.body.url}`
    );
  }

  const id = uuidv7();
  let links: string[] = [req.body.url];

  const sc: StoredCrawl = {
    originUrl: req.body.url,
    crawlerOptions: legacyCrawlerOptions(req.body),
    pageOptions: {},
    team_id: req.auth.team_id,
    createdAt: Date.now(),
    plan: req.auth.plan,
  };

  const crawler = crawlToCrawler(id, sc);

  const sitemap =
    req.body.ignoreSitemap ?? true ? null : await crawler.tryGetSitemap();

  if (sitemap !== null) {
    sitemap.map((x) => {
      links.push(x.url);
    });
  }

  links = links
    .map((x) => {
      try {
        return checkAndUpdateURLForMap(x).url.trim();
      } catch (_) {
        return null;
      }
    })
    .filter((x) => x !== null);

  links = links.filter((x) => isSameDomain(x, req.body.url));

  if (!req.body.includeSubdomains) {
    links = links.filter((x) => isSameSubdomain(x, req.body.url));
  }

  links = removeDuplicateUrls(links);

  const linksToReturn = links.slice(0, limit).filter((x) => x !== null);

  return res.status(200).json({
    success: true,
    links: linksToReturn,
    scrape_id: req.body.origin?.includes("website") ? id : undefined,
  });
}
