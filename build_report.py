#!/usr/bin/env python3
"""
领域资讯跟进报告 - 数据生成器
用法：
  python3 build_report.py --topic 3dgs           # 3D Gaussian Splatting
  python3 build_report.py --topic 3d_ai          # 3D + AI 生成
  python3 build_report.py --topic world_model    # 世界模型 / 空间智能
  python3 build_report.py --topic 3d_web         # 3D + Web
  python3 build_report.py --topic all            # 所有领域
"""
import sys, os, re, json, argparse, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from datetime import datetime

# ──────────────────────────────────────────────
# 领域配置表
# ──────────────────────────────────────────────
TOPICS = {
    '3dgs': {
        'label':   '3D Gaussian Splatting',
        'emoji':   '🌐',
        'desc':    '3DGS 核心技术、压缩、编辑、SLAM、动态场景等方向',
        'arxiv_queries': [
            '3D Gaussian Splatting',
        ],
        'hn_keywords':   ['gaussian splatting', '3dgs', 'nerf', 'radiance field'],
        'bili_keywords': ['3D高斯泼溅', '3DGS', 'NeRF', '神经辐射场'],
        'github_topics': ['gaussian-splatting', '3dgs'],
        'max': 30,
    },
    '3d_ai': {
        'label':   '3D + AI 生成',
        'emoji':   '🎨',
        'desc':    'Text/Image → 3D、4D动态生成、3D编辑与风格化、数字人',
        'arxiv_queries': [
            'text to 3D generation',
            '3D AIGC generation diffusion',
            'Gaussian avatar 3D human reconstruction',
            '4D gaussian dynamic scene generation',
        ],
        'hn_keywords':   ['text to 3d', '3d generation', 'dreamfusion', 'gaussian avatar', '4d gaussian'],
        'bili_keywords': ['文生3D', 'AI生成三维', '3D生成大模型', '高斯avatar'],
        'github_topics': ['text-to-3d', '3d-generation', 'neural-rendering'],
        'max': 30,
    },
    'world_model': {
        'label':   '世界模型 / 空间智能',
        'emoji':   '🌍',
        'desc':    '世界模型、空间智能、具身智能、4D场景理解、视觉基础模型',
        'arxiv_queries': [
            'world model spatial intelligence embodied',
            'spatial reasoning 3D scene understanding vision language',
            'embodied intelligence navigation 3D perception',
        ],
        'hn_keywords':   ['world model', 'spatial intelligence', 'embodied ai', 'scene understanding'],
        'bili_keywords': ['世界模型', '具身智能', '空间智能', 'AI机器人'],
        'github_topics': ['world-model', 'embodied-ai', 'spatial-intelligence'],
        'max': 30,
    },
    '3d_web': {
        'label':   '3D + Web',
        'emoji':   '🕸️',
        'desc':    'WebGPU、WebGL、浏览器实时渲染、Three.js生态、Web端神经渲染',
        'arxiv_queries': [
            'WebGPU real-time rendering neural',
            'browser 3D rendering interactive neural scene',
        ],
        'hn_keywords':   ['webgpu', 'webgl', 'three.js', 'babylon.js', 'web3d', 'real-time rendering browser'],
        'bili_keywords': ['WebGPU教程', 'Three.js', 'Web3D开发', '实时渲染'],
        'github_topics': ['webgpu', 'threejs', 'babylonjs', 'webgl'],
        'max': 30,
    },
    'openclaw': {
        'label':   'OpenClaw / AI Agent',
        'emoji':   '🦞',
        'desc':    'AI Agent 框架、LLM工具调用、Agentic工作流、开源 Agent 生态动态',
        'arxiv_queries': [
            'LLM agent tool use autonomous workflow',
            'agentic AI planning reasoning action',
        ],
        'hn_keywords':   ['ai agent', 'llm agent', 'agentic', 'tool use', 'mcp protocol', 'function calling', 'autonomous agent'],
        'bili_keywords': ['AI Agent', 'AI智能体', 'MCP协议', '大模型工具调用', '自主智能体'],
        'github_topics': ['llm-agent', 'ai-agent', 'langchain', 'autogen'],
        'max': 30,
    },
    'ai_apps': {
        'label':   'AI 应用',
        'emoji':   '📱',
        'desc':    'AI 产品动态、Prompt工程、多模态应用、AI工具链与开发者生态',
        'arxiv_queries': [
            'large language model application evaluation benchmark',
            'multimodal AI application user interface',
        ],
        'hn_keywords':   ['chatgpt', 'claude', 'gemini', 'llm', 'ai app', 'ai product', 'prompt engineering', 'ai tool'],
        'bili_keywords': ['AI工具推荐', 'ChatGPT教程', 'Claude使用', '大模型应用', 'AI效率工具'],
        'github_topics': ['llm', 'chatgpt', 'generative-ai', 'prompt-engineering'],
        'max': 30,
    },
    'ai_games': {
        'label':   'AI 与游戏',
        'emoji':   '🎮',
        'desc':    'AI NPC、程序化内容生成、游戏AI、强化学习与游戏、AI辅助游戏开发',
        'arxiv_queries': [
            'AI game NPC procedural content generation',
            'reinforcement learning game playing agent',
            'generative AI game design asset creation',
        ],
        'hn_keywords':   ['ai npc', 'game ai', 'procedural generation', 'ai game', 'reinforcement learning game', 'generative game'],
        'bili_keywords': ['AI游戏开发', 'AI NPC', '程序化生成', 'AI游戏设计', '强化学习游戏'],
        'github_topics': ['game-ai', 'procedural-generation', 'reinforcement-learning'],
        'max': 30,
    },
}

