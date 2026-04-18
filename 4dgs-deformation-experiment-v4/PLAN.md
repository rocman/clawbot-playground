# V4 4DGS 动态高斯 Viewer 架构设计文档

> 最后更新：2026-04-18

## 一、整体目标

在浏览器中实时播放 4D Gaussian Splatting 动态场景（128K 高斯 × 300 帧 @30fps），兼顾：
- **低传输量**：总下载 < 10 MB（GOP 差值编码 + gzip）
- **低内存**：稳态 < 80 MB（播放中 ~70MB，暂停后 ~40MB）
- **零 CPU 解码开销**（播放期间）：客户端预生成 GPU-ready 纹理数据，播放时仅 `texSubImage2D`
- **跨平台流畅**：桌面 60fps、移动端 30fps+

---

## 二、数据编码层（离线）

### 2.1 V3c 差值编码 — Method B（无 Refresh Frame）

**目的**：将 300 帧高斯属性（xyz/dc/opacity）压缩为极小的 GOP 文件。

**实现思路**：
- 每帧高斯属性量化为 uint8 绝对值
- 帧间差值：`diff[i] = quant_abs[i] - decoded[i-1]`（追踪解码器状态，非真实前一帧）
- diff 存为 int8（范围 [-128, 127]），超范围被 clamp
- **Method B 关键**：编码器维护 `enc_prev`（模拟解码器重建值），而非使用原始量化值。即使 clipping 发生，下一帧的 diff 会基于解码器已知的（含误差的）重建值计算，从而**自动补偿**，无累积误差
- **去掉 Refresh Frame**：Method B 保证零累积误差，不再需要定期重置

**数据组织**：
- `gop_meta.bin.gz`：baseData（frame 0 量化绝对值，作为解码基准）+ mask（活跃属性标记）
- `gop_xxx.bin.gz`（×10）：每 30 帧一个 GOP（GOP 0 从 frame 1 开始），总计 ~7 MB

### 2.2 GOP 分拆规则

- **分拆依据**：`gop_size = 30`（每 30 帧一个 GOP 文件）
- **总帧数**：300 帧 → 10 个 GOP
- GOP 0 特殊：从 frame 1 开始（frame 0 的数据存在 gop_meta 中）
- 每个 GOP 文件内部：二进制头（magic + numFrames + frameOffsets）+ 逐帧 diff 数据

---

## 三、客户端预生成层（V4d 核心策略）

### 3.1 Client-side Pre-generate

**目的**：解决 V4c 方案传输量过大（~200MB texframe 文件）的问题，将 CPU 解码工作提前到"后台生成"阶段完成，播放时零 CPU 开销。

**实现思路**：
1. 下载小体积 GOP 文件（~7MB 总传输）
2. 在客户端 decode + pack 生成 GPU-ready RGBA16F texData
3. 将生成结果以 raw 格式存入 OPFS（浏览器持久化文件系统）
4. 播放时直接从 OPFS 读取 raw → `texSubImage2D` 上传 GPU（零解码）

**Chunk 分段**：
- `FRAMES_PER_CHUNK = 15`，共 20 个 chunk
- 每个 chunk 的 raw 数据 ~29 MB（512×501×4×2 bytes × 15 帧）
- 2 个 active chunk 内存占用 ~60 MB

### 3.2 后台生成队列（Background Generate Queue）

**目的**：页面加载后立即开始在后台按序生成所有 chunk，确保第二轮循环播放时零等待。

**实现思路**：
- `startBackgroundGenerateQueue()`：从 chunk 0 到 chunk 19 按序生成
- 使用专属 `bgState`（解码器状态），保证跨 chunk 边界的帧间连续性
- 生成完一个 chunk 后写入 OPFS，texData 不驻留内存（由 LRU 策略管理）
- 对已在 OPFS 缓存中的 chunk，执行 `dryRunDecodeChunk`（空跑解码）维护 bgState 连续性
- 生成中使用 `texChunkLoadingSet` 防止重复请求

### 3.3 解码器状态并发隔离（V4d-9）

**目的**：消除后台队列与播放预取之间的解码器状态竞争。

