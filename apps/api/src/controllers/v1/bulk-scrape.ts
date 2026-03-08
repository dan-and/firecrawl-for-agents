import { Response } from "express";
import { v7 as uuidv7 } from "uuid";
import {
  BulkScrapeRequest,
  bulkScrapeRequestSchema,
  CrawlResponse,
  legacyScrapeOptions,
  RequestWithAuth,
} from "./types";
import {
  addCrawlJobs,
  lockURLs,
  saveCrawl,
  StoredCrawl,
} from "../../lib/crawl-redis";
// import { logCrawl } from "../../services/logging/crawl_log";
import { getScrapeQueue } from "../../services/queue-service";
import { getJobPriority } from "../../lib/job-priority";

/**
 * @openapi
 * /v1/bulk/scrape:
 *   post:
 *     tags:
 *       - Scraping
 *     summary: Submit a list of URLs for bulk scraping
 *     description: Enqueues multiple URLs as a single batch job. Poll /v1/bulk/scrape/{id} for results.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - urls
 *             properties:
 *               urls:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 example: ["https://example.com", "https://example.org"]
 *               waitUntil:
 *                 type: string
 *                 enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2']
 *               timeout:
 *                 type: integer
 *                 minimum: 1000
 *                 example: 30000
 *     responses:
 *       200:
 *         description: Bulk scrape job accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "018f4e2a-1234-7000-8000-abcdef012345"
 *                 url:
 *                   type: string
 *                   format: uri
 *                   example: "http://localhost:3002/v1/bulk/scrape/018f4e2a-1234-7000-8000-abcdef012345"
 *       400:
 *         description: No valid URLs provided
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
 *                   example: "No valid URLs provided after filtering"
 *       401:
 *         description: Unauthorized — missing or invalid API key
 */
export async function bulkScrapeController(
  req: RequestWithAuth<{}, CrawlResponse, BulkScrapeRequest>,
  res: Response<CrawlResponse>
) {
  req.body = bulkScrapeRequestSchema.parse(req.body);

  const id = uuidv7();

  // await logCrawl(id, req.auth.team_id);

  // Credit checking not available in firecrawl-for-agents
  // let { remainingCredits } = req.account;
  // const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === 'true';
  // if(!useDbAuthentication){
  //   remainingCredits = Infinity;
  // }

  const pageOptions = legacyScrapeOptions(req.body);

  const sc: StoredCrawl = {
    crawlerOptions: null,
    pageOptions,
    team_id: req.auth.team_id,
    createdAt: Date.now(),
    plan: req.auth.plan,
  };

  await saveCrawl(id, sc);

  let jobPriority = 20;

  // If it is over 1000, we need to get the job priority,
  // otherwise we can use the default priority of 20
  if(req.body.urls.length > 1000){
    // set base to 21
    jobPriority = await getJobPriority({plan: req.auth.plan, team_id: req.auth.team_id, basePriority: 21})
  }

  const jobs = req.body.urls.map((x) => {
    const uuid = uuidv7();
    return {
      name: uuid,
      data: {
        url: x,
        mode: "single_urls",
        team_id: req.auth.team_id,
        plan: req.auth.plan,
        crawlerOptions: null,
        pageOptions,
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

  const protocol = req.protocol;

  if (req.body.urls.length === 0) {
    return res.status(400).json({
      success: false,
      error: "No valid URLs provided after filtering",
    });
  }
  
  return res.status(200).json({
    success: true,
    id,
    url: `${protocol}://${req.get("host")}/v1/bulk/scrape/${id}`,
  });
}
