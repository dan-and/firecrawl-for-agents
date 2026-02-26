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
  // actions are not yet implemented — fail fast with a helpful message
  const rawBody = req.body as any;
  if (Array.isArray(rawBody?.actions) && rawBody.actions.length > 0) {
    return res.status(400).json({
      success: false,
      error:
        "Browser actions (click, type, scroll, wait, etc.) are not yet supported in this deployment. " +
        "Actions require the Hero browser service to be extended with action handlers. " +
        "Remove the 'actions' field from your request.",
    });
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
      return res.status(500).json({
        success: false,
        error: `(Internal server error) - ${e && e?.message ? e.message : e}`,
      });
    }
  }

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
    if (doc && doc.rawHtml) {
      delete doc.rawHtml;
    }
  }

  if (pageOptions && pageOptions.includeExtract) {
    if (!pageOptions.includeMarkdown && doc && doc.markdown) {
      delete doc.markdown;
    }
  }

  return res.status(200).json({
    success: true,
    data: legacyDocumentConverter(doc),
    scrape_id: origin?.includes("website") ? jobId : undefined,
  });
}
