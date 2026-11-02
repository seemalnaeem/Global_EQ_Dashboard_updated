import { WebSocketServer } from 'ws';

// Minimal WebSocket hub mounted at /ws. Tracks connected clients and
// exposes broadcast() so an ingest pipeline can push new quakes live later.
export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'hello', message: 'connected to quake stream' }));

    ws.on('message', () => {
      // Clients do not send commands yet; accept and ignore, do not crash.
    });

    ws.on('error', (err) => {
      console.error('[ws] client error:', err.message);
    });
  });

  return wss;
}

export function broadcast(wss, payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(data);
  }
}
