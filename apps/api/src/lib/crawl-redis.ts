import { WebCrawler } from "../scraper/WebScraper/crawler";
import { getRedisConnection } from "../services/queue-service";

export type StoredCrawl = {
  originUrl?: string;
  crawlerOptions: any;
  pageOptions: any;
  team_id: string;
  plan: string;
  robots?: string;
  cancelled?: boolean;
  createdAt: number;
};

export async function saveCrawl(id: string, crawl: StoredCrawl) {
  const redis = getRedisConnection();
  await redis.set("crawl:" + id, JSON.stringify(crawl), "EX", 24 * 60 * 60);
}

export async function getCrawl(id: string): Promise<StoredCrawl | null> {
  const redis = getRedisConnection();
  const x = await redis.get("crawl:" + id);

  if (x === null) {
    return null;
  }

  return JSON.parse(x);
}

export async function getCrawlExpiry(id: string): Promise<Date> {
  const d = new Date();
  const redis = getRedisConnection();
  const ttl = await redis.pttl("crawl:" + id);
  d.setMilliseconds(d.getMilliseconds() + ttl);
  d.setMilliseconds(0);
  return d;
}

export async function addCrawlJob(id: string, job_id: string) {
  const redis = getRedisConnection();
  const pipeline = redis.pipeline();
  pipeline.sadd("crawl:" + id + ":jobs", job_id);
  pipeline.expire("crawl:" + id + ":jobs", 24 * 60 * 60);
  await pipeline.exec();
}

export async function addCrawlJobs(id: string, job_ids: string[]) {
  const redis = getRedisConnection();
  const pipeline = redis.pipeline();
  pipeline.sadd("crawl:" + id + ":jobs", ...job_ids);
  pipeline.expire("crawl:" + id + ":jobs", 24 * 60 * 60);
  await pipeline.exec();
}

export async function addCrawlJobDone(id: string, job_id: string) {
  const redis = getRedisConnection();
  const pipeline = redis.pipeline();
  pipeline.sadd("crawl:" + id + ":jobs_done", job_id);
  pipeline.lpush("crawl:" + id + ":jobs_done_ordered", job_id);
  pipeline.expire("crawl:" + id + ":jobs_done", 24 * 60 * 60);
  pipeline.expire("crawl:" + id + ":jobs_done_ordered", 24 * 60 * 60);
  await pipeline.exec();
}

export async function getDoneJobsOrderedLength(id: string): Promise<number> {
  const redis = getRedisConnection();
  return await redis.llen("crawl:" + id + ":jobs_done_ordered");
}

export async function getDoneJobsOrdered(
  id: string,
  start = 0,
  end = -1,
): Promise<string[]> {
  const redis = getRedisConnection();
  return await redis.lrange(
    "crawl:" + id + ":jobs_done_ordered",
    start,
    end,
  );
}

export async function isCrawlFinished(id: string) {
  const redis = getRedisConnection();
  return (
    (await redis.scard("crawl:" + id + ":jobs_done")) ===
    (await redis.scard("crawl:" + id + ":jobs"))
  );
}

export async function isCrawlFinishedLocked(id: string) {
  const redis = getRedisConnection();
  return await redis.exists("crawl:" + id + ":finish");
}

export async function finishCrawl(id: string) {
  if (await isCrawlFinished(id)) {
    const redis = getRedisConnection();
    const set = await redis.setnx("crawl:" + id + ":finish", "yes");
    if (set === 1) {
      await redis.expire("crawl:" + id + ":finish", 24 * 60 * 60);
    }
    return set === 1;
  }
}

export async function getCrawlJobs(id: string): Promise<string[]> {
  const redis = getRedisConnection();
  return await redis.smembers("crawl:" + id + ":jobs");
}

export function normalizeURL(url: string, sc: StoredCrawl): string {
  const urlO = new URL(url);
  if (sc && sc.crawlerOptions && sc.crawlerOptions.ignoreQueryParameters) {
    urlO.search = "";
  }
  // allow hash-based routes (e.g. #/ and #!/), strip all other hashes
  if (
    !urlO.hash ||
    urlO.hash.length <= 2 ||
    (!urlO.hash.startsWith("#/") && !urlO.hash.startsWith("#!/"))
  ) {
    urlO.hash = "";
  }
  return urlO.href;
}

export async function lockURL(
  id: string,
  sc: StoredCrawl,
  url: string,
): Promise<boolean> {
  url = normalizeURL(url, sc);
  const redis = getRedisConnection();
  if (typeof sc.crawlerOptions?.limit === "number") {
    if (
      (await redis.scard("crawl:" + id + ":visited_unique")) >=
      sc.crawlerOptions.limit
    ) {
      return false;
    }
  }

  let res: boolean;
  if (!sc.crawlerOptions?.deduplicateSimilarURLs) {
    res = (await redis.sadd("crawl:" + id + ":visited", url)) !== 0;
  } else {
    const permutation = generateURLPermutations(url)[0].href;
    const x = await redis.sadd("crawl:" + id + ":visited", permutation);
    res = x !== 0;
  }

  await redis.expire("crawl:" + id + ":visited", 24 * 60 * 60, "NX");

  if (res) {
    await redis.sadd("crawl:" + id + ":visited_unique", url);
    await redis.expire("crawl:" + id + ":visited_unique", 24 * 60 * 60, "NX");
  }

  return res;
}