# ──────────────────────────────────────────────
# ArXiv 抓取
# ──────────────────────────────────────────────
NS = 'http://www.w3.org/2005/Atom'

def fetch_arxiv(query: str, max_results: int = 30) -> list[dict]:
    encoded = urllib.parse.quote(query)
    url = (
        f'http://export.arxiv.org/api/query?search_query=all:{encoded}'
        f'&sortBy=submittedDate&sortOrder=descending&max_results={max_results}'
    )
    print(f'  [arxiv] {query[:60]}…')
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            xml_bytes = resp.read()
    except Exception as e:
        print(f'  [arxiv] ⚠ 请求失败: {e}')
        return []

    root = ET.fromstring(xml_bytes)
    papers = []
    for entry in root.findall(f'{{{NS}}}entry'):
        title = (entry.findtext(f'{{{NS}}}title') or '').replace('\n', ' ').strip()
        abstract = (entry.findtext(f'{{{NS}}}summary') or '').replace('\n', ' ').strip()
        pub_date = (entry.findtext(f'{{{NS}}}published') or '')[:10]
        link = next(
            (l.get('href', '') for l in entry.findall(f'{{{NS}}}link')
             if l.get('type') == 'text/html'),
            entry.findtext(f'{{{NS}}}id') or ''
        )
        authors = [a.findtext(f'{{{NS}}}name') or '' for a in entry.findall(f'{{{NS}}}author')]
        papers.append({
            'title': title, 'authors': authors, 'date': pub_date,
            'abstract': abstract, 'url': link,
            'source': 'arxiv',
        })
    print(f'  [arxiv] → {len(papers)} 篇')
    return papers


def fetch_arxiv_multi(queries: list[str], max_per_query: int = 15) -> list[dict]:
    """多关键词抓取，自动去重（按 title）"""
    seen, results = set(), []
    for q in queries:
        for p in fetch_arxiv(q, max_per_query):
            key = p['title'].lower().strip()
            if key not in seen:
                seen.add(key)
                results.append(p)
    # 按日期排序
    results.sort(key=lambda x: x.get('date', ''), reverse=True)
    return results


# ──────────────────────────────────────────────
# HackerNews 抓取
# ──────────────────────────────────────────────

# ──────────────────────────────────────────────
# 实时热点提炼
# ──────────────────────────────────────────────

# 低质量 B站视频过滤关键词（教程/推广/翻墙类）
_BILI_SPAM_WORDS = [
    '教程', '注册', '翻墙', '免费使用', '国内', '不翻墙', '账号', '登录',
    'plus会员', '平替', '破解', '白嫖', '无限制', '保姆级',
]

def _bili_is_spam(title: str, desc: str) -> bool:
    text = (title + desc).lower()
    return sum(1 for w in _BILI_SPAM_WORDS if w in text) >= 2

def _play_comment(play: int) -> str:
    if play >= 1_000_000: return f'{play/1_000_000:.1f}M 播放，热门'
    if play >= 100_000:   return f'{play//10000}万 播放，较热'
    if play >= 10_000:    return f'{play//10000}万 播放'
    return f'{play:,} 播放'

