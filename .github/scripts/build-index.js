#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');

// ── 配置 ──────────────────────────────────────────────────────────────────────

const ROOT_HTML_LABELS = {
  'manifesto.html': { emoji: '📄', label: 'Web Wide World 宣言' },
  'report.html':    { emoji: '📊', label: '领域资讯跟进报告' },
};

const LABEL_MAP = {
  '3dgs': '3DGS', consumer: '消费应用', ai: 'AI',
  apps: '应用', games: '游戏', world: '世界模型', openclaw: 'OpenClaw',
};

const EMOJI_MAP = [
  [/3dgs/i,     '🛍️'],
  [/game/i,     '🎮'],
  [/app/i,      '📱'],
  [/world/i,    '🌐'],
  [/openclaw/i, '🦀'],
];

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

function inferLabel(dirName) {
  return dirName
    .split(/[-_]/)
    .map(p => /^\d{4}$/.test(p) ? `(${p})` : (LABEL_MAP[p.toLowerCase()] || p[0].toUpperCase() + p.slice(1)))
    .join(' ');
}

function inferEmoji(dirName) {
  for (const [re, emoji] of EMOJI_MAP) if (re.test(dirName)) return emoji;
  return '📊';
}

function isDir(p)  { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function isFile(p) { try { return fs.statSync(p).isFile();      } catch { return false; } }

// ── 扫描目录 ──────────────────────────────────────────────────────────────────

// 根目录 html（排除 index.html 自身）
const rootHtmls = fs.readdirSync('.')
  .filter(f => f.endsWith('.html') && f !== 'index.html' && isFile(f))
  .sort();

// reports/ 子目录（按名称倒序，最新在前）
const reportDirs = isDir('reports')
  ? fs.readdirSync('reports')
      .filter(d => isDir(path.join('reports', d)))
      .sort()
      .reverse()
      .map(name => ({ name, files: fs.readdirSync(path.join('reports', name)) }))
  : [];

// ── 生成 HTML 片段 ─────────────────────────────────────────────────────────────

const quickLinksHtml = rootHtmls.map(f => {
  const { emoji, label } = ROOT_HTML_LABELS[f] || { emoji: '🔗', label: f.replace('.html', '') };
  return `      <a class="quick-link" href="${f}">${emoji} ${label} →</a>`;
}).join('\n');

const cardsHtml = reportDirs.map(({ name, files }) => {
  const hasHtml = files.includes('report.html');
  const hasMd   = files.includes('report.md');
  const hasSum  = files.includes('executive-summary.md');
  const href    = hasHtml ? `reports/${name}/report.html` : `reports/${name}/report.md`;
  const tags    = [
    hasHtml ? '<span class="file-tag html">report.html</span>'           : '',
    hasMd   ? '<span class="file-tag md">report.md</span>'               : '',
    hasSum  ? '<span class="file-tag md">executive-summary.md</span>'    : '',
  ].filter(Boolean).join('');

  return `
    <a class="report-card" href="${href}">
      <div class="card-emoji">${inferEmoji(name)}</div>
      <div class="card-name">${inferLabel(name)}</div>
      <div class="card-desc">${name}</div>
      ${tags ? `<div class="card-files">${tags}</div>` : ''}
    </a>`;
}).join('\n');

const reportsSection = cardsHtml.trim()
  ? `<div class="reports-grid">${cardsHtml}\n  </div>`
  : '<div class="empty">暂无报告</div>';

// ── 输出 index.html ───────────────────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Clawbot 研究报告</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Segoe UI", system-ui, "PingFang SC", sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; min-height: 100vh; }
.container { max-width: 860px; margin: 0 auto; padding: 60px 20px; }
.header { margin-bottom: 48px; }
.header h1 { font-size: 28px; font-weight: 800; color: #06d6d6; margin-bottom: 8px; letter-spacing: -0.5px; }
.header p { color: #64748b; font-size: 15px; }
.quick-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.quick-link { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; color: #94a3b8; text-decoration: none; font-size: 13px; transition: all 0.2s; }
.quick-link:hover { border-color: #06d6d6; color: #06d6d6; }
.section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #475569; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #1e293b; }
.reports-grid { display: grid; gap: 14px; }
.report-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px 28px; text-decoration: none; color: inherit; display: block; transition: all 0.2s; position: relative; overflow: hidden; }
.report-card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: #06d6d6; opacity: 0; transition: opacity 0.2s; }
.report-card:hover { border-color: #06d6d6; background: #243247; }
.report-card:hover::before { opacity: 1; }
.card-emoji { font-size: 28px; line-height: 1; margin-bottom: 10px; }
.card-name { font-size: 17px; font-weight: 700; color: #f1f5f9; margin-bottom: 6px; }
.card-desc { font-size: 13px; color: #64748b; }
.card-files { margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; }
.file-tag { font-size: 11px; padding: 3px 9px; border-radius: 5px; background: #0f172a; color: #475569; border: 1px solid #1e3a5f; }
.file-tag.html { color: #38bdf8; border-color: #1e3a5f; }
.file-tag.md { color: #a78bfa; border-color: #312e81; }
.empty { text-align: center; padding: 60px 0; color: #475569; }
.footer { margin-top: 60px; padding-top: 24px; border-top: 1px solid #1e293b; font-size: 12px; color: #334155; display: flex; justify-content: space-between; align-items: center; }
.footer a { color: #475569; text-decoration: none; }
.footer a:hover { color: #06d6d6; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🦀 Clawbot 研究报告</h1>
    <p>AI、3DGS 及相关领域的持续跟踪研究</p>
    <div class="quick-links">
${quickLinksHtml}
    </div>
  </div>
  <div class="section-title">报告目录</div>
  ${reportsSection}
  <div class="footer">
    <span>rocman/clawbot-playground · pages 分支</span>
    <a href="https://github.com/rocman/clawbot-playground/tree/pages" target="_blank">查看源码 →</a>
  </div>
</div>
</body>
</html>
`;

fs.writeFileSync('index.html', html);
console.log(`index.html generated — ${rootHtmls.length} quick links, ${reportDirs.length} reports`);