/// NOTE: does not check limit. only use if limit is checked beforehand e.g. with sitemap
export async function lockURLs(id: string, sc: StoredCrawl, urls: string[]): Promise<boolean> {
  urls = urls.map(url => normalizeURL(url, sc));
  const redis = getRedisConnection();
  let res: boolean;
  if (!sc.crawlerOptions?.deduplicateSimilarURLs) {
    res = (await redis.sadd("crawl:" + id + ":visited", ...urls)) !== 0;
  } else {
    const allPermutations = urls.map(url => generateURLPermutations(url)[0].href);
    const x = await redis.sadd("crawl:" + id + ":visited", ...allPermutations);
    res = x !== 0;
  }

  await redis.expire("crawl:" + id + ":visited", 24 * 60 * 60, "NX");

  if (res) {
    await redis.sadd("crawl:" + id + ":visited_unique", ...urls);
    await redis.expire("crawl:" + id + ":visited_unique", 24 * 60 * 60, "NX");
  }

  return res;
}

// For this function and the infrastructure surrounding it to work correctly, this function must:
// 1. Return the a non-zero number of permutations for all valid URLs.
//    generateURLPermutations(url).length > 0
// 2. The generated permutations of the returned array's members must be the same as the original generated permutations.
//    generateURLPermutations(url) == generateURLPermutations(generateURLPermutations(url)[n])
//    Obviously this is not valid in JS, but you get the idea.
// 3. Two generated permutations of signficantly different URLs may not have any overlap.
//    In practice, this means that if there is a generated array of permutations, there must be no URL that is
//     1. not included in that array, and
//     2. has a permutation that is included in that array.
//
// Points 1 and 2 are proven in permu-refactor.test.ts, point 3 is not as proving a negative is hard and outside the scope of a web crawler.
// - mogery
export function generateURLPermutations(url: string | URL): URL[] {
  const urlO = new URL(url);

  // Construct two versions, one with www., one without
  const urlWithWWW = new URL(urlO);
  const urlWithoutWWW = new URL(urlO);
  if (urlO.hostname.startsWith("www.")) {
    urlWithoutWWW.hostname = urlWithWWW.hostname.slice(4);
  } else {
    urlWithWWW.hostname = "www." + urlWithoutWWW.hostname;
  }

  let permutations = [urlWithWWW, urlWithoutWWW];

  // Construct more versions for http/https
  permutations = permutations.flatMap((urlO) => {
    if (!["http:", "https:"].includes(urlO.protocol)) {
      return [urlO];
    }

    const urlWithHTTP = new URL(urlO);
    const urlWithHTTPS = new URL(urlO);
    urlWithHTTP.protocol = "http:";
    urlWithHTTPS.protocol = "https:";

    return [urlWithHTTP, urlWithHTTPS];
  });

  // Construct more versions for index.html/index.php
  permutations = permutations.flatMap((urlO) => {
    const urlWithHTML = new URL(urlO);
    const urlWithPHP = new URL(urlO);
    const urlWithBare = new URL(urlO);
    const urlWithSlash = new URL(urlO);

    if (urlO.pathname.endsWith("/")) {
      urlWithBare.pathname = urlWithBare.pathname.length === 1 ? urlWithBare.pathname : urlWithBare.pathname.slice(0, -1);
      urlWithHTML.pathname += "index.html";
      urlWithPHP.pathname += "index.php";
    } else if (urlO.pathname.endsWith("/index.html")) {
      urlWithPHP.pathname = urlWithPHP.pathname.slice(0, -"index.html".length) + "index.php";
      urlWithSlash.pathname = urlWithSlash.pathname.slice(0, -"index.html".length);
      urlWithBare.pathname = urlWithBare.pathname.slice(0, -"/index.html".length);
    } else if (urlO.pathname.endsWith("/index.php")) {
      urlWithHTML.pathname = urlWithHTML.pathname.slice(0, -"index.php".length) + "index.html";
      urlWithSlash.pathname = urlWithSlash.pathname.slice(0, -"index.php".length);
      urlWithBare.pathname = urlWithBare.pathname.slice(0, -"/index.php".length);
    } else {
      urlWithSlash.pathname += "/";
      urlWithHTML.pathname += "/index.html";
      urlWithPHP.pathname += "/index.php";
    }

    return [urlWithHTML, urlWithPHP, urlWithSlash, urlWithBare];
  });

  return [...new Set(permutations.map(x => x.href))].map(x => new URL(x));
}

export function crawlToCrawler(id: string, sc: StoredCrawl): WebCrawler {
  const crawler = new WebCrawler({
    jobId: id,
    initialUrl: sc.originUrl || "",
    includes: sc.crawlerOptions?.includes ?? [],
    excludes: sc.crawlerOptions?.excludes ?? [],
    maxCrawledLinks: sc.crawlerOptions?.maxCrawledLinks ?? 1000,
    maxCrawledDepth: sc.crawlerOptions?.maxDepth ?? 10,
    limit: sc.crawlerOptions?.limit ?? 10000,
    allowExternalLinks: sc.crawlerOptions?.allowExternalLinks ?? false,
    crawlId: id,
    maxDiscoveryDepth: sc.crawlerOptions?.maxDiscoveryDepth,
    currentDiscoveryDepth: sc.crawlerOptions?.currentDiscoveryDepth ?? 0,
  });

  if (sc.robots !== undefined) {
    try {
      crawler.importRobotsTxt(sc.robots);
    } catch (_) {}
  }

  return crawler;
}