def fetch_bilibili(keywords: list[str], max_results: int = 5) -> list[dict]:
    """搜索 B站视频，过滤低质量推广内容，返回有实质内容的技术/资讯视频"""
    items = []
    seen_bvids: set = set()
    for kw in keywords[:3]:
        query = urllib.parse.quote(kw)
        url = f'https://api.bilibili.com/x/web-interface/wbi/search/type?search_type=video&keyword={query}&order=totalrank&page=1&ps=20'
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': f'https://search.bilibili.com/all?keyword={query}',
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            results = data.get('data', {}).get('result', [])
            for v in results:
                bvid = v.get('bvid', '')
                if not bvid or bvid in seen_bvids:
                    continue
                title = re.sub(r'<[^>]+>', '', v.get('title', '')).strip()
                desc  = v.get('description', '')[:200]
                if _bili_is_spam(title, desc):
                    continue
                seen_bvids.add(bvid)
                play = v.get('play', 0)
                items.append({
                    'title':    title,
                    'url':      f'https://www.bilibili.com/video/{bvid}',
                    'author':   v.get('author', ''),
                    'play':     play,
                    'danmaku':  v.get('video_review', 0),
                    'date':     v.get('pubdate', 0),
                    'desc':     desc.strip(),
                    'comment':  '',   # 由 agent AI 点评填写
                    'source':   'bilibili',
                })
                if len(items) >= max_results * 3:
                    break
        except Exception as e:
            print(f'  [bilibili] ⚠ {kw}: {e}')
    items.sort(key=lambda x: x['play'], reverse=True)
    print(f'  [bilibili] → {len(items[:max_results])} 条（过滤后）')
    return items[:max_results]


def fetch_xiaohongshu(keywords: list[str], max_results: int = 5) -> list[dict]:
    """通过搜索引擎代理抓小红书笔记（site:xiaohongshu.com）"""
    items = []
    seen_urls: set = set()
    for kw in keywords[:2]:
        query = urllib.parse.quote(f'site:xiaohongshu.com {kw}')
        url = f'https://www.sogou.com/web?query={query}&num=10'
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept-Language': 'zh-CN,zh;q=0.9'
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                html = resp.read().decode('utf-8', errors='ignore')
            # 提取标题和链接
            titles = re.findall(r'<h3[^>]*class="[^"]*vr-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.DOTALL)
            for href, title_html in titles[:max_results]:
                title = re.sub(r'<[^>]+>', '', title_html).strip()
                full_url = href if href.startswith('http') else f'https://www.sogou.com{href}'
                if full_url in seen_urls or not title:
                    continue
                seen_urls.add(full_url)
                items.append({
                    'title':   title,
                    'url':     full_url,
                    'source':  'xiaohongshu',
                    'desc':    '',
                })
        except Exception as e:
            print(f'  [xiaohongshu] ⚠ {kw}: {e}')
    print(f'  [xiaohongshu] → {len(items)} 条')
    return items[:max_results]

def _hn_comment(title: str, pts: int, cmts: int) -> str:
    """根据标题和互动数据生成一句点评"""
    t = title.lower()
    heat = pts + cmts * 2
    # 热度标签
    if heat > 5000:   hot = '🔥 超热议题'
    elif heat > 2000: hot = '💬 热门讨论'
    else:             hot = '📌 值得关注'
    # 内容类型判断
    if 'show hn' in t:      ctype = '社区展示项目'
    elif 'ask hn' in t:     ctype = '社区提问'
    elif any(w in t for w in ['release', 'launch', 'announce', 'introducing']): ctype = '新品发布'
    elif any(w in t for w in ['paper', 'research', 'study']): ctype = '研究论文'
    elif any(w in t for w in ['vs', 'compare', 'benchmark']): ctype = '对比评测'
    else:                   ctype = '行业资讯'
    return f'{hot} · {ctype} · {pts} 赞 {cmts} 评'

def fetch_hn_hot(keywords: list[str], max_results: int = 8) -> list[dict]:
    """抓 HN 热门讨论，返回结构化热帖（点赞/评论/链接/点评）"""
    items = []
    seen_titles: set = set()
    for kw in keywords[:4]:
        query = urllib.parse.quote(kw)
        url = f'https://hn.algolia.com/api/v1/search?query={query}&tags=story&hitsPerPage=8'
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read())
            for hit in data.get('hits', []):
                title = hit.get('title', '').strip()
                if not title or title.lower() in seen_titles:
                    continue
                seen_titles.add(title.lower())
                pts  = hit.get('points', 0)
                cmts = hit.get('num_comments', 0)
                items.append({
                    'title':       title,
                    'url':         hit.get('url') or f"https://news.ycombinator.com/item?id={hit.get('objectID')}",
                    'hn_url':      f"https://news.ycombinator.com/item?id={hit.get('objectID')}",
                    'points':      pts,
                    'comments':    cmts,
                    'author':      hit.get('author', ''),
                    'date':        (hit.get('created_at') or '')[:10],
                    'hn_id':       str(hit.get('objectID', '')),
                    'comment':     '',   # 由 agent AI 点评填写
                })
        except Exception as e:
            print(f'  [hn_hot] ⚠ {kw}: {e}')
    items.sort(key=lambda x: x['points'] + x['comments'] * 2, reverse=True)
    return items[:max_results]


