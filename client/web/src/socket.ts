import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.PROD ? window.location.origin : 'http://localhost:3000';

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  path: '/socket.io',
  transports: ['websocket', 'polling'],
});

// Enable connection logging in development
if (import.meta.env.DEV) {
  socket.on('connect', () => {
    console.log('[Socket] Connected', { id: socket.id });
  });

  socket.on('disconnect', reason => {
    console.log('[Socket] Disconnected', { reason });
  });

  socket.on('connect_error', error => {
    console.error('[Socket] Connection error:', error);
  });
}

export default socket;
