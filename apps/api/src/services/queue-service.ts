import { Queue } from "bullmq";
import { Logger } from "../lib/logger";
import IORedis from "ioredis";

let scrapeQueue: Queue;
let redisConnection: IORedis;

export function getRedisConnection(): IORedis {
  if (!redisConnection) {
    redisConnection = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    });
    redisConnection.on("connect", () => Logger.info("Redis connected"));
    redisConnection.on("reconnecting", () => Logger.warn("Redis reconnecting"));
    redisConnection.on("error", (err) => Logger.warn("Redis error", { err }));
  }
  return redisConnection;
}

export const scrapeQueueName = "{scrapeQueue}";

export function getScrapeQueue(): Queue<any> {
  if (!scrapeQueue) {
    scrapeQueue = new Queue(scrapeQueueName, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: {
          age: 3600, // 1 hour
        },
        removeOnFail: {
          age: 3600, // 1 hour
        },
      },
    });
    Logger.info("Web scraper queue created");
  }
  return scrapeQueue;
}