def fetch_github_new(topics: list[str], max_results: int = 6) -> list[dict]:
    """抓 GitHub Trending（weekly），返回结构化仓库列表"""
    items = []
    seen_repos: set = set()
    for topic in topics[:3]:
        url = f'https://github.com/trending?q={urllib.parse.quote(topic)}&since=weekly'
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                html = resp.read().decode('utf-8', errors='ignore')
            articles = re.findall(r'<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>(.*?)</article>', html, re.DOTALL)
            for art in articles:
                m_repo   = re.search(r'<h2[^>]*>\s*<a[^>]*href="/([a-zA-Z0-9_][^"/]+/[a-zA-Z0-9_][^"/]+)"', art)
                m_weekly = re.search(r'([\d,]+)\s*stars this week', art)
                m_total  = re.search(r'href="[^"]*/stargazers"[^>]*>[\s\S]*?([\d,]+)\s*</a>', art)
                m_desc   = re.search(r'<p[^>]*>([^<]*)</p>', art)
                if not m_repo:
                    continue
                repo = m_repo.group(1).strip()
                if repo in seen_repos:
                    continue
                seen_repos.add(repo)
                desc = m_desc.group(1).strip() if m_desc else ''
                weekly_str = m_weekly.group(1).replace(',','') if m_weekly else '0'
                total_str  = m_total.group(1).replace(',','') if m_total else '0'
                items.append({
                    'name':         repo,
                    'url':          f'https://github.com/{repo}',
                    'desc':         desc,
                    'stars':        int(total_str)  if total_str.isdigit()  else 0,
                    'weekly_stars': int(weekly_str) if weekly_str.isdigit() else 0,
                    'date':         datetime.now().strftime('%Y-%m-%d'),
                })
                if len(items) >= max_results:
                    break
        except Exception as e:
            print(f'  [github_new] ⚠ {topic}: {e}')
    items.sort(key=lambda x: x['weekly_stars'], reverse=True)
    print(f'  [github_new] → {len(items)} 条')
    return items[:max_results]

def fetch_hn(keywords: list[str], max_results: int = 10) -> list[dict]:
    """从 HN Algolia API 抓取包含关键词的热门帖子"""
    items = []
    seen = set()
    for kw in keywords[:3]:  # 限制前3个关键词避免过多请求
        query = urllib.parse.quote(kw)
        url = f'https://hn.algolia.com/api/v1/search?query={query}&tags=story&hitsPerPage=5'
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read())
            for hit in data.get('hits', []):
                title = hit.get('title', '').strip()
                if not title or title.lower() in seen:
                    continue
                seen.add(title.lower())
                items.append({
                    'title':    title,
                    'authors':  [hit.get('author', 'HN')],
                    'date':     (hit.get('created_at') or '')[:10],
                    'abstract': f"HackerNews 讨论 · {hit.get('points', 0)} 点赞 · {hit.get('num_comments', 0)} 评论。{hit.get('url', '')}",
                    'url':      hit.get('url') or f"https://news.ycombinator.com/item?id={hit.get('objectID')}",
                    'source':   'hackernews',
                    'hn_points': hit.get('points', 0),
                })
        except Exception as e:
            print(f'  [hn] ⚠ {kw}: {e}')
    items.sort(key=lambda x: x.get('hn_points', 0), reverse=True)
    print(f'  [hn] → {len(items)} 条')
    return items[:max_results]


