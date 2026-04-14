/**
 * 4DGS Viewer Memory Benchmark: V3b (float32+uint8) vs V3c (uint8 only)
 * 
 * Usage: node --expose-gc memory_benchmark.js
 * (--expose-gc enables global.gc() for precise measurements)
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data_v3c');

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function getMemUsage() {
  if (global.gc) global.gc();
  const mem = process.memoryUsage();
  return {
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers,
  };
}

function logMem(label) {
  const m = getMemUsage();
  console.log(`  [MEM] ${label}:`);
  console.log(`         RSS: ${formatBytes(m.rss)}, Heap: ${formatBytes(m.heapUsed)}/${formatBytes(m.heapTotal)}, External: ${formatBytes(m.external)}, ArrayBuffers: ${formatBytes(m.arrayBuffers)}`);
  return m;
}

function float16ToFloat32(u16arr) {
  const f32 = new Float32Array(u16arr.length);
  for (let i = 0; i < u16arr.length; i++) {
    const h = u16arr[i];
    const sign = (h >> 15) & 0x1;
    const exp = (h >> 10) & 0x1f;
    const mant = h & 0x3ff;
    if (exp === 0) {
      f32[i] = mant === 0 ? (sign ? -0 : 0) : (sign ? -1 : 1) * Math.pow(2, -14) * (mant / 1024);
    } else if (exp === 31) {
      f32[i] = mant === 0 ? (sign ? -Infinity : Infinity) : NaN;
    } else {
      f32[i] = (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + mant / 1024);
    }
  }
  return f32;
}

// ============================================================
// V3b: 优化前 — 每帧存 float32 + uint8
// ============================================================
function benchmarkV3b() {
  console.log('\n========================================');
  console.log('  V3b Benchmark (优化前: float32 + uint8)');
  console.log('========================================');

  const memBaseline = logMem('Baseline');

  // Load manifest
  const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf8'));
  const N = manifest.dynamic_gaussians;
  const numFramesExpected = manifest.p_frame_count;
  console.log(`  N=${N.toLocaleString()} 动态高斯, ${numFramesExpected} 帧`);

  // Load and decompress bundle
  console.log('  加载 bundle...');
  const compressedBuf = fs.readFileSync(path.join(DATA_DIR, manifest.p_frame_bundle));
  console.log(`  Bundle 压缩大小: ${formatBytes(compressedBuf.byteLength)}`);

  const raw = zlib.gunzipSync(compressedBuf);
  console.log(`  解压大小: ${formatBytes(raw.byteLength)}`);
  const memAfterDecompress = logMem('解压后');

  // Parse
  const rawBuf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const rawView = new DataView(rawBuf);
  const rawBytes = new Uint8Array(rawBuf);

  let pos = 28;
  const numFrames = rawView.getUint32(8, true);
  const numGaussians = rawView.getUint32(12, true);
  const frameTable = [];
  for (let i = 0; i < numFrames; i++) {
    frameTable.push({
      srcIdx: rawView.getUint32(pos, true),
      dataOffset: rawView.getUint32(pos + 4, true),
      flag: rawView.getUint32(pos + 8, true),
    });
    pos += 12;
  }

  const dcMin = [rawView.getFloat32(pos, true), rawView.getFloat32(pos+4, true), rawView.getFloat32(pos+8, true)];
  const dcMax = [rawView.getFloat32(pos+12, true), rawView.getFloat32(pos+16, true), rawView.getFloat32(pos+20, true)];
  const opMin = rawView.getFloat32(pos+24, true);
  const opMax = rawView.getFloat32(pos+28, true);
  const xyzDMin = [rawView.getFloat32(pos+32, true), rawView.getFloat32(pos+36, true), rawView.getFloat32(pos+40, true)];
  const xyzDMax = [rawView.getFloat32(pos+44, true), rawView.getFloat32(pos+48, true), rawView.getFloat32(pos+52, true)];
  pos += 56;
  const xyzDScale = [(xyzDMax[0]-xyzDMin[0])/255, (xyzDMax[1]-xyzDMin[1])/255, (xyzDMax[2]-xyzDMin[2])/255];

  const spzBaselineSize = rawView.getUint32(pos, true);
  pos += 4;
  const spzXyz16 = new Uint16Array(rawBuf, pos, numGaussians * 3);
  const spzBaselineXyz = float16ToFloat32(spzXyz16);
  pos += spzBaselineSize;

  const dataStart = pos;
  const xyzBytesBase = N * 3 * 2;
  const xyzBytesInt8 = N * 3;
  const dcBytes = N * 3;

  // Decode all frames — V3b style
  console.log('  开始解码 (V3b: 每帧存 float32 + uint8)...');
  const decodedFrames = [];
  let prevXyz = null, prevDcQ = null, prevOpQ = null;
  let baseXyz = null, baseDcQ = null, baseOpQ = null;
  let totalAllocatedBytes = 0;
  const t0 = performance.now();

  for (let fi = 0; fi < numFrames; fi++) {
    const ft = frameTable[fi];
    let fStart = dataStart + ft.dataOffset;
    const isBaseFrame = ft.flag === 1;
    const isRefresh = ft.flag === 2;

    let fXyzDelta;
    if (isBaseFrame) {
      const fXyz16 = new Uint16Array(rawBuf, fStart, N * 3);
      fXyzDelta = float16ToFloat32(fXyz16);
      fStart += xyzBytesBase;
    } else {
      const fXyzI8 = new Int8Array(rawBuf, fStart, N * 3);
      fXyzDelta = new Float32Array(N * 3);
      for (let c = 0; c < 3; c++) {
        for (let i = 0; i < N; i++) fXyzDelta[i*3+c] = (fXyzI8[i*3+c]+128)*xyzDScale[c]+xyzDMin[c];
      }
      fStart += xyzBytesInt8;
    }

    const frame = {
      xyz: new Float32Array(N * 3),
      shs_dc: new Float32Array(N * 3),
      opacity: new Float32Array(N),
      dcQ: new Uint8Array(N * 3),
      opQ: new Uint8Array(N),
    };

    const frameBytes = frame.xyz.byteLength + frame.shs_dc.byteLength + frame.opacity.byteLength
                     + frame.dcQ.byteLength + frame.opQ.byteLength;
    totalAllocatedBytes += frameBytes;

    if (isBaseFrame) {
      const fDcU8 = new Uint8Array(rawBuf, fStart, N * 3); fStart += dcBytes;
      const fOpU8 = new Uint8Array(rawBuf, fStart, N);
      for (let i = 0; i < N*3; i++) frame.xyz[i] = spzBaselineXyz[i] + fXyzDelta[i];
      frame.dcQ.set(fDcU8); frame.opQ.set(fOpU8);
      for (let c = 0; c < 3; c++) {
        const s = (dcMax[c]-dcMin[c])/255;
        for (let i = 0; i < N; i++) frame.shs_dc[i*3+c] = fDcU8[i*3+c]*s+dcMin[c];
      }
      { const s = (opMax-opMin)/255; for (let i = 0; i < N; i++) frame.opacity[i] = fOpU8[i]*s+opMin; }
      baseXyz = frame.xyz; baseDcQ = frame.dcQ; baseOpQ = frame.opQ;
    } else {
      const refXyz = isRefresh ? baseXyz : prevXyz;
      const refDcQ = isRefresh ? baseDcQ : prevDcQ;
      const refOpQ = isRefresh ? baseOpQ : prevOpQ;
      const fDcDelta = new Int8Array(rawBuf, fStart, N*3); fStart += dcBytes;
      const fOpDelta = new Int8Array(rawBuf, fStart, N);
      for (let i = 0; i < N*3; i++) frame.xyz[i] = refXyz[i] + fXyzDelta[i];
      for (let i = 0; i < N*3; i++) { let q = refDcQ[i]+fDcDelta[i]; frame.dcQ[i] = q<0?0:(q>255?255:q); }
      for (let c = 0; c < 3; c++) { const s = (dcMax[c]-dcMin[c])/255; for (let i = 0; i < N; i++) frame.shs_dc[i*3+c]=frame.dcQ[i*3+c]*s+dcMin[c]; }
      for (let i = 0; i < N; i++) { let q = refOpQ[i]+fOpDelta[i]; frame.opQ[i] = q<0?0:(q>255?255:q); }
      { const s = (opMax-opMin)/255; for (let i = 0; i < N; i++) frame.opacity[i]=frame.opQ[i]*s+opMin; }
    }

    decodedFrames[fi] = frame;
    prevXyz = frame.xyz; prevDcQ = frame.dcQ; prevOpQ = frame.opQ;
  }

  const decodeTime = ((performance.now() - t0) / 1000).toFixed(3);
  const memAfterDecode = logMem('解码完成');

  // Detailed breakdown
  const perFrameF32 = (N * 3 * 4) + (N * 3 * 4) + (N * 4);
  const perFrameU8 = (N * 3) + N;
  const perFrameTotal = perFrameF32 + perFrameU8;

  console.log('');
  console.log('--- V3b 实测结果 ---');
  console.log(`  解码耗时: ${decodeTime}s`);
  console.log(`  帧数: ${numFrames}`);
  console.log(`  每帧 TypedArray 分配:`);
  console.log(`    xyz (Float32Array):     ${formatBytes(N * 3 * 4)}`);
  console.log(`    shs_dc (Float32Array):  ${formatBytes(N * 3 * 4)}`);
  console.log(`    opacity (Float32Array): ${formatBytes(N * 4)}`);
  console.log(`    dcQ (Uint8Array):       ${formatBytes(N * 3)}`);
  console.log(`    opQ (Uint8Array):       ${formatBytes(N)}`);
  console.log(`    ─────────────────────────────────`);
  console.log(`    每帧小计:               ${formatBytes(perFrameTotal)}`);
  console.log('');
  console.log(`  全部帧数据 (${numFrames} 帧):`);
  console.log(`    TypedArray 总量:        ${formatBytes(totalAllocatedBytes)}`);
  console.log(`    其中 float32 部分:      ${formatBytes(perFrameF32 * numFrames)}`);
  console.log(`    其中 uint8 部分:        ${formatBytes(perFrameU8 * numFrames)}`);
  console.log(`  raw buffer (解压数据):    ${formatBytes(rawBuf.byteLength)}`);
  console.log(`  spzBaselineXyz:           ${formatBytes(spzBaselineXyz.byteLength)}`);
  console.log('');

  const totalDataMem = totalAllocatedBytes + spzBaselineXyz.byteLength;
  console.log(`  📊 帧数据内存:            ${formatBytes(totalAllocatedBytes)}`);
  console.log(`  📊 + raw buffer (解码期峰值): ${formatBytes(totalAllocatedBytes + rawBuf.byteLength)}`);

  const result = {
    perFrameBytes: perFrameTotal,
    perFrameF32Bytes: perFrameF32,
    perFrameU8Bytes: perFrameU8,
    totalFrameDataBytes: totalAllocatedBytes,
    rawBufferBytes: rawBuf.byteLength,
    baselineXyzBytes: spzBaselineXyz.byteLength,
    decodeTime: parseFloat(decodeTime),
    numFrames,
    numGaussians: N,
    memAfterDecode,
    memBaseline,
  };

  // Cleanup
  decodedFrames.length = 0;
  return result;
}

// ============================================================
// V3c: 优化后 — 每帧只存 uint8
// ============================================================
function benchmarkV3c() {
  console.log('\n========================================');
  console.log('  V3c Benchmark (优化后: uint8 only)');
  console.log('========================================');

  const memBaseline = logMem('Baseline');

  const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf8'));
  const N = manifest.dynamic_gaussians;
  console.log(`  N=${N.toLocaleString()} 动态高斯, ${manifest.p_frame_count} 帧`);

  console.log('  加载 bundle...');
  const compressedBuf = fs.readFileSync(path.join(DATA_DIR, manifest.p_frame_bundle));
  console.log(`  Bundle 压缩大小: ${formatBytes(compressedBuf.byteLength)}`);

  const raw = zlib.gunzipSync(compressedBuf);
  console.log(`  解压大小: ${formatBytes(raw.byteLength)}`);
  const memAfterDecompress = logMem('解压后');

  const rawBuf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const rawView = new DataView(rawBuf);

  let pos = 28;
  const numFrames = rawView.getUint32(8, true);
  const numGaussians = rawView.getUint32(12, true);
  const frameTable = [];
  for (let i = 0; i < numFrames; i++) {
    frameTable.push({
      srcIdx: rawView.getUint32(pos, true),
      dataOffset: rawView.getUint32(pos + 4, true),
      flag: rawView.getUint32(pos + 8, true),
    });
    pos += 12;
  }

  const xyzDMin = [rawView.getFloat32(pos+32, true), rawView.getFloat32(pos+36, true), rawView.getFloat32(pos+40, true)];
  const xyzDMax = [rawView.getFloat32(pos+44, true), rawView.getFloat32(pos+48, true), rawView.getFloat32(pos+52, true)];
  pos += 56;
  const xyzDScale = [(xyzDMax[0]-xyzDMin[0])/255, (xyzDMax[1]-xyzDMin[1])/255, (xyzDMax[2]-xyzDMin[2])/255];

  const spzBaselineSize = rawView.getUint32(pos, true);
  pos += 4;
  const spzXyz16 = new Uint16Array(rawBuf, pos, numGaussians * 3);
  const spzBaselineXyz = float16ToFloat32(spzXyz16);
  pos += spzBaselineSize;

  const dataStart = pos;
  const xyzBytesBase = N * 3 * 2;
  const xyzBytesInt8 = N * 3;
  const dcBytes = N * 3;

  function quantizeXyzToU8(absDelta, n) {
    const result = new Uint8Array(n * 3);
    for (let c = 0; c < 3; c++) {
      const scale = 255.0 / (xyzDMax[c] - xyzDMin[c] + 1e-10);
      for (let i = 0; i < n; i++) {
        let q = Math.round((absDelta[i*3+c] - xyzDMin[c]) * scale);
        result[i*3+c] = q < 0 ? 0 : (q > 255 ? 255 : q);
      }
    }
    return result;
  }

  console.log('  开始解码 (V3c: 每帧只存 uint8)...');
  const decodedFrames = [];
  let prevXyzQ = null, prevDcQ = null, prevOpQ = null;
  let baseXyzQ = null, baseDcQ = null, baseOpQ = null;
  let totalAllocatedBytes = 0;
  const t0 = performance.now();

  for (let fi = 0; fi < numFrames; fi++) {
    const ft = frameTable[fi];
    let fStart = dataStart + ft.dataOffset;
    const isBaseFrame = ft.flag === 1;
    const isRefresh = ft.flag === 2;

    const frame = {
      xyzQ: new Uint8Array(N * 3),
      dcQ: new Uint8Array(N * 3),
      opQ: new Uint8Array(N),
    };

    let frameBytes = frame.xyzQ.byteLength + frame.dcQ.byteLength + frame.opQ.byteLength;

    if (isBaseFrame) {
      const fXyz16 = new Uint16Array(rawBuf, fStart, N * 3);
      const fXyzDelta = float16ToFloat32(fXyz16);
      fStart += xyzBytesBase;
      const fDcU8 = new Uint8Array(rawBuf, fStart, N * 3); fStart += dcBytes;
      const fOpU8 = new Uint8Array(rawBuf, fStart, N);
      frame.dcQ.set(fDcU8); frame.opQ.set(fOpU8);
      frame.xyzQ = quantizeXyzToU8(fXyzDelta, N);
      baseXyzQ = frame.xyzQ; baseDcQ = frame.dcQ; baseOpQ = frame.opQ;
    } else {
      const refXyzQ = isRefresh ? baseXyzQ : prevXyzQ;
      const refDcQ = isRefresh ? baseDcQ : prevDcQ;
      const refOpQ = isRefresh ? baseOpQ : prevOpQ;
      const fXyzI8 = new Int8Array(rawBuf, fStart, N * 3); fStart += xyzBytesInt8;
      const fDcI8 = new Int8Array(rawBuf, fStart, N * 3); fStart += dcBytes;
      const fOpI8 = new Int8Array(rawBuf, fStart, N);
      for (let i = 0; i < N*3; i++) { let q = refXyzQ[i]+fXyzI8[i]; frame.xyzQ[i] = q<0?0:(q>255?255:q); }
      for (let i = 0; i < N*3; i++) { let q = refDcQ[i]+fDcI8[i]; frame.dcQ[i] = q<0?0:(q>255?255:q); }
      for (let i = 0; i < N; i++) { let q = refOpQ[i]+fOpI8[i]; frame.opQ[i] = q<0?0:(q>255?255:q); }
    }

    totalAllocatedBytes += frameBytes;
    decodedFrames[fi] = frame;
    prevXyzQ = frame.xyzQ; prevDcQ = frame.dcQ; prevOpQ = frame.opQ;
  }

  const decodeTime = ((performance.now() - t0) / 1000).toFixed(3);
  const memAfterDecode = logMem('解码完成');

  const perFrameU8 = (N * 3) + (N * 3) + N;
  const perFrameTotal = perFrameU8;

  console.log('');
  console.log('--- V3c 实测结果 ---');
  console.log(`  解码耗时: ${decodeTime}s`);
  console.log(`  帧数: ${numFrames}`);
  console.log(`  每帧 TypedArray 分配:`);
  console.log(`    xyzQ (Uint8Array):  ${formatBytes(N * 3)}`);
  console.log(`    dcQ (Uint8Array):   ${formatBytes(N * 3)}`);
  console.log(`    opQ (Uint8Array):   ${formatBytes(N)}`);
  console.log(`    ─────────────────────────────────`);
  console.log(`    每帧小计:           ${formatBytes(perFrameTotal)}`);
  console.log('');
  console.log(`  全部帧数据 (${numFrames} 帧):`);
  console.log(`    TypedArray 总量:    ${formatBytes(totalAllocatedBytes)}`);
  console.log(`  raw buffer (解压数据): ${formatBytes(rawBuf.byteLength)}`);
  console.log(`  spzBaselineXyz:       ${formatBytes(spzBaselineXyz.byteLength)}`);
  console.log('');
  console.log(`  📊 帧数据内存:        ${formatBytes(totalAllocatedBytes)}`);
  console.log(`  📊 + raw buffer (解码期峰值): ${formatBytes(totalAllocatedBytes + rawBuf.byteLength)}`);

  const result = {
    perFrameBytes: perFrameTotal,
    perFrameU8Bytes: perFrameU8,
    totalFrameDataBytes: totalAllocatedBytes,
    rawBufferBytes: rawBuf.byteLength,
    baselineXyzBytes: spzBaselineXyz.byteLength,
    decodeTime: parseFloat(decodeTime),
    numFrames,
    numGaussians: N,
    memAfterDecode,
    memBaseline,
  };

  decodedFrames.length = 0;
  return result;
}

// ============================================================
// Comparison
// ============================================================
function showComparison(v3b, v3c) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           📊 V3b vs V3c 内存对比 (实测数据)                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const frameReduction = ((1 - v3c.totalFrameDataBytes / v3b.totalFrameDataBytes) * 100).toFixed(1);
  const perFrameRatio = (v3b.perFrameBytes / v3c.perFrameBytes).toFixed(1);

  const peakV3b = v3b.totalFrameDataBytes + v3b.rawBufferBytes;
  const peakV3c = v3c.totalFrameDataBytes + v3c.rawBufferBytes;
  const peakReduction = ((1 - peakV3c / peakV3b) * 100).toFixed(1);

  // Steady state = frames only (raw buffer GC'd after decode)
  const steadyV3b = v3b.totalFrameDataBytes + v3b.baselineXyzBytes;
  const steadyV3c = v3c.totalFrameDataBytes + v3c.baselineXyzBytes;
  const steadyReduction = ((1 - steadyV3c / steadyV3b) * 100).toFixed(1);

  console.log('');
  console.log(`  ┌──────────────────────────┬───────────────────┬───────────────────┬──────────────┐`);
  console.log(`  │ 指标                     │ V3b (优化前)       │ V3c (优化后)       │ 变化         │`);
  console.log(`  ├──────────────────────────┼───────────────────┼───────────────────┼──────────────┤`);
  console.log(`  │ 每帧内存                 │ ${formatBytes(v3b.perFrameBytes).padStart(17)} │ ${formatBytes(v3c.perFrameBytes).padStart(17)} │ ↓ ${perFrameRatio}x       │`);
  console.log(`  │ 帧数据总量(${v3b.numFrames}帧)       │ ${formatBytes(v3b.totalFrameDataBytes).padStart(17)} │ ${formatBytes(v3c.totalFrameDataBytes).padStart(17)} │ ↓ ${frameReduction}%     │`);
  console.log(`  │ raw buffer               │ ${formatBytes(v3b.rawBufferBytes).padStart(17)} │ ${formatBytes(v3c.rawBufferBytes).padStart(17)} │ 相同         │`);
  console.log(`  │ 解码期峰值(帧+raw)       │ ${formatBytes(peakV3b).padStart(17)} │ ${formatBytes(peakV3c).padStart(17)} │ ↓ ${peakReduction}%     │`);
  console.log(`  │ 稳态内存(帧+baseline)    │ ${formatBytes(steadyV3b).padStart(17)} │ ${formatBytes(steadyV3c).padStart(17)} │ ↓ ${steadyReduction}%     │`);
  console.log(`  │ 解码耗时                 │ ${(v3b.decodeTime+'s').padStart(17)} │ ${(v3c.decodeTime+'s').padStart(17)} │              │`);
  console.log(`  └──────────────────────────┴───────────────────┴───────────────────┴──────────────┘`);

  // Process memory comparison
  console.log('');
  console.log('  === Process Memory (Node.js process.memoryUsage) ===');
  
  const rssA = v3b.memAfterDecode.rss - v3b.memBaseline.rss;
  const rssB = v3c.memAfterDecode.rss - v3c.memBaseline.rss;
  const abA = v3b.memAfterDecode.arrayBuffers - v3b.memBaseline.arrayBuffers;
  const abB = v3c.memAfterDecode.arrayBuffers - v3c.memBaseline.arrayBuffers;

  console.log(`  V3b 解码后: RSS=${formatBytes(v3b.memAfterDecode.rss)}, ArrayBuffers=${formatBytes(v3b.memAfterDecode.arrayBuffers)}`);
  console.log(`  V3c 解码后: RSS=${formatBytes(v3c.memAfterDecode.rss)}, ArrayBuffers=${formatBytes(v3c.memAfterDecode.arrayBuffers)}`);
  console.log(`  RSS 增量:         V3b=${formatBytes(rssA)} → V3c=${formatBytes(rssB)} (↓${((1-rssB/rssA)*100).toFixed(1)}%)`);
  console.log(`  ArrayBuffers 增量: V3b=${formatBytes(abA)} → V3c=${formatBytes(abB)} (↓${((1-abB/abA)*100).toFixed(1)}%)`);

  console.log('');
  console.log('  注: 稳态内存中 raw buffer 会在解码函数返回后被 GC 回收');
  console.log('  注: 以上为 Node.js 环境测试结果，浏览器中还需额外计入 WebGL/Three.js/Spark.js 开销');
}

// ============================================================
// Main
// ============================================================
console.log('🔬 4DGS Viewer Memory Benchmark');
console.log(`  时间: ${new Date().toLocaleString()}`);
console.log(`  Node.js: ${process.version}`);
console.log(`  global.gc() 可用: ${!!global.gc}`);
if (!global.gc) {
  console.log('  ⚠️  建议使用 node --expose-gc 运行以获取更精确的内存测量');
}
console.log('');

const v3bResult = benchmarkV3b();

// GC and wait
console.log('\n  ⏳ 等待 GC...');
if (global.gc) { global.gc(); global.gc(); }

const v3cResult = benchmarkV3c();

showComparison(v3bResult, v3cResult);
