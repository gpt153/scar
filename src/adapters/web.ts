/**
 * Web Adapter - Socket.io-based platform adapter for web UI
 * Implements IPlatformAdapter for WebSocket-based real-time communication
 */

import { Server, Socket } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { IPlatformAdapter, ImageAttachment } from '../types';

interface WebMessage {
  conversationId: string;
  content: string;
  screenshot?: string; // Base64-encoded image
}

export class WebAdapter implements IPlatformAdapter {
  private io: Server;
  private streamingMode: 'stream' | 'batch';
  private messageHandler:
    | ((message: WebMessage & { images?: ImageAttachment[] }) => Promise<void>)
    | null = null;
  private clients: Map<string, Set<string>> = new Map(); // conversationId -> Set of socket IDs

  constructor(httpServer: HTTPServer, mode: 'stream' | 'batch' = 'stream') {
    this.streamingMode = mode;
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.WEB_UI_ORIGIN || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      path: '/socket.io',
    });

    console.log('[WebAdapter] Socket.io server initialized');
  }

  onMessage(
    handler: (message: WebMessage & { images?: ImageAttachment[] }) => Promise<void>
  ): void {
    this.messageHandler = handler;
  }

  async start(): Promise<void> {
    this.io.on('connection', (socket: Socket) => {
      console.log('[WebAdapter] Client connected', { socketId: socket.id });

      // Join conversation room
      socket.on('join', ({ conversationId }: { conversationId: string }) => {
        socket.join(conversationId);

        // Track client
        if (!this.clients.has(conversationId)) {
          this.clients.set(conversationId, new Set());
        }
        this.clients.get(conversationId)!.add(socket.id);

        console.log('[WebAdapter] Client joined room', { socketId: socket.id, conversationId });
      });

      // Handle incoming messages
      socket.on('send_message', async (data: WebMessage) => {
        if (!this.messageHandler) {
          console.error('[WebAdapter] No message handler registered');
          return;
        }

        console.log('[WebAdapter] Received message', {
          conversationId: data.conversationId,
          hasScreenshot: !!data.screenshot,
        });

        try {
          // Convert base64 screenshot to ImageAttachment if present
          let images: ImageAttachment[] | undefined;
          if (data.screenshot) {
            const base64Data = data.screenshot.split(',')[1] || data.screenshot;
            const buffer = Buffer.from(base64Data, 'base64');
            images = [
              {
                data: buffer,
                mimeType: 'image/png',
                filename: `screenshot_${Date.now()}.png`,
              },
            ];
          }

          await this.messageHandler({ ...data, images });
        } catch (error) {
          console.error('[WebAdapter] Message handling error:', error);
          socket.emit('error', { message: 'Failed to process message' });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('[WebAdapter] Client disconnected', { socketId: socket.id });

        // Clean up client tracking
        for (const [conversationId, sockets] of this.clients.entries()) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            this.clients.delete(conversationId);
          }
        }
      });
    });

    console.log('[WebAdapter] Socket.io event handlers registered');
  }

  async sendMessage(conversationId: string, message: string): Promise<void> {
    console.log('[WebAdapter] Sending message', {
      conversationId,
      length: message.length,
    });

    // Emit to all clients in the conversation room
    this.io.to(conversationId).emit('message', {
      conversationId,
      content: message,
      timestamp: new Date().toISOString(),
    });
  }

  getStreamingMode(): 'stream' | 'batch' {
    return this.streamingMode;
  }

  getPlatformType(): string {
    return 'web';
  }

  stop(): void {
    console.log('[WebAdapter] Stopping Socket.io server');
    this.io.close();
  }
}
