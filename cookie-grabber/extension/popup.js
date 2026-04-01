// popup.js

const DEFAULT_WS = 'wss://workspacej9jjy0b2zdgg0ebafo-8081.gz.cloudide.woa.com';
const $ = (id) => document.getElementById(id);

let currentStatus = null;

// ─── 更新整体 UI ──────────────────────────────────────────────────────────────

function render(status) {
  currentStatus = status;
  const connected = status.connected;

  // 状态栏 dot + 文字 + 背景
  const dot  = $('ws-dot');
  const text = $('ws-status-text');
  const bar  = $('status-bar');

  dot.className  = connected ? 'dot green' : 'dot red';
  // 清除 inline style，让 className 完全生效
  dot.removeAttribute('style');

  if (connected) {
    text.textContent = '已连接';
    bar.className = 'status-bar connected';
  } else {
    text.textContent = '未连接';
    bar.className = 'status-bar disconnected';
  }

  // 配置区：未连接时显示，连接后隐藏
  $('connect-section').classList.toggle('hidden', connected);

  // 主内容区：根据连接状态 + 任务状态决定显示哪块
  hide('idle-state', 'request-state', 'grab-state', 'not-connected-state');

  if (!connected) {
    show('not-connected-state');
    // 预填地址
    $('ws-url').value = status.wsUrl || DEFAULT_WS;
    return;
  }

  // 已连接 —— 根据任务状态展示
  if (status.activeGrab) {
    show('grab-state');
    $('grab-url').textContent = status.activeGrab.targetUrl;
  } else if (status.pendingRequest) {
    show('request-state');
    $('req-url').textContent   = status.pendingRequest.targetUrl;
    $('req-reason').textContent = status.pendingRequest.reason
      || 'AI 助手需要获取该网站的登录态 Cookie 以完成当前任务。';
  } else {
    show('idle-state');
  }
}

function show(...ids) { ids.forEach(id => $( id)?.classList.remove('hidden')); }
function hide(...ids) { ids.forEach(id => $( id)?.classList.add('hidden'));    }

// ─── 从 background 拉取状态 ──────────────────────────────────────────────────

function refresh() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (status) => {
    if (chrome.runtime.lastError) return;
    // 未连接但有保存的 wsUrl → 自动重连
    if (!status.connected && status.wsUrl) {
      chrome.runtime.sendMessage({ type: 'CONNECT_WS', url: status.wsUrl }, () => {
        setTimeout(() => chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (s) => {
          if (!chrome.runtime.lastError) render(s);
        }), 800);
      });
      return;
    }
    render(status);
  });
}

// ─── 按钮事件 ────────────────────────────────────────────────────────────────

$('btn-connect').addEventListener('click', () => {
  const url = $('ws-url').value.trim() || DEFAULT_WS;
  $('btn-connect').disabled = true;
  $('btn-connect').textContent = '连接中…';
  chrome.runtime.sendMessage({ type: 'CONNECT_WS', url }, (res) => {
    $('btn-connect').disabled = false;
    $('btn-connect').textContent = '连接';
    if (res?.ok) {
      setTimeout(refresh, 600); // 等 WS 握手完成
    } else {
      alert('连接失败：' + (res?.error || '未知错误'));
    }
  });
});

$('btn-disconnect')?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'DISCONNECT_WS' }, () => setTimeout(refresh, 300));
});

$('btn-approve').addEventListener('click', () => {
  if (!currentStatus?.pendingRequest) return;
  const { requestId, targetUrl } = currentStatus.pendingRequest;
  chrome.runtime.sendMessage({ type: 'USER_DECISION', approved: true, requestId, targetUrl },
    () => setTimeout(refresh, 300));
});

$('btn-deny').addEventListener('click', () => {
  if (!currentStatus?.pendingRequest) return;
  chrome.runtime.sendMessage({
    type: 'USER_DECISION', approved: false,
    requestId: currentStatus.pendingRequest.requestId
  }, () => setTimeout(refresh, 300));
});

$('btn-submit').addEventListener('click', () => {
  $('btn-submit').disabled = true;
  $('btn-submit').textContent = '⏳ 收集中…';
  chrome.runtime.sendMessage({ type: 'SUBMIT_COOKIE' }, (res) => {
    if (res?.ok) {
      $('btn-submit').textContent = `✅ 已发送 Cookie`;
      setTimeout(() => window.close(), 1200);
    } else {
      $('btn-submit').textContent = '❌ 失败：' + (res?.error || '未知');
      $('btn-submit').disabled = false;
    }
  });
});

$('btn-cancel').addEventListener('click', () => {
  if (!currentStatus?.activeGrab) return;
  chrome.runtime.sendMessage({
    type: 'USER_DECISION', approved: false,
    requestId: currentStatus.activeGrab.requestId
  }, () => setTimeout(refresh, 300));
});

$('ws-url').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-connect').click();
});

// ─── 初始化 & 轮询 ───────────────────────────────────────────────────────────

refresh();
setInterval(refresh, 2000);
