#!/usr/bin/env node
/**
 * get-cookie CLI
 * 
 * 用法:
 *   node get-cookie.js <url> [reason]
 * 
 * 前提: server.js 已在后台运行（常驻）
 * 
 * 例子:
 *   node get-cookie.js https://github.com
 *   node get-cookie.js https://example.com "需要获取登录态"
 */

const http = require('http');

const API_BASE = 'http://127.0.0.1:8082';

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
用法: node get-cookie.js <url> [reason]

参数:
  url     目标网站地址（例如 https://github.com）
  reason  可选，说明为何需要该网站的 Cookie

前提:
  1. server.js 已在后台常驻运行
  2. Chrome 插件已连接到 wss://workspacej9jjy0b2zdgg0ebafo-8081.gz.cloudide.woa.com
  `);
  process.exit(0);
}

const targetUrl = args[0];
const reason = args[1] || `获取 ${new URL(targetUrl).hostname} 的登录态`;

async function apiGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${API_BASE}${path}`, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    }).on('error', reject);
  });
}

async function apiPost(path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function main() {
  // 1. 检查 server 是否在跑
  let status;
  try {
    const r = await apiGet('/status');
    status = r.data;
  } catch {
    console.error('❌ 无法连接到 Cookie Bridge Server（127.0.0.1:8082）');
    console.error('   请先启动服务器：');
    console.error('   nohup node server.js >> /tmp/cookie-bridge.log 2>&1 &');
    process.exit(1);
  }

  console.log(`\n🚀 Cookie Bridge`);
  console.log(`   目标: ${targetUrl}`);
  console.log(`   原因: ${reason}`);

  if (!status.pluginConnected) {
    console.error('\n❌ Chrome 插件未连接');
    console.error('   请在 Chrome 中打开 Cookie Bridge 插件，点击"连接"按钮');
    process.exit(1);
  }

  console.log('\n✅ 插件已连接');
  console.log('📤 正在发送授权请求...');
  console.log('   请查看 Chrome 工具栏的 🍪 图标（出现 ! 提示），点击并同意授权\n');

  // 2. 发起请求（长等待）
  let result;
  try {
    result = await apiPost('/request', { targetUrl, reason });
  } catch (e) {
    console.error('❌ 请求失败:', e.message);
    process.exit(1);
  }

  if (!result.data.ok) {
    console.error('\n❌ 失败:', result.data.error);
    process.exit(1);
  }

  const cookies = result.data.cookies;

  console.log('\n✅ 成功获取 Cookie！\n');
  console.log('─'.repeat(60));
  console.log(`共 ${cookies.totalCount} 个 cookie，其中 HttpOnly: ${cookies.httpOnlyCount} 个`);

  console.log('\n📋 全量 cookie（含 HttpOnly）:');
  console.log(JSON.stringify(cookies.cookies, null, 2));

  // curl 格式（name=value 拼接）
  if (cookies.cookies?.length > 0) {
    const cookieStr = cookies.cookies.map(c => `${c.name}=${c.value}`).join('; ');
    console.log('\n📋 curl -H 格式:');
    console.log(`-H "Cookie: ${cookieStr}"`);
  }

  console.log('\n' + '─'.repeat(60));
  console.log('✅ 完成');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
