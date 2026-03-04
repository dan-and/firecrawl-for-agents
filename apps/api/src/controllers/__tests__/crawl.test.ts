import { crawlController } from '../v0/crawl'
import { Request, Response } from 'express';
import { v7 as uuidv7 } from 'uuid';

jest.mock('../auth', () => ({
  authenticateUser: jest.fn().mockResolvedValue({
    success: true,
    team_id: 'team123',
    error: null,
    status: 200
  }),
  reduce: jest.fn()
}));
// NOTE: Disabled for Jest 30 compatibility. The 'validate' module does not exist.
// jest.mock('../../services/idempotency/validate');

describe('crawlController', () => {
  it.skip('should prevent duplicate requests using the same idempotency key', async () => {
    const req = {
      headers: {
        'x-idempotency-key': await uuidv7(),
        'Authorization': `Bearer ${process.env.TEST_API_KEY}`
      },
      body: {
        url: 'https://mendable.ai'
      }
    } as unknown as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;

    // First request should succeed
    await crawlController(req, res);
    expect(res.status).not.toHaveBeenCalledWith(409);

    // Second request with the same key should fail
    await crawlController(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Idempotency key already used' });
  });
});