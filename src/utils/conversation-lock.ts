/**
 * Conversation Lock Manager
 *
 * Manages non-blocking concurrent conversation handling with:
 * - Global concurrency limit (max N conversations simultaneously)
 * - Per-conversation ordering (messages process sequentially per conversation)
 * - Explicit queueing with observability
 */

/**
 * Represents a queued message waiting for processing
 */
interface QueuedMessage {
  handler: () => Promise<void>;
  timestamp: number;
}

/**
 * Manages conversation locks for concurrent message processing
 */
export class ConversationLockManager {
  private activeConversations: Map<string, Promise<void>>;
  private messageQueues: Map<string, QueuedMessage[]>;
  private maxConcurrent: number;

  /**
   * Creates a new ConversationLockManager
   * @param maxConcurrent - Maximum number of concurrent conversations (default: 10)
   */
  constructor(maxConcurrent = 10) {
    this.activeConversations = new Map<string, Promise<void>>();
    this.messageQueues = new Map<string, QueuedMessage[]>();
    this.maxConcurrent = maxConcurrent;
    console.log('[ConversationLock] Initialized', { maxConcurrent });
  }

  /**
   * Acquire lock for conversation and execute handler
   * Non-blocking: returns immediately, handler executes async
   * @param conversationId - Unique conversation identifier
   * @param handler - Async function to execute
   */
  async acquireLock(conversationId: string, handler: () => Promise<void>): Promise<void> {
    // Check if conversation already active - queue if yes
    if (this.activeConversations.has(conversationId)) {
      this.queueMessage(conversationId, handler);
      return;
    }

    // Check if at max capacity - queue if yes
    if (this.activeConversations.size >= this.maxConcurrent) {
      console.log(`[ConversationLock] At max capacity (${this.maxConcurrent}), queuing ${conversationId}`);
      this.queueMessage(conversationId, handler);
      return;
    }

    // Execute immediately
    console.log(`[ConversationLock] Starting ${conversationId}`, {
      active: this.activeConversations.size + 1,
      queued: this.getQueuedCount()
    });

    // Store Promise in Map BEFORE awaiting (prevents race conditions)
    const promise = handler()
      .catch(error => {
        console.error(`[ConversationLock] Error in ${conversationId}:`, error);
      })
      .finally(() => {
        // Clean up active conversation
        this.activeConversations.delete(conversationId);
        console.log(`[ConversationLock] Completed ${conversationId}`, {
          active: this.activeConversations.size,
          queued: this.getQueuedCount()
        });

        // Process next queued message for this conversation
        this.processQueue(conversationId).catch(error => {
          console.error(`[ConversationLock] Queue processing error for ${conversationId}:`, error);
        });

        // Also check if we can process any other queued conversations (global capacity freed up)
        this.processGlobalQueue().catch(error => {
          console.error('[ConversationLock] Global queue processing error:', error);
        });
      });

    this.activeConversations.set(conversationId, promise);

    // Fire-and-forget: don't await here, return immediately
  }

  /**
   * Add message to conversation queue
   * @param conversationId - Unique conversation identifier
   * @param handler - Async function to queue
   */
  private queueMessage(conversationId: string, handler: () => Promise<void>): void {
    if (!this.messageQueues.has(conversationId)) {
      this.messageQueues.set(conversationId, []);
    }
    this.messageQueues.get(conversationId)!.push({
      handler,
      timestamp: Date.now()
    });
    console.log(`[ConversationLock] Queued message for ${conversationId}`, {
      queueLength: this.messageQueues.get(conversationId)!.length
    });
  }

  /**
   * Process next queued message for conversation if any exist
   * @param conversationId - Unique conversation identifier
   */
  private async processQueue(conversationId: string): Promise<void> {
    const queue = this.messageQueues.get(conversationId);
    if (!queue || queue.length === 0) {
      this.messageQueues.delete(conversationId);
      return;
    }

    const next = queue.shift()!;
    const waitTime = Date.now() - next.timestamp;
    console.log('[ConversationLock] Processing queued message', {
      conversationId,
      waitTimeMs: waitTime
    });

    await this.acquireLock(conversationId, next.handler);
  }

  /**
   * Get current concurrency statistics
   * @returns Current state for observability
   */
  getStats(): {
    active: number;
    queuedTotal: number;
    queuedByConversation: { conversationId: string; queuedMessages: number }[];
    maxConcurrent: number;
    activeConversationIds: string[];
  } {
    const queuedByConversation = Array.from(this.messageQueues.entries()).map(
      ([id, queue]) => ({
        conversationId: id,
        queuedMessages: queue.length
      })
    );

    return {
      active: this.activeConversations.size,
      queuedTotal: Array.from(this.messageQueues.values()).reduce(
        (sum, q) => sum + q.length,
        0
      ),
      queuedByConversation,
      maxConcurrent: this.maxConcurrent,
      activeConversationIds: Array.from(this.activeConversations.keys())
    };
  }

  /**
   * Helper to get total queued count
   */
  private getQueuedCount(): number {
    return Array.from(this.messageQueues.values()).reduce((sum, q) => sum + q.length, 0);
  }

  /**
   * Process queued messages from any conversation when global capacity available
   */
  private async processGlobalQueue(): Promise<void> {
    // Check if we have capacity
    if (this.activeConversations.size >= this.maxConcurrent) {
      return;
    }

    // Find first conversation with queued messages that's not currently active
    for (const [convId, queue] of this.messageQueues.entries()) {
      if (queue.length > 0 && !this.activeConversations.has(convId)) {
        await this.processQueue(convId);
        break; // Process one at a time
      }
    }
  }
}
