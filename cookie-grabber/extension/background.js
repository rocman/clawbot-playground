// background.js - Service Worker
// 只接受来自 cloudide.woa.com 的 WebSocket 服务端

const ALLOWED_WS_ORIGINS = [
  'wss://workspacej9jjy0b2zdgg0ebafo-8081.gz.cloudide.woa.com'
];

let ws = null;
let pendingRequest = null; // { requestId, targetUrl, resolve }

// ─── WebSocket 连接管理 ───────────────────────────────────────────────────────

function connectWS(wsUrl) {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[CookieBridge] WS connected:', wsUrl);
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  };

  ws.onmessage = async (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    // 服务端发来的登录态请求
    if (msg.type === 'REQUEST_COOKIE') {
      const { requestId, targetUrl, reason } = msg;
      // 存储待处理请求
      pendingRequest = { requestId, targetUrl, reason };
      await chrome.storage.session.set({ pendingRequest });

      // 通知 popup 弹出（打开 badge）
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });

      // 尝试打开 popup（仅在用户关注时有效，备用方案是用 notification）
      // 主要靠 badge 吸引用户点击
    }

    if (msg.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG' }));
    }

    // 服务端要求拦截某个页面的 API 响应
    if (msg.type === 'INTERCEPT_API') {
      const { requestId, targetUrl, urlPattern, maxWaitMs = 30000 } = msg;
      await chrome.storage.session.set({
        interceptTab: { requestId, tabId: null, targetUrl, urlPattern, maxWaitMs }
      });

      chrome.tabs.create({ url: targetUrl }, async (tab) => {
        const tabId = tab.id;
        await chrome.storage.session.set({
          interceptTab: { requestId, tabId, targetUrl, urlPattern, maxWaitMs }
        });

        const captured = [];
        const pattern = new RegExp(urlPattern);
        let finished = false;

        // attach debugger
        chrome.debugger.attach({ tabId }, '1.3', () => {
          if (chrome.runtime.lastError) {
            console.log('[CookieBridge] debugger attach failed:', chrome.runtime.lastError.message);
            return;
          }
          chrome.debugger.sendCommand({ tabId }, 'Network.enable', {});
        });

        // 监听网络响应，收集所有匹配的请求，等超时后批量上报
        const onEvent = (source, method, params) => {
          if (source.tabId !== tabId) return;
          if (method !== 'Network.responseReceived') return;
          const url = params.response?.url || '';
          if (!pattern.test(url)) return;

          chrome.debugger.sendCommand({ tabId }, 'Network.getResponseBody',
            { requestId: params.requestId },
            (result) => {
              if (chrome.runtime.lastError || !result) return;
              let data;
              try { data = JSON.parse(result.body); } catch { data = result.body; }
              captured.push({ url, data, ts: Date.now() });
            }
          );
        };
        chrome.debugger.onEvent.addListener(onEvent);

        function done() {
          if (finished) return;
          finished = true;
          chrome.debugger.onEvent.removeListener(onEvent);
          chrome.debugger.detach({ tabId }).catch(() => {});
          chrome.storage.session.remove('interceptTab');
          chrome.action.setBadgeText({ text: '✓' });
          chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'INTERCEPT_RESULT', requestId, captured, url: targetUrl }));
          }
        }

        // 超时后批量上报（不再"拿到第一条就停"）
        setTimeout(done, maxWaitMs);
      });

      chrome.action.setBadgeText({ text: '👀' });
      chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });
    }
  };

  ws.onclose = () => {
    console.log('[CookieBridge] WS disconnected, retrying in 3s...');
    chrome.action.setBadgeText({ text: '' });
    ws = null;
    setTimeout(() => connectWS(wsUrl), 3000);
  };

  ws.onerror = (err) => {
    console.error('[CookieBridge] WS error', err);
  };
}

