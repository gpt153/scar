import { useEffect, useCallback, useState } from 'react';
import { socket } from '../socket';
import type { Message, WebSocketMessage, CLIEvent } from '../types';

export function useSocket(conversationId: string | null) {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<CLIEvent[]>([]);

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      console.log('[useSocket] Connected');
    }

    function onDisconnect() {
      setIsConnected(false);
      console.log('[useSocket] Disconnected');
    }

    function onMessage(msg: WebSocketMessage) {
      console.log('[useSocket] Message received', msg);
      const newMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: msg.conversationId,
        sender: msg.sender,
        content: msg.content,
        created_at: msg.timestamp,
      };
      setMessages((prev) => [...prev, newMessage]);
      // Don't duplicate to CLI events - those come from cli_event separately
    }

    function onCLIEvent(event: CLIEvent) {
      console.log('[useSocket] CLI event received', event);
      setEvents((prev) => [...prev, event]);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('message', onMessage);
    socket.on('cli_event', onCLIEvent);

    // Connect if not already
    if (!socket.connected) {
      socket.connect();
    }

    // Join conversation room if specified
    if (conversationId && socket.connected) {
      socket.emit('join', { conversationId });
      // Clear events when switching conversations
      setMessages([]);
      setEvents([]);
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('message', onMessage);
      socket.off('cli_event', onCLIEvent);
    };
  }, [conversationId]);

  const sendMessage = useCallback(
    (content: string, screenshot?: string) => {
      if (!conversationId) {
        console.error('[useSocket] No conversation selected');
        return;
      }

      socket.emit('send_message', {
        conversationId,
        content,
        screenshot,
      });

      // Optimistically add user message to UI
      const userMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        sender: 'user',
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
    },
    [conversationId]
  );

  return {
    isConnected,
    messages,
    events,
    sendMessage,
    setMessages,
  };
}
