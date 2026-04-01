#!/usr/bin/env node
/**
 * 工作区文件服务器
 * 将 /root/.openclaw/workspace 目录对外暴露
 * 访问地址: https://workspacej9jjy0b2zdgg0ebafo-8080.gz.cloudide.woa.com
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const WORKSPACE = '/root/.openclaw/workspace';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/plain; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.pdf':  'application/pdf',
  '.zip':  'application/zip',
  '.sh':   'text/plain; charset=utf-8',
  '.py':   'text/plain; charset=utf-8',
  '.ts':   'text/plain; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.csv':  'text/csv; charset=utf-8',
};

function listDir(dirPath, urlPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const rows = entries.map(e => {
    const href = urlPath.replace(/\/$/, '') + '/' + encodeURIComponent(e.name) + (e.isDirectory() ? '/' : '');
    const label = e.isDirectory() ? `📁 ${e.name}/` : `📄 ${e.name}`;
    return `<li><a href="${href}">${label}</a></li>`;
  }).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${urlPath}</title>
<style>body{font-family:monospace;padding:20px}a{color:#0066cc;text-decoration:none}a:hover{text-decoration:underline}ul{list-style:none;padding:0}li{margin:4px 0;font-size:14px}</style>
</head><body><h2>📂 ${urlPath}</h2><ul>${urlPath !== '/' ? '<li><a href="../">⬆ ..</a></li>' : ''}${rows}</ul></body></html>`;
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let urlPath = decodeURIComponent(parsed.pathname);

  // 防止路径穿越
  const absPath = path.normalize(path.join(WORKSPACE, urlPath));
  if (!absPath.startsWith(WORKSPACE)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      // 目录列表
      const html = listDir(absPath, urlPath.endsWith('/') ? urlPath : urlPath + '/');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else {
      // 文件下载/预览
      const ext = path.extname(absPath).toLowerCase();
      const contentType = MIME[ext] || 'application/octet-stream';
      const fileName = path.basename(absPath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Content-Disposition': contentType.startsWith('text') || contentType.includes('json') || contentType.includes('xml') || contentType.includes('svg')
          ? `inline; filename="${fileName}"`
          : `attachment; filename="${fileName}"`,
      });
      fs.createReadStream(absPath).pipe(res);
    }
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found: ' + urlPath);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ File server started`);
  console.log(`   Local:  http://127.0.0.1:${PORT}`);
  console.log(`   Public: https://workspacej9jjy0b2zdgg0ebafo-${PORT}.gz.cloudide.woa.com`);
  console.log(`   Serving: ${WORKSPACE}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
