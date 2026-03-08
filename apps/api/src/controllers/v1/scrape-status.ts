import { scrapeStatusRateLimiter } from "../../services/rate-limiter";

/**
 * @openapi
 * /v1/scrape/{jobId}:
 *   get:
 *     tags:
 *       - Scraping
 *     summary: Get scrape job status (legacy polling endpoint)
 *     parameters:
 *       - name: jobId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Job status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   nullable: true
 *       429:
 *         description: Rate limit exceeded
 */
export async function scrapeStatusController(req: any, res: any) {
  try {
    const rateLimiter = scrapeStatusRateLimiter;
    const incomingIP = (req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress) as string;
    const iptoken = incomingIP;
    await rateLimiter.consume(iptoken);

    return res.status(200).json({
      success: true,
      data: null,
    });
  } catch (error) {
    if (error instanceof Error && error.message == "Too Many Requests") {
      return res.status(429).json({
        success: false,
        error: "Rate limit exceeded. Please try again later.",
      });
    } else {
      return res.status(500).json({
        success: false,
        error: "An unexpected error occurred.",
      });
    }
  }
}
