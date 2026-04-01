# HEARTBEAT.md

## 任务：检测新 3DGS 报告并推送

每次 heartbeat 执行以下检查：

1. 读取 `/root/.openclaw/workspace/index.json`
2. 读取 `/root/.openclaw/workspace/memory/heartbeat-state.json`（若不存在则视为空）
3. 比对 index.json 中的条目：
   - 找出 `id` 包含 `3dgs` 的条目（3DGS 相关报告）
   - 检查该条目的 `id` 是否已在 heartbeat-state.json 的 `notified` 列表中
4. 若发现**未通知过的新 3DGS 条目**：
   - 通过 message tool 发送到 openclaw-wecom-bot，target=wrkSFfCgAAul4_3uS5LQgqFjtR_2wnwQ，格式：
     ```
     📊 本周 3DGS 论文报告已生成（{count} 篇）｜📅 {date}

     [点击查看报告](https://workspacej9jjy0b2zdgg0ebafo-8080.gz.cloudide.woa.com/report.html#{id})
     ```
   - 将该 `id` 加入 heartbeat-state.json 的 `notified` 列表并保存
5. 若没有新条目，回复 HEARTBEAT_OK