# ──────────────────────────────────────────────
# GitHub Trending（通过网页解析）
# ──────────────────────────────────────────────
def fetch_github_trending(topics: list[str], max_results: int = 5) -> list[dict]:
    """抓 GitHub Trending 页面，解析热门仓库"""
    items = []
    for topic in topics[:2]:
        url = f'https://github.com/trending?q={urllib.parse.quote(topic)}&since=weekly'
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                html = resp.read().decode('utf-8', errors='ignore')
            # 简单正则提取仓库名和描述
            repos = re.findall(r'href="/([^"]+/[^"]+)"[^>]*>\s*\n.*?\n.*?</a>', html)
            descs = re.findall(r'<p\s+class="col-9[^"]*"[^>]*>\s*(.*?)\s*</p>', html, re.DOTALL)
            stars = re.findall(r'aria-label="([\d,]+) stars"', html)
            for i, (repo, desc) in enumerate(zip(repos[:max_results], descs[:max_results])):
                desc_clean = re.sub(r'\s+', ' ', desc).strip()
                star_count = stars[i].replace(',', '') if i < len(stars) else '0'
                items.append({
                    'title':    repo,
                    'authors':  [repo.split('/')[0]],
                    'date':     datetime.now().strftime('%Y-%m-%d'),
                    'abstract': f"GitHub 热门项目 · ⭐ {star_count} stars（本周）· {desc_clean}",
                    'url':      f'https://github.com/{repo}',
                    'source':   'github',
                    'stars':    int(star_count) if star_count.isdigit() else 0,
                })
        except Exception as e:
            print(f'  [github] ⚠ {topic}: {e}')
    print(f'  [github] → {len(items)} 条')
    return items


# ──────────────────────────────────────────────
# Tags 推断
# ──────────────────────────────────────────────
def infer_tags(text: str, topic: str = '3dgs') -> list[str]:
    text = text.lower()
    mapping = [
        ('移动端',    ['mobile', 'edge device', 'iphone', 'android', 'lightweight']),
        ('实时渲染',  ['real-time', 'real time', 'fps', 'interactive render']),
        ('4D/动态',  ['4d gaussian', '4dgs', 'temporal', 'dynamic scene', 'deform']),
        ('SLAM',     ['slam', 'localization', 'mapping', 'odometry']),
        ('压缩',     ['compress', 'compact', 'pruning', 'quantiz']),
        ('可编辑',   ['edit', 'styliz', 'decompos', 'segment']),
        ('数字人',   ['avatar', 'human body', 'face', 'portrait', 'head']),
        ('自动驾驶', ['autonomous', 'driving', 'lidar', 'street', 'traffic']),
        ('生成模型', ['diffusion', 'generative', 'text-to-3d', 'score distill']),
        ('城市建模', ['urban', 'city', 'aerial', 'outdoor', 'large-scale']),
        ('医疗',     ['medical', 'endoscop', 'surgical', 'tissue']),
        ('具身智能', ['embodied', 'robot', 'manipulation', 'navigation']),
        ('空间推理', ['spatial reason', 'spatial intelligence', 'scene understanding']),
        ('世界模型', ['world model', 'physics simulation', 'predictive model']),
        ('WebGPU',   ['webgpu', 'webgl', 'browser render', 'three.js', 'babylon']),
        ('新视角合成',['novel view', 'view synthesis', 'nerf']),
        ('开源',     ['open source', 'open-source', 'github.com', 'github trending']),
        ('HN热议',   ['hackernews', 'hacker news', 'hn']),
    ]
    result = []
    for tag, kws in mapping:
        if any(k in text for k in kws):
            result.append(tag)
        if len(result) >= 3:
            break
    topic_label = {'3dgs': '3DGS', '3d_ai': '3D-AI', 'world_model': '世界模型', '3d_web': '3D-Web'}
    return result or [topic_label.get(topic, topic.upper())]


# ──────────────────────────────────────────────
# 构建完整数据集（ArXiv + HN + GitHub）
# ──────────────────────────────────────────────

# ──────────────────────────────────────────────
# 去重：seen 集合（跨期记录已展示条目 id）
# ──────────────────────────────────────────────
import re as _re

def _item_id(item: dict) -> str:
    """从条目提取唯一 id：arxiv id / HN objectID / GitHub 项目名"""
    url = item.get('url', '')
    m = _re.search(r'(\d{4}\.\d{4,5})', url)
    if m:
        return f'arxiv:{m.group(1)}'
    hn = item.get('hn_id') or item.get('objectID', '')
    if hn:
        return f'hn:{hn}'
    title = item.get('title', '').strip().lower()[:60]
    return f'title:{title}'

def load_seen(workspace: str, topic_key: str) -> set:
    path = os.path.join(workspace, 'seen', f'{topic_key}_seen.json')
    if os.path.exists(path):
        data = json.load(open(path))
        return set(data.get('ids', []))
    return set()

