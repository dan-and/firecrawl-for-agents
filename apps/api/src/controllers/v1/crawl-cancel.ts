import { Request, Response } from "express";
import { authenticateUser } from "../auth";
import { RateLimiterMode } from "../../types";
import { Logger } from "../../lib/logger";
import { getCrawl, saveCrawl, isCrawlFinishedLocked } from "../../lib/crawl-redis";
import { configDotenv } from "dotenv";
configDotenv();

/**
 * @openapi
 * /v1/crawl/{jobId}:
 *   delete:
 *     tags:
 *       - Crawling
 *     summary: Cancel a running crawl job
 *     description: Marks the crawl as cancelled. Pages already scraped remain available via GET /v1/crawl/{jobId}.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: jobId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "018f4e2a-1234-7000-8000-abcdef012345"
 *     responses:
 *       200:
 *         description: Cancellation accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "cancelled"
 *       401:
 *         description: Unauthorized — missing or invalid API key
 *       404:
 *         description: Job not found
 *       409:
 *         description: Job is already completed — cannot cancel
 */
export async function crawlCancelController(req: Request, res: Response) {
  try {
    const { success, team_id, error, status } = await authenticateUser(
      req,
      res,
      RateLimiterMode.CrawlStatus
    );
    if (!success) {
      return res.status(status).json({ error });
    }

    const sc = await getCrawl(req.params.jobId);
    if (!sc) {
      return res.status(404).json({ error: "Job not found" });
    }

    const alreadyFinished = await isCrawlFinishedLocked(req.params.jobId);
    if (alreadyFinished) {
      return res.status(409).json({ error: "Crawl job is already completed" });
    }

    try {
      sc.cancelled = true;
      await saveCrawl(req.params.jobId, sc);
    } catch (error) {
      Logger.error(error);
    }

    res.json({
      status: "cancelled"
    });
  } catch (error) {
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
