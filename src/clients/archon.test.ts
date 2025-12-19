/**
 * Unit tests for ArchonClient
 *
 * Tests all methods with mocked fetch responses to ensure:
 * - Correct API endpoints are called
 * - Request payloads are properly formatted
 * - Response parsing works correctly
 * - Error handling is robust
 */

// Mock fetch globally before importing ArchonClient
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { ArchonClient } from './archon';

describe('ArchonClient', () => {
  let client: ArchonClient;

  beforeEach(() => {
    client = new ArchonClient('http://test-archon:8181');
    jest.clearAllMocks();
    // Clear environment variables to test defaults
    delete process.env.ARCHON_TOKEN;
  });

  describe('constructor', () => {
    test('uses provided baseUrl', () => {
      const customClient = new ArchonClient('http://custom:9999');
      expect(customClient).toBeDefined();
    });

    test('uses ARCHON_URL environment variable when no baseUrl provided', () => {
      process.env.ARCHON_URL = 'http://env-archon:7777';
      const envClient = new ArchonClient();
      expect(envClient).toBeDefined();
    });

    test('defaults to localhost:8181 when no config provided', () => {
      delete process.env.ARCHON_URL;
      const defaultClient = new ArchonClient();
      expect(defaultClient).toBeDefined();
    });

    test('loads ARCHON_TOKEN from environment', () => {
      process.env.ARCHON_TOKEN = 'test-token-123';
      const authClient = new ArchonClient();
      expect(authClient).toBeDefined();
    });
  });

  describe('startCrawl', () => {
    test('calls correct endpoint with request payload', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          progressId: 'progress-uuid-123',
          message: 'Crawling started',
          estimatedDuration: '3-5 minutes',
        }),
      });

      const request = {
        url: 'https://docs.example.com',
        knowledge_type: 'technical' as const,
        tags: ['example', 'docs'],
        max_depth: 2,
        extract_code_examples: true,
      };

      const result = await client.startCrawl(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-archon:8181/api/knowledge-items/crawl',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(request),
        })
      );

      expect(result).toEqual({
        success: true,
        progressId: 'progress-uuid-123',
        message: 'Crawling started',
        estimatedDuration: '3-5 minutes',
      });
    });

    test('includes Authorization header when ARCHON_TOKEN is set', async () => {
      process.env.ARCHON_TOKEN = 'secret-token-456';
      const authClient = new ArchonClient('http://test-archon:8181');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          progressId: 'uuid',
          message: 'Started',
          estimatedDuration: '5 min',
        }),
      });

      await authClient.startCrawl({
        url: 'https://test.com',
        knowledge_type: 'general',
        tags: ['test'],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret-token-456',
          }),
        })
      );
    });

    test('throws error on API failure with status code', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid URL provided',
      });

      await expect(
        client.startCrawl({
          url: 'invalid-url',
          knowledge_type: 'technical',
          tags: [],
        })
      ).rejects.toThrow('Crawl failed (400): Invalid URL provided');
    });

    test('throws error on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        client.startCrawl({
          url: 'https://test.com',
          knowledge_type: 'technical',
          tags: [],
        })
      ).rejects.toThrow('Network error');
    });

    test('handles missing error text gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => '',
      });

      await expect(
        client.startCrawl({
          url: 'https://test.com',
          knowledge_type: 'technical',
          tags: [],
        })
      ).rejects.toThrow('Crawl failed (500): Internal Server Error');
    });
  });

  describe('getProgress', () => {
    test('fetches progress successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'in_progress',
          progress: 45,
          totalPages: 100,
          processedPages: 45,
          currentUrl: 'https://docs.example.com/page-45',
          log: 'Processing...',
          crawlType: 'normal',
        }),
      });

      const result = await client.getProgress('progress-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-archon:8181/api/crawl-progress/progress-123',
        expect.objectContaining({
          method: 'GET',
        })
      );

      expect(result).toEqual({
        status: 'in_progress',
        progress: 45,
        totalPages: 100,
        processedPages: 45,
        currentUrl: 'https://docs.example.com/page-45',
        log: 'Processing...',
        crawlType: 'normal',
      });
    });

    test('throws error for invalid progressId', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Progress ID not found',
      });

      await expect(client.getProgress('invalid-id')).rejects.toThrow(
        'Failed to get progress (404): Progress ID not found'
      );
    });

    test('throws error on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Connection timeout'));

      await expect(client.getProgress('progress-123')).rejects.toThrow('Connection timeout');
    });
  });

  describe('pollProgress', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('returns immediately when status is completed', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'completed',
          progress: 100,
          totalPages: 50,
          processedPages: 50,
          currentUrl: '',
          log: 'Completed successfully',
          crawlType: 'normal',
        }),
      });

      const resultPromise = client.pollProgress('progress-123');

      // Fast-forward past the delay
      await jest.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('polls multiple times before completion', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            ok: true,
            json: async () => ({
              status: 'in_progress',
              progress: callCount * 30,
              totalPages: 100,
              processedPages: callCount * 30,
              currentUrl: `https://test.com/page-${callCount}`,
              log: 'Processing...',
              crawlType: 'normal',
            }),
          };
        } else {
          return {
            ok: true,
            json: async () => ({
              status: 'completed',
              progress: 100,
              totalPages: 100,
              processedPages: 100,
              currentUrl: '',
              log: 'Done',
              crawlType: 'normal',
            }),
          };
        }
      });

      const resultPromise = client.pollProgress('progress-123');

      // Fast-forward through all timers
      await jest.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test('calls onProgress callback for each update', async () => {
      const onProgressMock = jest.fn();
      let callCount = 0;

      mockFetch.mockImplementation(async () => {
        callCount++;
        const status = callCount < 2 ? 'in_progress' : 'completed';
        return {
          ok: true,
          json: async () => ({
            status,
            progress: callCount * 50,
            totalPages: 100,
            processedPages: callCount * 50,
            currentUrl: '',
            log: 'Working...',
            crawlType: 'normal',
          }),
        };
      });

      const resultPromise = client.pollProgress('progress-123', onProgressMock);

      await jest.runAllTimersAsync();

      await resultPromise;

      expect(onProgressMock).toHaveBeenCalledTimes(2);
      expect(onProgressMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'in_progress',
          progress: 50,
        })
      );
    });

    test('throws timeout error when maxWaitMs exceeded', async () => {
      // Use real timers for this test since we need to test actual timeout behavior
      jest.useRealTimers();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'in_progress',
          progress: 10,
          totalPages: 1000,
          processedPages: 100,
          currentUrl: 'https://test.com',
          log: 'Still working...',
          crawlType: 'normal',
        }),
      });

      // Use very short timeout for testing (100ms)
      await expect(client.pollProgress('progress-123', undefined, 100)).rejects.toThrow(
        'Crawl timed out after 100ms'
      );

      // Restore fake timers for other tests
      jest.useFakeTimers();
    });

    test('returns on error status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'error',
          progress: 50,
          totalPages: 100,
          processedPages: 50,
          currentUrl: '',
          log: 'Crawl failed: Invalid domain',
          crawlType: 'normal',
        }),
      });

      const resultPromise = client.pollProgress('progress-123');

      await jest.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.status).toBe('error');
    });

    test('returns on cancelled status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'cancelled',
          progress: 25,
          totalPages: 100,
          processedPages: 25,
          currentUrl: '',
          log: 'Cancelled by user',
          crawlType: 'normal',
        }),
      });

      const resultPromise = client.pollProgress('progress-123');

      await jest.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.status).toBe('cancelled');
    });
  });

  describe('health', () => {
    test('returns healthy status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'healthy',
          ready: true,
        }),
      });

      const result = await client.health();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-archon:8181/health',
        expect.objectContaining({
          method: 'GET',
        })
      );

      expect(result).toEqual({
        status: 'healthy',
        ready: true,
      });
    });

    test('returns unhealthy status on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const result = await client.health();

      expect(result).toEqual({
        status: 'HTTP 503: Service Unavailable',
        ready: false,
      });
    });

    test('returns error status on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await client.health();

      expect(result).toEqual({
        status: 'ECONNREFUSED',
        ready: false,
      });
    });

    test('handles unknown errors gracefully', async () => {
      mockFetch.mockRejectedValue('string error');

      const result = await client.health();

      expect(result).toEqual({
        status: 'Unknown error',
        ready: false,
      });
    });
  });
});
