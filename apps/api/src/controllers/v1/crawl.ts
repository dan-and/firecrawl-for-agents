import { Response } from "express";
import { v7 as uuidv7 } from "uuid";
import {
  CrawlRequest,
  crawlRequestSchema,
  CrawlResponse,
  legacyCrawlerOptions,
  legacyScrapeOptions,
  RequestWithAuth,
} from "./types";
import {
  addCrawlJob,
  addCrawlJobs,
  crawlToCrawler,
  lockURL,
  lockURLs,
  saveCrawl,
  StoredCrawl,
} from "../../lib/crawl-redis";
import { getScrapeQueue } from "../../services/queue-service";
import { addScrapeJobRaw } from "../../services/queue-jobs";
import { Logger } from "../../lib/logger";
import { getJobPriority } from "../../lib/job-priority";

/**
 * @openapi
 * /v1/crawl:
 *   post:
 *     tags:
 *       - Crawling
 *     summary: Start a new web crawling job
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
 *               maxDepth:
 *                 type: integer
 *                 minimum: 1
 *                 default: 2
 *               maxPages:
 *                 type: integer
 *                 minimum: 1
 *               timeout:
 *                 type: integer
 *                 minimum: 1000
 *               includeUrls:
 *                 type: array
 *                 items:
 *                   type: string
 *               excludeUrls:
 *                 type: array
 *                 items:
 *                   type: string
 *               scrapeOptions:
 *                 type: object
 *                 properties:
 *                   waitUntil:
 *                     type: string
 *                     enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2']
 *                   timeout:
 *                     type: integer
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 url:
 *                   type: string
 *                   format: uri
 */
export async function crawlController(
  req: RequestWithAuth<{}, CrawlResponse, CrawlRequest>,
  res: Response<CrawlResponse>
) {
  req.body = crawlRequestSchema.parse(req.body);

  Logger.debug(`[Crawl] Request received`, { 
    body: req.body, 
    teamId: req.auth.team_id,
    plan: req.auth.plan 
  });

  const id = uuidv7();

  const crawlerOptions = legacyCrawlerOptions(req.body);
  const pageOptions = legacyScrapeOptions(req.body.scrapeOptions);

  // TODO: @rafa, is this right? copied from v0
  if (Array.isArray(crawlerOptions.includes)) {
    for (const x of crawlerOptions.includes) {
      try {
        new RegExp(x);
      } catch (e) {
        return res.status(400).json({ success: false, error: e.message });
      }
    }
  }

  if (Array.isArray(crawlerOptions.excludes)) {
    for (const x of crawlerOptions.excludes) {
      try {
        new RegExp(x);
      } catch (e) {
        return res.status(400).json({ success: false, error: e.message });
      }
    }
  }

  const sc: StoredCrawl = {
    originUrl: req.body.url,
    crawlerOptions,
    pageOptions,
    team_id: req.auth.team_id,
    createdAt: Date.now(),
    plan: req.auth.plan,
  };

  const crawler = crawlToCrawler(id, sc);

  try {
    sc.robots = await crawler.getRobotsTxt();
  } catch (e) {
    Logger.debug(
      `[Crawl] Failed to get robots.txt (this is probably fine!)`, 
      { error: e.message, url: req.body.url }
    );
  }

  await saveCrawl(id, sc);

  // Determine whether to use the sitemap
  const useSitemap = !(sc.crawlerOptions.ignoreSitemap ?? true) || sc.crawlerOptions.sitemapOnly;
  const sitemap = useSitemap ? await crawler.tryGetSitemap() : null;

  if (sitemap !== null && sitemap.length > 0) {
    // Sitemap found — queue the sitemap URLs
    const limit = crawlerOptions.limit || 10000;
    const limitedSitemap = sitemap.slice(0, limit);

    Logger.debug(`[Crawl] Sitemap found with URLs, applying limit`, {
      totalUrls: sitemap.length,
      limit: limit,
      limitedUrls: limitedSitemap.length,
      sitemapOnly: sc.crawlerOptions.sitemapOnly,
    });

    let jobPriority = 20;
    if (limitedSitemap.length > 1000) {
      jobPriority = await getJobPriority({
        plan: req.auth.plan,
        team_id: req.auth.team_id,
        basePriority: 21,
      });
    }

    const jobs = limitedSitemap.map((x) => {
      const url = x.url;
      const uuid = uuidv7();
      return {
        name: uuid,
        data: {
          url,
          mode: "single_urls",
          team_id: req.auth.team_id,
          crawlerOptions,
          pageOptions,
          webhookUrls: req.body.webhookUrls,
          webhookMetadata: req.body.webhookMetadata,
          origin: "api",
          crawl_id: id,
          sitemapped: true,
          v1: true,
        },
        opts: {
          jobId: uuid,
          priority: 20,
        },
      };
    });

    await lockURLs(
      id,
      sc,
      jobs.map((x) => x.data.url)
    );
    await addCrawlJobs(
      id,
      jobs.map((x) => x.opts.jobId)
    );
    await getScrapeQueue().addBulk(jobs);
  } else if (!sc.crawlerOptions.sitemapOnly) {
    // Sitemap not found AND sitemapOnly is not set to true
    // Fallback to single URL crawl (existing behavior)
    await lockURL(id, sc, req.body.url);
    const job = await addScrapeJobRaw(
      {
        url: req.body.url,
        mode: "single_urls",
        crawlerOptions: crawlerOptions,
        team_id: req.auth.team_id,
        pageOptions: pageOptions,
        webhookUrls: req.body.webhookUrls,
        webhookMetadata: req.body.webhookMetadata,
        origin: "api",
        crawl_id: id,
        v1: true,
      },
      {
        priority: 15,
      },
      uuidv7(),
      10
    );
    await addCrawlJob(id, job.id);
  } else {
    // Sitemap was requested via sitemapOnly=true but no sitemap was found
    return res.status(400).json({
      success: false,
      error: "Sitemap was requested but no sitemap was found at the start URL. " +
             "Please check the URL is correct or disable sitemapOnly.",
    });
  }

  const protocol = req.protocol;

  return res.status(200).json({
    success: true,
    id,
    url: `${protocol}://${req.get("host")}/v1/crawl/${id}`,
  });
}
