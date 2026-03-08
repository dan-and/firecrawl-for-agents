import { Request, Response } from "express";
import { Logger } from "../../lib/logger";
import {
  legacyDocumentConverter,
  legacyScrapeOptions,
  RequestWithAuth,
  ScrapeRequest,
  scrapeRequestSchema,
  ScrapeResponse,
} from "./types";
import { v7 as uuidv7 } from "uuid";
import { addScrapeJobRaw, waitForJob } from "../../services/queue-jobs";
import { getScrapeQueue } from "../../services/queue-service";
import { getJobPriority } from "../../lib/job-priority";
import { PlanType } from "../../types";

/**
 * @openapi
 * /v1/scrape:
 *   post:
 *     tags:
 *       - Scraping
 *     summary: Scrape a single webpage
 *     description: Fetches and converts a single URL to Markdown. Supports plain HTTP fetch, CycleTLS (anti-bot), and Hero browser engine as automatic fallback tiers.
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
 *               waitUntil:
 *                 type: string
 *                 enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2']
 *                 description: Browser wait condition (only applies when Hero engine is used)
 *               timeout:
 *                 type: integer
 *                 minimum: 1000
 *                 example: 30000
 *                 description: Request timeout in milliseconds
 *               parsePDF:
 *                 type: boolean
 *                 default: true
 *                 description: Extract text from PDF URLs
 *               proxy:
 *                 type: string
 *                 enum: ['fetch', 'cycletls', 'playwright']
 *                 description: Force a specific scraping engine (fetch=plain HTTP, cycletls=anti-bot, playwright=Hero browser)
 *     responses:
 *       200:
 *         description: Page scraped successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     markdown:
 *                       type: string
 *                       description: Page content converted to Markdown
 *                     html:
 *                       type: string
 *                       description: Raw HTML of the page
 *                     metadata:
 *                       type: object
 *                       properties:
 *                         title:
 *                           type: string
 *                         description:
 *                           type: string
 *                         statusCode:
 *                           type: integer
 *                           example: 200
 *                         url:
 *                           type: string
 *                           format: uri
 *       400:
 *         description: Bad request — invalid URL or missing required field
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
 *       500:
 *         description: Scrape failed — all engine tiers exhausted
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
 */
export async function scrapeController(
  req: RequestWithAuth<{}, ScrapeResponse, ScrapeRequest>,
  res: Response<ScrapeResponse>
) {
  // Guard: actions require the Hero browser service to be configured
  if (Array.isArray(req.body?.actions) && req.body.actions.length > 0) {
    const heroConfigured = !!process.env.PLAYWRIGHT_MICROSERVICE_URL;
    if (!heroConfigured) {
      return res.status(400).json({
        success: false,
        error:
          "Browser actions require the Hero browser service. " +
          "Set PLAYWRIGHT_MICROSERVICE_URL to point to a running Hero service instance.",
      });
    }
  }

  req.body = scrapeRequestSchema.parse(req.body);

  const origin = req.body.origin;
  const timeout = req.body.timeout;
  const pageOptions = legacyScrapeOptions(req.body);
  const jobId = uuidv7();

  const jobPriority = await getJobPriority({
    plan: req.auth.plan as PlanType,
    team_id: req.auth.team_id,
    basePriority: 10,
  });

  const job = await addScrapeJobRaw(
    {
      url: req.body.url,
      mode: "single_urls",
      crawlerOptions: {},
      team_id: req.auth.team_id,
      pageOptions,
      origin: req.body.origin,
      is_scrape: true,
      crawl_id: jobId,
    },
    {},
    jobId,
    jobPriority
  );

  let doc: any | undefined;
  try {
    doc = (await waitForJob(job.id, timeout))[0];
  } catch (e) {
    Logger.error(`Error in scrapeController: ${e}`);
    if (e instanceof Error && e.message.startsWith("Job wait")) {
      return res.status(408).json({
        success: false,
        error: "Request timed out",
      });
    } else {
      const message = e instanceof Error ? e.message : String(e);
      Logger.error(`Scrape failed for job`, { error: message });
      return res.status(500).json({
        success: false,
        error: message.length > 0 ? message : "An unexpected error occurred while scraping. Please try again.",
      });
    }
  }

  // Get the job from the queue to access processedOn and timestamp
  const jobFromQueue = await getScrapeQueue().getJob(job.id);
  const queueDurationMs: number | null =
    jobFromQueue?.processedOn != null && jobFromQueue?.timestamp != null
      ? jobFromQueue.processedOn - jobFromQueue.timestamp
      : null;

  await job.remove();

  if (!doc) {
    Logger.error("Panic: Document processing failed", { doc, job: job.id });
    return res.status(200).json({
      success: true,
      warning: "No page found",
      data: doc,
    });
  }

  delete doc.index;
  delete doc.provider;

  if (!pageOptions || !pageOptions.includeRawHtml) {
    if (doc && doc.rawHtml !== undefined) {
      delete doc.rawHtml;
    }
  }

  if (!pageOptions || !pageOptions.includeHtml) {
    if (doc && doc.html !== undefined) {
      delete doc.html;
    }
  }

  if (pageOptions && pageOptions.includeExtract) {
    if (!pageOptions.includeMarkdown && doc && doc.markdown) {
      delete doc.markdown;
    }
  }

  const converted = legacyDocumentConverter(doc);
  if (queueDurationMs != null && converted.metadata) {
    (converted.metadata as any) = { ...converted.metadata, queueDurationMs };
  }
  return res.status(200).json({
    success: true,
    data: converted,
    scrape_id: origin?.includes("website") ? jobId : undefined,
  });
}
