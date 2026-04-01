#!/usr/bin/env python3
"""
enrich_comments.py
从 stdin 读取 JSON（含 hot_topics / bili_videos），
为每条生成点评，输出到 stdout。
由子 agent 调用，不直接执行。
"""
import json, sys

data = json.load(sys.stdin)

# 子 agent 会替换这个文件的逻辑，直接输出 enriched JSON
print(json.dumps(data, ensure_ascii=False, indent=2))
