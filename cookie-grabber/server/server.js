#!/usr/bin/env node
/**
 * Cookie Bridge — 常驻 Relay Server
 * 
 * 职责：
 *   1. 对外（插件）：WS Server :8081，插件保持长连接
 *   2. 对内（CLI）：HTTP Server :8082 (loopback only)，CLI 通过它发请求/等结果
 * 
 * 启动：
 *   nohup node server.js >> /tmp/cookie-bridge.log 2>&1 &
 * 
 * 内部 API（HTTP localhost:8082）：
 *   POST /request   { targetUrl, reason }  → 等待 cookie 结果（长轮询）
 *   GET  /status                           → 返回插件连接状态
 *   GET  /ping                             → 健康检查
 */

const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');

const WS_PORT  = 8081;   // 对外，插件连这里（通过 cloudide.woa.com 代理）
const API_PORT = 8082;   // 对内，仅 loopback，CLI 连这里

// ─── 状态 ─────────────────────────────────────────────────────────────────────

let pluginSocket = null;
const pending = new Map();  // requestId → { resolve, reject, timer }
let reqCounter = 0;

// ─── WS Server（给插件用）────────────────────────────────────────────────────

const wsServer = http.createServer((req, res) => {
  res.writeHead(200); res.end('Cookie Bridge WS\n');
});
const wss = new WebSocketServer({ server: wsServer });

wss.on('connection', (ws, req) => {
  log(`[ws] 插件已连接 ${req.socket.remoteAddress}`);
  pluginSocket = ws;

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    log(`[ws] ← ${JSON.stringify(msg)}`);

    if (msg.type === 'PONG') return;

    if (msg.type === 'COOKIE_RESULT') {
      const p = pending.get(msg.requestId);
      if (p) { clearTimeout(p.timer); p.resolve(msg.cookies); pending.delete(msg.requestId); }
    }
    let likeCache = [];

// 在 INTERCEPT_RESULT 下方加一行缓存
if (msg.type === 'INTERCEPT_RESULT') {
  const p2 = pending.get(msg.requestId);
  if (p2) {
    clearTimeout(p2.timer);
    p2.resolve({ captured: msg.captured, url: msg.url });
    pending.delete(msg.requestId);
  }
  // 额外缓存点赞数据
  if (msg.url.includes('tab=like')) {
    for (const item of msg.captured) {
      const notes = item.data?.data?.notes || [];
      likeCache.push(...notes);
    }
  }
}

    if (msg.type === 'COOKIE_DENIED') {
      const p = pending.get(msg.requestId);
      if (p) { clearTimeout(p.timer); p.reject(new Error('用户拒绝了授权')); pending.delete(msg.requestId); }
    }
  });

  ws.on('close', () => {
    log('[ws] 插件断开');
    if (pluginSocket === ws) pluginSocket = null;
  });

  // 定时 ping
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PING' }));
    else clearInterval(heartbeat);
  }, 30000);
});

wsServer.listen(WS_PORT, '0.0.0.0', () => {
  log(`[ws]  监听 0.0.0.0:${WS_PORT}`);
  log(`[ws]  公网: wss://workspacej9jjy0b2zdgg0ebafo-${WS_PORT}.gz.cloudide.woa.com`);
});

// ─── HTTP API Server（给 CLI 用，仅 loopback）────────────────────────────────

const apiServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`);

  // GET /ping
  if (req.method === 'GET' && url.pathname === '/ping') {
    json(res, 200, { ok: true });
    return;
  }

  // GET /get-like-cache
  if (req.method === 'GET' && url.pathname === '/get-like-cache') {
    json(res, 200, { count: likeCache.length, notes: likeCache.slice(0, 100) });
    return;
  }

  // POST /intercept  — 打开页面拦截指定 API 的响应
  if (req.method === 'POST' && url.pathname === '/intercept') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); } catch {
        json(res, 400, { error: 'invalid JSON' }); return;
      }
      const { targetUrl, urlPattern, reason = '', maxWaitMs = 30000 } = payload;
      if (!targetUrl || !urlPattern) {
        json(res, 400, { error: 'targetUrl and urlPattern required' }); return;
      }
      if (!pluginSocket || pluginSocket.readyState !== WebSocket.OPEN) {
        json(res, 503, { error: '插件未连接' }); return;
      }
      const requestId = `intercept_${++reqCounter}_${Date.now()}`;
      const timer = setTimeout(() => {
        if (pending.has(requestId)) {
          pending.delete(requestId);
          json(res, 408, { error: '拦截超时' });
        }
      }, maxWaitMs + 5000);
      pending.set(requestId, {
        resolve: (data) => json(res, 200, { ok: true, ...data }),
        reject:  (err)  => json(res, 400, { error: err.message }),
        timer,
      });
      const msg = { type: 'INTERCEPT_API', requestId, targetUrl, urlPattern, maxWaitMs };
      pluginSocket.send(JSON.stringify(msg));
      log(`[api] → intercept 请求 ${requestId} url=${targetUrl} pattern=${urlPattern}`);
    });
    return;
  }

  // POST /request   — 发起一次 cookie 请求（长轮询）
  if (req.method === 'POST' && url.pathname === '/request') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); } catch {
        json(res, 400, { error: 'invalid JSON' }); return;
      }

      const { targetUrl, reason = '' } = payload;
      if (!targetUrl) { json(res, 400, { error: 'targetUrl required' }); return; }

      if (!pluginSocket || pluginSocket.readyState !== WebSocket.OPEN) {
        json(res, 503, { error: '插件未连接。请先在 Chrome 中打开 Cookie Bridge 插件并连接服务器。' });
        return;
      }

      const requestId = `req_${++reqCounter}_${Date.now()}`;
      const TIMEOUT = 300_000; // 5 分钟

      const timer = setTimeout(() => {
        if (pending.has(requestId)) {
          pending.delete(requestId);
          json(res, 408, { error: `请求超时（${TIMEOUT / 1000}s）` });
        }
      }, TIMEOUT);

      pending.set(requestId, {
        resolve: (cookies) => json(res, 200, { ok: true, cookies }),
        reject:  (err)     => json(res, 400, { error: err.message }),
        timer,
      });

      const msg = { type: 'REQUEST_COOKIE', requestId, targetUrl, reason };
      pluginSocket.send(JSON.stringify(msg));
      log(`[api] → 已发送请求 ${requestId} targetUrl=${targetUrl}`);
    });
    return;
  }

  json(res, 404, { error: 'not found' });
});

apiServer.listen(API_PORT, '127.0.0.1', () => {
  log(`[api] 监听 127.0.0.1:${API_PORT}（仅本机 CLI 可访问）`);
});

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

process.on('uncaughtException', (e) => log('[error]', e.message));
process.on('unhandledRejection', (e) => log('[error]', e));
