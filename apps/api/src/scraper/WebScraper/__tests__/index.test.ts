import { WebScraperDataProvider } from '../index';
import * as redisService from '../../../services/redis';

jest.mock('../../../services/redis');
const mockGetValue = redisService.getValue as jest.MockedFunction<typeof redisService.getValue>;

function makeProvider(): WebScraperDataProvider {
  const provider = new WebScraperDataProvider();
  provider.setOptions({ jobId: 'test-job', crawlId: 'test-crawl', urls: ['https://example.com'], mode: 'single_urls' });
  return provider;
}

function makeCachedDoc(cachedAt?: number) {
  return JSON.stringify({
    content: 'cached content', markdown: '# Cached',
    metadata: { sourceURL: 'https://example.com', pageStatusCode: 200 },
    ...(cachedAt !== undefined ? { cachedAt } : {}),
    childrenLinks: [],
  });
}

describe('getCachedDocuments — minAge freshness check', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns a cache entry that is older than minAge', async () => {
    mockGetValue.mockResolvedValue(makeCachedDoc(Date.now() - 2 * 60 * 60 * 1000));
    const docs = await makeProvider().getCachedDocuments(['https://example.com'], 60 * 60 * 1000);
    expect(docs).toHaveLength(1);
    expect(docs[0].content).toBe('cached content');
  });

  it('rejects a cache entry newer than minAge (treats as cache miss)', async () => {
    mockGetValue.mockResolvedValue(makeCachedDoc(Date.now() - 60_000));
    const docs = await makeProvider().getCachedDocuments(['https://example.com'], 60 * 60 * 1000);
    expect(docs).toHaveLength(0);
  });

  it('returns cache entry when minAge is 0', async () => {
    mockGetValue.mockResolvedValue(makeCachedDoc(Date.now() - 5_000));
    const docs = await makeProvider().getCachedDocuments(['https://example.com'], 0);
    expect(docs).toHaveLength(1);
  });

  it('returns cache entry when minAge is undefined (backwards compat)', async () => {
    mockGetValue.mockResolvedValue(makeCachedDoc(Date.now() - 5_000));
    const docs = await makeProvider().getCachedDocuments(['https://example.com']);
    expect(docs).toHaveLength(1);
  });

  it('returns legacy cache entry with no cachedAt field regardless of minAge', async () => {
    mockGetValue.mockResolvedValue(makeCachedDoc());
    const docs = await makeProvider().getCachedDocuments(['https://example.com'], 60 * 60 * 1000);
    expect(docs).toHaveLength(1);
  });
});
