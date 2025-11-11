/**
 * Test adapter for validation
 * Exposes HTTP endpoints to send/receive messages for testing
 */
import { IPlatformAdapter } from '../types';

interface TestMessage {
  conversationId: string;
  message: string;
  timestamp: Date;
  direction: 'sent' | 'received';
}

export class TestAdapter implements IPlatformAdapter {
  private messages = new Map<string, TestMessage[]>();
  private streamingMode: 'stream' | 'batch' = 'stream';

  async sendMessage(conversationId: string, message: string): Promise<void> {
    console.log(`[Test] Sending to ${conversationId}: ${message.substring(0, 100)}...`);

    if (!this.messages.has(conversationId)) {
      this.messages.set(conversationId, []);
    }

    this.messages.get(conversationId)!.push({
      conversationId,
      message,
      timestamp: new Date(),
      direction: 'sent',
    });
  }

  getStreamingMode(): 'stream' | 'batch' {
    return this.streamingMode;
  }

  getPlatformType(): string {
    return 'test';
  }

  async start(): Promise<void> {
    console.log('[Test] Test adapter ready');
  }

  stop(): void {
    console.log('[Test] Test adapter stopped');
    this.messages.clear();
  }

  // Test-specific methods for HTTP endpoints

  async receiveMessage(conversationId: string, message: string): Promise<void> {
    if (!this.messages.has(conversationId)) {
      this.messages.set(conversationId, []);
    }

    this.messages.get(conversationId)!.push({
      conversationId,
      message,
      timestamp: new Date(),
      direction: 'received',
    });
  }

  getMessages(conversationId: string): TestMessage[] {
    return this.messages.get(conversationId) || [];
  }

  getSentMessages(conversationId: string): TestMessage[] {
    return this.getMessages(conversationId).filter(m => m.direction === 'sent');
  }

  clearMessages(conversationId?: string): void {
    if (conversationId) {
      this.messages.delete(conversationId);
    } else {
      this.messages.clear();
    }
  }

  getAllConversations(): string[] {
    return Array.from(this.messages.keys());
  }
}
