// content.js - document_start 注入，在页面 JS 执行前劫持 fetch/XHR

// 立刻问 background：当前页面需要拦截吗？
chrome.runtime.sendMessage({ type: 'CHECK_INTERCEPT', url: location.href }, (resp) => {
  if (chrome.runtime.lastError) return;
  if (!resp?.intercept) return;
  startIntercept(resp.requestId, resp.urlPattern, resp.maxWaitMs);
});

// 监听 postMessage（executeScript 注入的结果回传，保留兼容）
window.addEventListener('message', (event) => {
  if (!event.data?.__cookieBridge) return;
  if (event.data.type === 'INTERCEPT_RESULT') {
    chrome.runtime.sendMessage({
      type: 'INTERCEPT_RESULT',
      requestId: event.data.requestId,
      captured:  event.data.captured,
      url:       event.data.url,
    });
  }
});

function startIntercept(requestId, urlPattern, maxWaitMs) {
  const pattern = new RegExp(urlPattern);
  const captured = [];
  let done = false;

  function finish() {
    if (done) return;
    done = true;
    chrome.runtime.sendMessage({
      type: 'INTERCEPT_RESULT',
      requestId,
      captured,
      url: location.href,
    });
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