def save_seen(workspace: str, topic_key: str, seen: set, new_ids: list):
    os.makedirs(os.path.join(workspace, 'seen'), exist_ok=True)
    path = os.path.join(workspace, 'seen', f'{topic_key}_seen.json')
    seen.update(new_ids)
    json.dump({'ids': sorted(seen)}, open(path, 'w'), ensure_ascii=False, indent=2)
    print(f'[seen] {topic_key}_seen.json 已更新（累计 {len(seen)} 条已见 id）')

def dedup_items(items: list[dict], seen: set, topic_key: str) -> tuple[list[dict], list[str]]:
    """过滤已见条目，返回（新条目列表，新条目 id 列表）"""
    new_items, new_ids, skipped = [], [], []
    for item in items:
        uid = _item_id(item)
        if uid in seen:
            skipped.append(item.get('title', '')[:50])
        else:
            new_items.append(item)
            new_ids.append(uid)
    if skipped:
        print(f'[dedup] 跳过 {len(skipped)} 条已见条目：')
        for t in skipped[:5]:
            print(f'  - {t}')
        if len(skipped) > 5:
            print(f'  … 共 {len(skipped)} 条')
    else:
        print(f'[dedup] 无重复，全部 {len(new_items)} 条均为新内容')
    return new_items, new_ids