**问题背景**：
- 后台队列（顺序生成）和播放预取（乱序触发 loadTexChunk）共享同一个全局 `streamState`
- 预取覆盖 state → 后台队列后续解码错误 → 画面跳变+重影

**实现思路**：
- `makeStreamState()` 工厂函数：每个调用方创建独立状态
- `streamDecodeFrameRange(state, gopIdx, gopRaw, targetLocalIdx)`：接收显式 state 参数
- **后台队列**：专属 `bgState`，从 chunk 0 开始顺序连续维护
- **预取/stall 恢复**：创建独立 `localState`，**warmup 解码**从 frame 1 到 chunk startFrame 建立正确 prevFrame
- `dryRunDecodeChunk(chunkIdx, state)`：用于维护 state 连续性（跳过已缓存 chunk 时）

---

## 四、播放层

### 4.1 OPFS 持久化缓存

**目的**：避免每次刷新页面重新生成所有 chunk。

**实现思路**：
- `GopPersistCache` 类封装 OPFS/IndexedDB 双后端（OPFS 优先，不支持则降级 IDB）
- 缓存 key = `{V4D_VERSION}/{path}`，版本号变更自动失效
- 存储 raw 数据（而非 gzip），读取时零解压
- I-frame SPZ 也走 OPFS 缓存

### 4.2 内存管理 — LRU 限制

**目的**：控制内存在 80MB 以下，避免移动端内存压力导致帧率下降。

**实现思路**：
- `MAX_ACTIVE_CHUNKS = 2`：最多 2 个 chunk 的 texData 同时驻留内存
- `enforceTexDataLimit()`：基于 LRU 策略 strip 超限 chunk 的 texData（设为 null）
- strip 时保留 cache entry + rawCacheKey → 下次需要时从 OPFS 秒读恢复
- 触发点：loadTexChunk 成功后、ensureTexChunkReady 恢复后

### 4.3 暂停释放内存

**目的**：暂停播放时释放不必要的内存，从 ~70MB 降至 ~40MB。

**实现思路**：
- 停止后台生成队列（`bgDownloadRunning = false`）
- strip 非当前 chunk 的 texData（仅保留正在显示帧所在的 1 个 chunk）
- 释放 `decodeOutputBuf`
- 清空 `_gopFetchCache`（GOP 中间产物全部释放）
- 恢复播放时重建必要组件 + 重启后台队列

### 4.4 GOP 缓存引用计数

**目的**：防止 `_gopFetchCache` 内存泄漏（10 个解压后 GOP 各 ~26MB → 260MB）。

**实现思路**：
- `fetchAndDecompressGOP(gopIdx)`：获取 GOP 时 refCount++
- `releaseGOP(gopIdx)`：使用完毕后 refCount--，降到 0 则从 Map 删除
- `generateTexChunkFromGOPs()` 完成后立即释放所有引用的 GOP
- 稳态时最多 1-2 个 GOP 在内存中

---

## 五、渲染层

### 5.1 纹理布局 — 3 分区 Ring Buffer

**目的**：允许 GPU 在读取当前帧纹理的同时，CPU 写入下一帧数据，避免读写冲突。

**实现思路**：
- Delta 纹理高度 = `rowsPerFrame × 3`（3 分区轮转）
- `writePartition` / `readPartition` 交替切换
- `gl.texSubImage2D()` 局部更新对应分区（绕过 THREE.js 全量上传）
- Shader 中通过 `uDeltaHalf * halfH` 偏移选择活跃分区

### 5.2 时间驱动帧号（V4d-7）

**目的**：消除 `requestAnimationFrame` 回调时间抖动导致的帧间隔不均匀（卡顿感）。

**实现思路**：
- `targetFrame = (playbackStartFrame + Math.floor(elapsed / ADVANCE_INTERVAL)) % totalFrames`
- 完全由墙钟时间决定当前帧号，不受 rAF 回调时间波动影响
- 在 5 个关键时机重置时间基准：resume / seek / speed-change / manual-drag / init
- Stall 时暂停时钟（`stallStartTime`），数据就绪后继续而不跳帧

### 5.3 自适应 DPR（像素比）

