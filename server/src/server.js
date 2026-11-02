import http from 'node:http';
import { app } from './app.js';
import { attachWebSocket } from './wsHub.js';

const port = Number(process.env.SERVER_PORT) || 3090;
const host = '0.0.0.0';

const server = http.createServer(app);
attachWebSocket(server);

server.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port} (ws on /ws)`);
});
