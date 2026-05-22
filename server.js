const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 3050;
const ROOM = 'main';
const MAX_PEERS = 2;
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
};

const server = http.createServer((req, res) => {
    const filePath = (req.url === '/' || req.url.startsWith('/room/'))
        ? path.join(__dirname, 'public', 'index.html')
        : path.join(__dirname, 'public', req.url);
    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

const wss = new WebSocketServer({ server });
const peers = new Map(); // peerId -> { ws }

wss.on('connection', (ws) => {
    // Reject if room already has 2 peers
    if (peers.size >= MAX_PEERS) {
        ws.send(JSON.stringify({ type: 'room-full' }));
        ws.close(4001, 'Room is full (max 2 peers)');
        console.log(`[${ROOM}] Rejected connection, room full (${peers.size})`);
        return;
    }

    const peerId = Math.random().toString(36).substring(2, 10);
    const existing = Array.from(peers.keys());

    peers.set(peerId, { ws });
    console.log(`[${ROOM}] ${peerId} joined. Total: ${peers.size}`);

    ws.send(JSON.stringify({ type: 'init', peerId, peers: existing }));
    broadcast({ type: 'peer-joined', peerId });

    ws.on('message', (data, isBinary) => {
        if (isBinary || Buffer.isBuffer(data)) {
            const firstByte = Buffer.isBuffer(data) ? data[0] : '?';
            if (firstByte === 1) console.log(`  ➔ audio ${data.length}B from ${peerId.substring(0,6)}`);
            const peersFwd = [];
            for (const [id, info] of peers) {
                if (id !== peerId && info.ws.readyState === 1) {
                    info.ws.send(data, { binary: true });
                    peersFwd.push(id.substring(0,6));
                }
            }
            if (firstByte === 1) console.log(`    → forwarded to ${peersFwd.join(',')}`);
            return;
        }
        try {
            const msg = JSON.parse(data);
            if (msg.to) {
                const target = peers.get(msg.to);
                if (target && target.ws.readyState === 1) {
                    target.ws.send(JSON.stringify({ from: peerId, type: msg.type, data: msg.data }));
                }
            }
        } catch(e) {}
    });

    ws.on('close', () => {
        peers.delete(peerId);
        console.log(`[${ROOM}] ${peerId} left. Total: ${peers.size}`);
        broadcast({ type: 'peer-left', peerId });
    });

    function broadcast(msg) {
        for (const [id, info] of peers) {
            if (id !== peerId && info.ws.readyState === 1) {
                info.ws.send(JSON.stringify(msg));
            }
        }
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Relay server running on :${PORT}, room: ${ROOM}, max: ${MAX_PEERS}`);
});
