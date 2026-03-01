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
 *               waitUntil:
 *                 type: string
 *                 enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2']
 *               timeout:
 *                 type: integer
 *                 minimum: 1000
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
 *                 jobId:
 *                   type: string
 */
export async function scrapeController(
  req: RequestWithAuth<{}, ScrapeResponse, ScrapeRequest>,
  res: Response<ScrapeResponse>
) {
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