def build_dataset(topic_cfg: dict, topic_key: str, max_total: int = 30,
                  workspace: str = '/root/.openclaw/workspace') -> tuple[list[dict], list[str], list[dict], list[dict]]:
    """返回 (papers, new_ids, hot_topics, trending_repos)"""
    print(f'\n[{topic_key}] 开始抓取数据…')

    # ArXiv 论文（多抓一些，去重后再裁剪）
    fetch_n = max_total * 2
    papers = fetch_arxiv_multi(topic_cfg['arxiv_queries'], max_per_query=max(10, fetch_n // len(topic_cfg['arxiv_queries'])))
    print(f'[{topic_key}] ArXiv 原始 {len(papers)} 篇')

    # 去重论文
    seen = load_seen(workspace, topic_key)
    papers_dedup, new_ids = dedup_items(papers, seen, topic_key)
    papers_dedup = papers_dedup[:max_total]
    new_ids      = new_ids[:max_total]

    # 补全 tags
    for item in papers_dedup:
        if not item.get('tags'):
            item['tags'] = infer_tags(item['title'] + ' ' + item.get('abstract', ''), topic_key)

    # 本周热点（HN + GitHub + B站 + 小红书，独立于论文，不做去重）
    print(f'[{topic_key}] 抓取本周热点…')
    hot_topics      = fetch_hn_hot(topic_cfg.get('hn_keywords', []), max_results=6)
    trending_repos  = fetch_github_new(topic_cfg.get('github_topics', []), max_results=5)
    bili_keywords   = topic_cfg.get('bili_keywords') or topic_cfg.get('hn_keywords', [])
    bili_videos     = fetch_bilibili(bili_keywords, max_results=5)
    xhs_notes       = fetch_xiaohongshu(topic_cfg.get('hn_keywords', []), max_results=5)
    print(f'[{topic_key}] 热点：HN {len(hot_topics)}，GitHub {len(trending_repos)}，B站 {len(bili_videos)}，小红书 {len(xhs_notes)}')

    print(f'[{topic_key}] 去重后论文 {len(papers_dedup)} 篇，热点共 {len(hot_topics)+len(trending_repos)+len(bili_videos)+len(xhs_notes)} 条')
    return papers_dedup, new_ids, hot_topics, trending_repos, bili_videos, xhs_notes


# ──────────────────────────────────────────────
# 本地文件加载（--data 参数）
# ──────────────────────────────────────────────
def load_data(data_src: str) -> list[dict] | None:
    if data_src.startswith('http://') or data_src.startswith('https://'):
        print(f'[data] 从 URL 加载：{data_src}')
        with urllib.request.urlopen(data_src, timeout=30) as resp:
            raw = json.loads(resp.read())
    else:
        print(f'[data] 从文件加载：{data_src}')
        with open(data_src, 'r', encoding='utf-8') as f:
            raw = json.load(f)

    if isinstance(raw, list):
        items = raw
    elif 'papers' in raw:
        items = raw['papers']
    elif 'data' in raw and 'notes' in raw.get('data', {}):
        print('[data] 检测到小红书格式，暂不支持')
        return None
    else:
        items = raw if isinstance(raw, list) else []

    papers = []
    for item in items:
        if not isinstance(item, dict):
            continue
        authors = item.get('authors', [])
        if isinstance(authors, str):
            authors = [a.strip() for a in authors.split(',')]
        papers.append({
            'title':    item.get('title', '(No Title)'),
            'authors':  authors,
            'date':     item.get('date', item.get('published', ''))[:10],
            'abstract': item.get('abstract', item.get('summary', '')),
            'url':      item.get('url', item.get('link', '#')),
            'tags':     item.get('tags') or infer_tags(item.get('title','') + ' ' + item.get('abstract','')),
            'source':   item.get('source', 'arxiv'),
            'digest':   item.get('digest', ''),
        })
    print(f'[data] 加载 {len(papers)} 条记录')
    return papers


# ──────────────────────────────────────────────
# 输出 JSON
# ──────────────────────────────────────────────
def build_json(topic_key: str, topic_cfg: dict, items: list[dict], out: str,
               hot_topics: list[dict] = None, trending_repos: list[dict] = None,
               bili_videos: list[dict] = None, xhs_notes: list[dict] = None):
    """输出报告 JSON：papers + hot_topics（HN）+ trending_repos（GitHub）+ bili_videos（B站）+ xhs_notes（小红书）"""
    payload: dict = {
        'topic':           topic_key,
        'label':           topic_cfg['label'],
        'desc':            topic_cfg['desc'],
        'generated':       datetime.now().strftime('%Y-%m-%d %H:%M'),
        'papers':          items,
        'hot_topics':      hot_topics or [],
        'trending_repos':  trending_repos or [],
        'bili_videos':     bili_videos or [],
        'xhs_notes':       xhs_notes or [],
    }
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f'[build] 已生成 {out}（{os.path.getsize(out)//1024} KB，论文 {len(items)} 篇，HN {len(hot_topics or [])}，GH {len(trending_repos or [])}，B站 {len(bili_videos or [])}，小红书 {len(xhs_notes or [])}）')

    # 写 pending_comments.json：告知 agent 有条目需要 AI 点评
    pending = []
    for h in (hot_topics or []):
        if not h.get('comment'):
            pending.append({'id': f'hn:{h.get("hn_id","")}', 'type': 'hn',
                            'title': h.get('title',''), 'title_zh': '', 'desc': '',
                            'points': h.get('points',0), 'comments': h.get('comments',0)})
    for v in (bili_videos or []):
        if not v.get('comment'):
            bvid = v.get('url','').split('/')[-1]
            pending.append({'id': f'bili:{bvid}', 'type': 'bili',
                            'title': v.get('title',''), 'desc': v.get('desc','')[:200],
                            'play': v.get('play',0), 'author': v.get('author','')})
    # GitHub trending repos 也加入待点评
    for r in (trending_repos or []):
        if not r.get('comment'):
            rkey = r.get('name','').replace('/','_')
            pending.append({'id': f'gh:{rkey}', 'type': 'github',
                            'name': r.get('name',''), 'desc': r.get('desc',''),
                            'stars': r.get('stars',0), 'weekly_stars': r.get('weekly_stars',0)})
    if pending:
        pending_path = os.path.join(os.path.dirname(out), 'pending_comments.json')
        meta = {'report_file': out, 'items': pending}
        with open(pending_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        print(f'[pending] 写入 pending_comments.json（{len(pending)} 条待点评）')


def update_index(entries: list[dict], workspace: str):
    """
    更新两个索引文件：
    - topics_index.json：每个领域的最新一期（供目录页顶部专栏卡片使用）
    - index.json：所有领域、所有期数的完整历史归档（按时间倒序）
    """
    # 1. topics_index.json（最新一期，按领域去重）
    topics_path = os.path.join(workspace, 'topics_index.json')
    if os.path.exists(topics_path):
        with open(topics_path, 'r', encoding='utf-8') as f:
            topics = json.load(f)
    else:
        topics = []

    for entry in entries:
        topics = [e for e in topics if e.get('topic') != entry['topic']]
        topics.insert(0, entry)

    order = list(TOPICS.keys())
    topics.sort(key=lambda e: order.index(e['topic']) if e['topic'] in order else 99)

    with open(topics_path, 'w', encoding='utf-8') as f:
        json.dump(topics, f, ensure_ascii=False, indent=2)
    print(f'[index] topics_index.json 已更新（{len(topics)} 个领域）')

    # 2. index.json（完整历史归档，所有领域所有期，时间倒序）
    archive_path = os.path.join(workspace, 'index.json')
    if os.path.exists(archive_path):
        with open(archive_path, 'r', encoding='utf-8') as f:
            archive = json.load(f)
    else:
        archive = []

    for entry in entries:
        archive_id = f'{entry["topic"]}_{entry["date"]}'
        # 同领域同日期覆盖更新
        archive = [e for e in archive if e.get('id') != archive_id]

        # 尝试从已生成的 JSON 文件里读取 overview.background
        overview_bg = ''
        out_file = os.path.join(workspace, entry['file'])
        if os.path.exists(out_file):
            try:
                with open(out_file, 'r', encoding='utf-8') as f:
                    out_data = json.load(f)
                ov = out_data.get('overview', {})
                bg = ov.get('background', '') if isinstance(ov, dict) else ''
                overview_bg = bg[:160] + ('…' if len(bg) > 160 else '')
            except Exception:
                pass

        archive.insert(0, {
            'id':          archive_id,
            'topic':       entry['topic'],
            'label':       entry['label'],
            'emoji':       entry.get('emoji', '📄'),
            'date':        entry['date'],
            'count':       entry['count'],
            'file':        entry['file'],
            'overview_bg': overview_bg,
        })

    # 按日期倒序排列
    archive.sort(key=lambda e: e.get('date', ''), reverse=True)

    with open(archive_path, 'w', encoding='utf-8') as f:
        json.dump(archive, f, ensure_ascii=False, indent=2)
    print(f'[index] index.json 已更新（共 {len(archive)} 条历史记录）')


# ──────────────────────────────────────────────
# 入口
# ──────────────────────────────────────────────
if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='领域资讯跟进报告 - 数据生成器')
    ap.add_argument('--topic',  default='3dgs',
                    help=f'领域 key：{"|".join(list(TOPICS.keys())+["all"])}')
    ap.add_argument('--max',    type=int, default=0,
                    help='最多条目数（0=使用领域默认值）')
    ap.add_argument('--data',   default='',
                    help='数据来源：本地 JSON 路径或 HTTP URL，跳过在线抓取')
    ap.add_argument('--out',    default='',
                    help='输出 JSON 路径（默认自动命名）')

    args = ap.parse_args()

    workspace   = '/root/.openclaw/workspace'
    date_str    = datetime.now().strftime('%Y%m%d')
    base_url    = 'https://workspacej9jjy0b2zdgg0ebafo-8080.gz.cloudide.woa.com'

    topics_to_run = list(TOPICS.keys()) if args.topic == 'all' else [args.topic]
    index_entries = []

    for topic_key in topics_to_run:
        if topic_key not in TOPICS:
            print(f'[error] 未知 topic: {topic_key}，可用: {list(TOPICS.keys())}')
            continue

        cfg   = TOPICS[topic_key]
        max_n = args.max or cfg['max']

        # 自动序号：同日期若已存在 topic_YYYYMMDD.json，则生成 topic_YYYYMMDD.2、.3 …
        def _next_out_name(base_dir, key, ds):
            base = os.path.join(base_dir, f'{key}_{ds}.json')
            if not os.path.exists(base):
                return f'{key}_{ds}.json'
            n = 2
            while os.path.exists(os.path.join(base_dir, f'{key}_{ds}.{n}.json')):
                n += 1
            return f'{key}_{ds}.{n}.json'

        out_name = _next_out_name(workspace, topic_key, date_str)
        out_path = args.out if (args.out and len(topics_to_run) == 1) else os.path.join(workspace, out_name)

        hot_topics: list     = []
        trending_repos: list = []
        bili_videos: list    = []
        xhs_notes: list      = []

        if args.data:
            items = load_data(args.data)
            new_ids: list = []
            if items is None:
                continue
        else:
            items, new_ids, hot_topics, trending_repos, bili_videos, xhs_notes = build_dataset(cfg, topic_key, max_n, workspace)

        build_json(topic_key, cfg, items, out_path, hot_topics, trending_repos, bili_videos, xhs_notes)

        # 持久化去重记录（仅在线抓取时更新）
        if not args.data and new_ids:
            seen = load_seen(workspace, topic_key)
            save_seen(workspace, topic_key, seen, new_ids)

        index_entries.append({
            'topic':     topic_key,
            'label':     cfg['label'],
            'emoji':     cfg['emoji'],
            'desc':      cfg['desc'],
            'file':      out_name,
            'date':      date_str,
            'count':     len(items),
        })

        print(f'[done] {cfg["label"]} 报告：{base_url}/report.html#{topic_key}_{date_str}')

    if index_entries:
        update_index(index_entries, workspace)