// ─── 消息处理（来自 popup / content script）──────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // popup 告知用户同意/拒绝
  if (msg.type === 'USER_DECISION') {
    const { approved, requestId, targetUrl } = msg;

    if (!approved) {
      // 拒绝
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'COOKIE_DENIED', requestId }));
      }
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ ok: true });
      return true;
    }

    // 同意：打开目标网站，等用户登录后点提交
    chrome.tabs.create({ url: targetUrl }, (tab) => {
      chrome.storage.session.set({
        activeGrab: { requestId, targetUrl, tabId: tab.id }
      });
    });

    chrome.action.setBadgeText({ text: '…' });
    chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
    sendResponse({ ok: true });
    return true;
  }

  // popup 触发"立即提交 cookie"
  if (msg.type === 'SUBMIT_COOKIE') {
    chrome.storage.session.get('activeGrab', async ({ activeGrab }) => {
      if (!activeGrab) { sendResponse({ ok: false, error: 'no active grab' }); return; }

      const { requestId, targetUrl, tabId } = activeGrab;

      try {
        // 1. 通过注入脚本收集 document.cookie（非 HttpOnly）
        const [result] = await chrome.scripting.executeScript({
          target: { tabId },
          func: collectDocumentCookies,
        });
        const { url: pageUrl, documentCookies } = result.result;

        // 2. 通过 chrome.cookies API 收集所有 cookie（含 HttpOnly）
        //    取当前标签页的 URL 作为 domain 过滤依据
        const allChromeCookes = await chrome.cookies.getAll({ url: pageUrl });

        // 合并：以 chrome.cookies 为主（完整），用 documentCookies 标注哪些非 HttpOnly
        const docNames = new Set(documentCookies.map(c => c.name));
        const merged = allChromeCookes.map(c => ({
          name:     c.name,
          value:    c.value,
          domain:   c.domain,
          path:     c.path,
          secure:   c.secure,
          httpOnly: c.httpOnly,
          sameSite: c.sameSite,
          session:  c.session,
          expirationDate: c.expirationDate,
        }));

        const payload = {
          url:            pageUrl,
          cookies:        merged,
          totalCount:     merged.length,
          httpOnlyCount:  merged.filter(c => c.httpOnly).length,
        };

        // 通过 WS 上报
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'COOKIE_RESULT', requestId, cookies: payload }));
        }

        // 清理状态
        await chrome.storage.session.remove(['pendingRequest', 'activeGrab']);
        chrome.action.setBadgeText({ text: '✓' });
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });

        sendResponse({ ok: true, cookieCount: merged.length });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    });
    return true; // async
  }

  // content script 在 document_start 询问是否需要拦截
  if (msg.type === 'CHECK_INTERCEPT') {
    chrome.storage.session.get('interceptTab', ({ interceptTab }) => {
      if (!interceptTab) { sendResponse({ intercept: false }); return; }
      // tabId 匹配 或 URL 匹配（tabId 还没写入时的兜底）
      const tabMatch = interceptTab.tabId === sender.tab?.id;
      const urlMatch = sender.tab?.url?.startsWith(interceptTab.targetUrl.split('?')[0]);
      if (!tabMatch && !urlMatch) { sendResponse({ intercept: false }); return; }
      sendResponse({
        intercept:  true,
        requestId:  interceptTab.requestId,
        urlPattern: interceptTab.urlPattern,
        maxWaitMs:  interceptTab.maxWaitMs,
      });
    });
    return true;
  }

  // content script 上报拦截结果
  if (msg.type === 'INTERCEPT_RESULT') {
    const { requestId, captured, url } = msg;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'INTERCEPT_RESULT', requestId, captured, url }));
    }
    chrome.storage.session.remove(['pendingIntercept', 'interceptTab']);
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    sendResponse({ ok: true });
    return true;
  }

  // popup 查询当前 WS 状态
  if (msg.type === 'GET_STATUS') {
    chrome.storage.local.get(['wsUrl'], (data) => {
      sendResponse({
        connected: ws && ws.readyState === WebSocket.OPEN,
        wsUrl: data.wsUrl || null,
        pendingRequest: null,
        activeGrab: null
      });
      // pendingRequest / activeGrab 仍用 session
      chrome.storage.session.get(['pendingRequest', 'activeGrab'], (s) => {});
    });
    return true;
  }

  // popup 断开连接
  if (msg.type === 'DISCONNECT_WS') {
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    chrome.storage.local.remove('wsUrl');
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ ok: true });
    return true;
  }

  // popup 设置 WS 连接地址
  if (msg.type === 'CONNECT_WS') {
    const { url } = msg;
    // 安全校验：只允许 cloudide.woa.com 域名
    if (!ALLOWED_WS_ORIGINS.some(o => url.startsWith(o.replace(/\/$/, '')))) {
      // 动态允许同一 workspaceId 下的端口
      const isAllowed = /^wss:\/\/workspacej9jjy0b2zdgg0ebafo-\d+\.gz\.cloudide\.woa\.com/.test(url);
      if (!isAllowed) {
        sendResponse({ ok: false, error: '不允许连接到该地址' });
        return true;
      }
    }
    chrome.storage.local.set({ wsUrl: url });
    connectWS(url);
    sendResponse({ ok: true });
    return true;
  }
});

