/**
 * Archon API Client for web crawling and knowledge base management
 *
 * Wraps Archon's REST API for triggering documentation crawls and tracking progress.
 * This client provides the foundation for persistent cross-project knowledge.
 *
 * Architecture:
 * - Uses native fetch (Node.js 18+) for HTTP requests
 * - Follows SCAR type safety patterns (strict TypeScript)
 * - Surfaces errors directly per git-first philosophy
 * - Optional authentication via ARCHON_TOKEN
 */

/**
 * Request payload for starting a web crawl
 * Based on docs/archon-integration.md:67-76
 */
export interface CrawlRequest {
  url: string;
  knowledge_type: 'general' | 'technical';
  tags: string[];
  update_frequency?: number; // Days between updates (default: 7)
  max_depth?: number; // Crawl depth 1-5 (default: 2)
  extract_code_examples?: boolean; // Extract code snippets (default: true)
}

/**
 * Response from crawl start endpoint
 * Based on docs/archon-integration.md:92-97
 */
export interface CrawlStartResponse {
  success: boolean;
  progressId: string; // UUID for tracking progress
  message: string;
  estimatedDuration: string;
}

/**
 * Crawl progress information
 * Based on docs/archon-integration.md:106-115
 */
export interface CrawlProgress {
  status: 'starting' | 'in_progress' | 'completed' | 'error' | 'cancelled';
  progress: number; // 0-100
  totalPages: number;
  processedPages: number;
  currentUrl: string;
  log: string;
  crawlType: 'normal' | 'sitemap' | 'llms-txt' | 'text_file';
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: string;
  ready: boolean;
}

/**
 * Archon API Client
 *
 * Provides type-safe access to Archon's web crawling and knowledge management endpoints.
 *
 * Usage:
 * ```typescript
 * const client = new ArchonClient();
 * const { progressId } = await client.startCrawl({
 *   url: 'https://docs.anthropic.com',
 *   knowledge_type: 'technical',
 *   tags: ['anthropic', 'claude-api'],
 *   max_depth: 2,
 * });
 *
 * const result = await client.pollProgress(progressId);
 * ```
 */
export class ArchonClient {
  private baseUrl: string;
  private authToken?: string;

  /**
   * Initialize Archon client
   * @param baseUrl - Archon server URL (defaults to ARCHON_URL env var or localhost:8181)
   */
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.ARCHON_URL ?? 'http://localhost:8181';
    this.authToken = process.env.ARCHON_TOKEN;
  }

  /**
   * Build fetch headers with optional authentication
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Start a web crawl operation
   *
   * Triggers Archon to crawl and index a documentation website.
   * Returns a progress ID that can be used to track completion.
   *
   * @param request - Crawl configuration
   * @returns Promise with progressId for tracking
   * @throws Error if crawl initiation fails
   *
   * Example:
   * ```typescript
   * const { progressId } = await client.startCrawl({
   *   url: 'https://docs.example.com',
   *   knowledge_type: 'technical',
   *   tags: ['example', 'docs'],
   * });
   * ```
   */
  async startCrawl(request: CrawlRequest): Promise<CrawlStartResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/knowledge-items/crawl`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Crawl failed (${response.status}): ${errorText || response.statusText}`);
      }

      const data = (await response.json()) as CrawlStartResponse;
      return data;
    } catch (error) {
      console.error('[Archon] startCrawl failed:', error);
      throw error;
    }
  }

  /**
   * Get current crawl progress
   *
   * Retrieves the current status of an ongoing or completed crawl operation.
   *
   * @param progressId - UUID from startCrawl response
   * @returns Promise with progress information
   * @throws Error if progress fetch fails
   *
   * Example:
   * ```typescript
   * const progress = await client.getProgress(progressId);
   * console.log(`Progress: ${progress.progress}%`);
   * ```
   */
  async getProgress(progressId: string): Promise<CrawlProgress> {
    try {
      const response = await fetch(`${this.baseUrl}/api/crawl-progress/${progressId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to get progress (${response.status}): ${errorText || response.statusText}`
        );
      }

      const data = (await response.json()) as CrawlProgress;
      return data;
    } catch (error) {
      console.error('[Archon] getProgress failed:', error);
      throw error;
    }
  }

  /**
   * Poll for crawl completion with optional progress callbacks
   *
   * Continuously checks crawl progress until completion, error, or timeout.
   * Calls onProgress callback for each status update.
   *
   * @param progressId - UUID from startCrawl response
   * @param onProgress - Optional callback invoked on each progress update
   * @param maxWaitMs - Maximum time to wait in milliseconds (default: 300000 = 5 minutes)
   * @returns Promise with final progress state
   * @throws Error if timeout or network error occurs
   *
   * Example:
   * ```typescript
   * const result = await client.pollProgress(
   *   progressId,
   *   (progress) => console.log(`${progress.progress}% complete`),
   *   60000 // 1 minute timeout
   * );
   * ```
   */
  async pollProgress(
    progressId: string,
    onProgress?: (progress: CrawlProgress) => void,
    maxWaitMs = 300000
  ): Promise<CrawlProgress> {
    const startTime = Date.now();
    const pollIntervalMs = 2000; // Poll every 2 seconds

    while (Date.now() - startTime < maxWaitMs) {
      const progress = await this.getProgress(progressId);

      // Invoke progress callback if provided
      if (onProgress) {
        onProgress(progress);
      }

      // Check for terminal statuses
      if (['completed', 'error', 'cancelled'].includes(progress.status)) {
        return progress;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Crawl timed out after ${maxWaitMs}ms`);
  }

  /**
   * Check if Archon server is healthy and accessible
   *
   * @returns Promise with health status
   * @throws Error if health check fails
   *
   * Example:
   * ```typescript
   * const health = await client.health();
   * if (!health.ready) {
   *   console.error('Archon not ready:', health.status);
   * }
   * ```
   */
  async health(): Promise<HealthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        return {
          status: `HTTP ${response.status}: ${response.statusText}`,
          ready: false,
        };
      }

      const data = (await response.json()) as HealthResponse;
      return data;
    } catch (error) {
      console.error('[Archon] health check failed:', error);
      return {
        status: error instanceof Error ? error.message : 'Unknown error',
        ready: false,
      };
    }
  }
}