**目的**：当 GPU 负载过高（帧率下降）时，通过降低渲染分辨率缓解压力。

**实现思路**：
- **易降难升**策略：
  - 单帧 > 38ms（< 26fps）→ 立即降 DPR 0.25（最低 0.5），500ms 冷却
  - 持续 > 50fps（帧间隔 < 20ms）→ 调度 3 秒后升一档
  - 期间任何慢帧 → 取消升级 timeout，保持低 DPR
- 不调用 `renderer.setSize()`（会清空 framebuffer 导致闪黑），直接修改 canvas 尺寸 + `gl.viewport()`

---

## 六、预取与调度

### 6.1 播放预取（triggerPrefetch）

**目的**：提前加载下一个 chunk，避免 chunk 边界切换时 stall。

**实现思路**：
- 当前 chunk 播放过半（> 50% 帧）时触发下一个 chunk 的 `loadTexChunk`
- `loadTexChunk` 优先从 OPFS 读取（秒级恢复）
- OPFS 未命中时从头 warmup 解码（独立 localState）

### 6.2 Stall 恢复

**目的**：当播放到达尚未就绪的 chunk 时，暂停推进帧号，等待数据就绪。

**实现思路**：
- 检测 `texChunkCache.get(chunkIdx).texData === null` → 进入 stall
- 暂停时钟（记录 stallStartTime）
- 触发 `loadTexChunk(chunkIdx)` 恢复数据
- 数据就绪后恢复时钟，从当前帧继续（不跳帧）

---

## 七、版本演进路线

| 版本 | 核心策略 | 优势 | 劣势 |
|------|----------|------|------|
| V4 | 实时 CPU 解码 + 2 GOP 窗口 | 最简单，低内存 50MB | CPU 每帧解码，Safari 掉帧 |
| V4a | Mini-GOP + Ring Buffer + 流式解压 | 内存 787MB(含GPU)最低 | 复杂度高，解压延迟 |
| V4b | Batch Pre-bake GPU Texture | 零 CPU 播放 | bake 延迟导致 31% stall |
| V4c | 离线预生成 texframe 文件 | 零 CPU，零等待 | 传输量 ~200MB 太大 |
| **V4d** | **客户端预生成 + OPFS 缓存** | **~7MB 传输 + 零 CPU 播放** | 首次打开需后台生成时间 |

---

## 八、关键配置参数

```javascript
// 编码
gop_size = 30           // 每 GOP 30 帧
method = 'B'            // 追踪解码器状态，无 refresh frame
total_frames = 300      // 总帧数
target_fps = 30         // 播放帧率

// 客户端
FRAMES_PER_CHUNK = 15   // 每 chunk 15 帧
MAX_ACTIVE_CHUNKS = 2   // 最多 2 个 chunk texData 驻留内存
V4D_VERSION = 'v4d-9'   // OPFS 缓存版本号

// 渲染
DELTA_K = 256           // 纹理宽 512 像素
rowsPerFrame = 501      // 每帧 501 行
RING_PARTITIONS = 3     // 3 分区 ring buffer
```

---

## 九、文件结构

```
4dgs-deformation-experiment-v4/
├── index_v4d.html              # 当前主版本（V4d-9）
├── data_v3d/                   # V4d 使用的 GOP 数据（Method B 编码）
│   ├── manifest.json           # 元数据（GOP 索引、帧数、编码参数）
│   ├── gop_meta.bin.gz         # baseData + mask
│   ├── gop_000.bin.gz ~ gop_009.bin.gz  # 10 个 GOP 文件
│   └── i_frame.spz            # 初始帧完整高斯模型
├── data_v3d_refresh/           # 旧版数据（Method A + refresh frame，对比用）
├── data_v4c/                   # V4c 预生成纹理数据（已弃用，保留对比）
├── index_v4d_refresh-frame.html    # A/B 对比：有 refresh frame 版本
├── index_v4d_no-refresh-frame.html # A/B 对比：仅去掉 refresh 版本
├── index_v4c.html              # V4c 版本（保留）
├── index_v4b.html              # V4b 版本（保留）
├── index_v4a.html              # V4a 版本（保留）
└── index_v4.html               # V4 原始版本（保留）
```