// ─── 从页面收集 document.cookie 的注入函数（在页面上下文执行）───────────────

function collectDocumentCookies() {
  const documentCookies = document.cookie.split(';')
    .map(c => c.trim())
    .filter(Boolean)
    .map(c => {
      const idx = c.indexOf('=');
      return { name: c.slice(0, idx), value: c.slice(idx + 1) };
    });
  return { url: location.href, documentCookies };
}

// ─── 监听 tab 加载完成，自动注入拦截器 ───────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  chrome.storage.session.get('interceptTab', ({ interceptTab }) => {
    if (!interceptTab || interceptTab.tabId !== tabId) return;
    const { requestId, urlPattern, maxWaitMs } = interceptTab;

    // 直接 executeScript 注入，不依赖 content script 消息传递
    chrome.scripting.executeScript({
      target: { tabId },
      func: injectInterceptor,
      args: [requestId, urlPattern, maxWaitMs],
    }).catch(e => console.log('[CookieBridge] inject failed:', e.message));
  });
});

// ─── 在页面上下文执行的拦截器函数（通过 executeScript 注入）──────────────────

function injectInterceptor(requestId, urlPattern, maxWaitMs) {
  const pattern = new RegExp(urlPattern);
  const captured = [];
  let done = false;

  function finish() {
    if (done) return;
    done = true;
    // 通过 postMessage 通知 content script，content script 再转发给 background
    window.postMessage({ __cookieBridge: true, type: 'INTERCEPT_RESULT', requestId, captured, url: location.href }, '*');
  }

  setTimeout(finish, maxWaitMs);

  // 劫持 fetch
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    const response = await origFetch.apply(this, args);
    if (pattern.test(url)) {
      try {
        const json = await response.clone().json();
        captured.push({ url, data: json, ts: Date.now() });
      } catch {
        const text = await response.clone().text();
        captured.push({ url, data: text, ts: Date.now() });
      }
      finish();
    }
    return response;
  };

  // 劫持 XHR
  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OrigXHR();
    let reqUrl = '';
    const origOpen = xhr.open.bind(xhr);
    xhr.open = function(method, url, ...rest) { reqUrl = url; return origOpen(method, url, ...rest); };
    xhr.addEventListener('load', function() {
      if (!pattern.test(reqUrl)) return;
      try {
        captured.push({ url: reqUrl, data: JSON.parse(xhr.responseText), ts: Date.now() });
      } catch {
        captured.push({ url: reqUrl, data: xhr.responseText, ts: Date.now() });
      }
      finish();
    });
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;
}

// ─── 保活：用 chrome.alarms 每 24 秒唤醒一次 service worker ─────────────────
// MV3 service worker 空闲约 30s 会被 Chrome 终止，alarms 可以续命

chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 }); // ~24s

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'keepAlive') return;
  // 检查 WS，断了就重连
  chrome.storage.local.get('wsUrl', ({ wsUrl }) => {
    if (wsUrl && (!ws || ws.readyState === WebSocket.CLOSED)) {
      console.log('[CookieBridge] keepAlive: reconnecting...');
      connectWS(wsUrl);
    }
  });
});

// ─── 启动时自动连接（local storage 持久化，刷新后也能恢复）──────────────────
// 稍微延迟，避免 SW 刚启动时 storage 还没就绪
setTimeout(() => {
  chrome.storage.local.get('wsUrl', ({ wsUrl }) => {
    if (wsUrl) {
      console.log('[CookieBridge] 启动自动重连:', wsUrl);
      connectWS(wsUrl);
    }
  });
}, 500);
