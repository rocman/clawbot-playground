// ============================================================
// V4 Data Worker — GOP loading, decompression, frame decoding
// Handles all heavy data processing off the main thread
// ============================================================

let manifest = null;
let N = 0; // number of dynamic gaussians

// Quantization params
let qXyzDMin = null, qXyzDMax = null, qXyzDScale = null;
let qDcMin = null, qDcMax = null;
let qOpMin = 0, qOpMax = 0;

// Base frame reference (for refresh frames)
let baseData = null; // Uint8Array(N * 7) — compact [xyz(3) dc(3) op(1)]

// GOP cache — compact storage
// gopIndex -> { data: Uint8Array(numFrames * N * 7), numFrames, startFrame, endFrame, lastAccess }
const gopCache = new Map();
const gopLoadingSet = new Set();

const STRIDE = 7; // bytes per gaussian per frame: xyz(3) + dc(3) + op(1)
let WINDOW_GOPS = 3;
let PREFETCH_GOPS = 1;

// ============================================================
// Gzip decompression
// ============================================================
async function decompressGzip(buf) {
  const ds = new DecompressionStream('gzip');
  const blob = new Blob([buf]);
  const stream = blob.stream().pipeThrough(ds);
  return await new Response(stream).blob().then(b => b.arrayBuffer());
}

// ============================================================
// Float16 → Float32
// ============================================================
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
// Float32 → Float16 (for texture packing)
// ============================================================
function float32ToFloat16(val) {
  const fv = new Float32Array(1);
  const iv = new Int32Array(fv.buffer);
  fv[0] = val;
  const f = iv[0];
  const sign = (f >> 31) & 0x1;
  let exp = ((f >> 23) & 0xff) - 127 + 15;
  let mant = (f >> 13) & 0x3ff;
  if (exp <= 0) {
    if (exp < -10) return sign << 15;
    mant = (mant | 0x400) >> (1 - exp);
    return (sign << 15) | mant;
  }
  if (exp >= 31) {
    return (sign << 15) | (31 << 10) | (mant ? 1 : 0);
  }
  return (sign << 15) | (exp << 10) | mant;
}

// ============================================================
// Compact frame data layout
// Each frame: Uint8Array(N * STRIDE)
// [i*7+0..2] = xyzQ[3]  [i*7+3..5] = dcQ[3]  [i*7+6] = opQ
// ============================================================

function getFrameSlice(gopData, localIdx, N) {
  const offset = localIdx * N * STRIDE;
  return new Uint8Array(gopData.buffer, gopData.byteOffset + offset, N * STRIDE);
}

// ============================================================
// Pack a decoded frame into Float16 texture data for transfer
// Returns Uint16Array suitable for HalfFloatType texture
// ============================================================
function packFrameToHalfFloat(frame, N, deltaK) {
  const texW = deltaK * 2;
  const texH = Math.ceil(N / deltaK);
  const texData = new Uint16Array(texW * texH * 4);
  
  const dcScale0 = (qDcMax[0] - qDcMin[0]) / 255.0;
  const dcScale1 = (qDcMax[1] - qDcMin[1]) / 255.0;
  const dcScale2 = (qDcMax[2] - qDcMin[2]) / 255.0;
  const opScale = (qOpMax - qOpMin) / 255.0;
  
  for (let i = 0; i < N; i++) {
    const bOff = i * STRIDE;
    const row = Math.floor(i / deltaK);
    const col = (i % deltaK) * 2;
    
    const dx = frame[bOff + 0] * qXyzDScale[0] + qXyzDMin[0];
    const dy = frame[bOff + 1] * qXyzDScale[1] + qXyzDMin[1];
    const dz = frame[bOff + 2] * qXyzDScale[2] + qXyzDMin[2];
    
    const dc0 = frame[bOff + 3] * dcScale0 + qDcMin[0];
    const dc1 = frame[bOff + 4] * dcScale1 + qDcMin[1];
    const dc2 = frame[bOff + 5] * dcScale2 + qDcMin[2];
    
    const op = frame[bOff + 6] * opScale + qOpMin;
    
    let off = (row * texW + col) * 4;
    texData[off + 0] = float32ToFloat16(dx);
    texData[off + 1] = float32ToFloat16(dy);
    texData[off + 2] = float32ToFloat16(dz);
    texData[off + 3] = float32ToFloat16(dc0);
    
    off = (row * texW + col + 1) * 4;
    texData[off + 0] = float32ToFloat16(dc1);
    texData[off + 1] = float32ToFloat16(dc2);
    texData[off + 2] = float32ToFloat16(op);
    texData[off + 3] = 0;
  }
  
  return texData;
}

// ============================================================
// GOP Meta Loading
// ============================================================
async function loadGopMeta(metaUrl) {
  self.postMessage({ type: 'status', msg: 'Meta: downloading...' });
  
  const resp = await fetch(metaUrl);
  const compressed = await resp.arrayBuffer();
  const raw = await decompressGzip(compressed);
  const rawView = new DataView(raw);
  
  // Parse header (28 bytes)
  const magic = String.fromCharCode(...new Uint8Array(raw, 0, 4));
  const version = rawView.getUint32(4, true);
  
  // Parse quant params (56 bytes, starting at offset 28)
  let pos = 28;
  qDcMin = [rawView.getFloat32(pos, true), rawView.getFloat32(pos+4, true), rawView.getFloat32(pos+8, true)];
  qDcMax = [rawView.getFloat32(pos+12, true), rawView.getFloat32(pos+16, true), rawView.getFloat32(pos+20, true)];
  qOpMin = rawView.getFloat32(pos+24, true);
  qOpMax = rawView.getFloat32(pos+28, true);
  qXyzDMin = [rawView.getFloat32(pos+32, true), rawView.getFloat32(pos+36, true), rawView.getFloat32(pos+40, true)];
  qXyzDMax = [rawView.getFloat32(pos+44, true), rawView.getFloat32(pos+48, true), rawView.getFloat32(pos+52, true)];
  pos += 56;
  
  qXyzDScale = [
    (qXyzDMax[0] - qXyzDMin[0]) / 255.0,
    (qXyzDMax[1] - qXyzDMin[1]) / 255.0,
    (qXyzDMax[2] - qXyzDMin[2]) / 255.0,
  ];
  
  // Parse SPZ baseline (we skip it here, main thread handles it for rendering)
  const spzSize = rawView.getUint32(pos, true);
  pos += 4;
  // Skip SPZ baseline data
  pos += spzSize;
  
  // Parse base frame (frame 0): float16 xyz + uint8 dc/op
  const xyzBytesBase = N * 3 * 2;
  const dcBytes = N * 3;
  const opBytes = N;
  
  const baseXyz16 = new Uint16Array(raw, pos, N * 3);
  const baseXyzDelta = float16ToFloat32(baseXyz16);
  pos += xyzBytesBase;
  
  const baseDcRaw = new Uint8Array(raw, pos, N * 3);
  pos += dcBytes;
  const baseOpRaw = new Uint8Array(raw, pos, N);
  
  // Store base frame in compact format
  baseData = new Uint8Array(N * STRIDE);
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 3; c++) {
      const scale = 255.0 / (qXyzDMax[c] - qXyzDMin[c] + 1e-10);
      let q = Math.round((baseXyzDelta[i * 3 + c] - qXyzDMin[c]) * scale);
      baseData[i * STRIDE + c] = q < 0 ? 0 : (q > 255 ? 255 : q);
    }
    baseData[i * STRIDE + 3] = baseDcRaw[i * 3];
    baseData[i * STRIDE + 4] = baseDcRaw[i * 3 + 1];
    baseData[i * STRIDE + 5] = baseDcRaw[i * 3 + 2];
    baseData[i * STRIDE + 6] = baseOpRaw[i];
  }
  
  self.postMessage({ type: 'metaLoaded', quantParams: {
    qXyzDMin, qXyzDMax, qXyzDScale, qDcMin, qDcMax, qOpMin, qOpMax
  }});
}

// ============================================================
// GOP Loading & Decoding
// ============================================================
async function loadGop(gopIdx) {
  if (gopCache.has(gopIdx) || gopLoadingSet.has(gopIdx)) return;
  if (gopIdx < 0 || gopIdx >= manifest.gop_count) return;
  
  gopLoadingSet.add(gopIdx);
  self.postMessage({ type: 'gopState', gopIdx, state: 'loading' });
  
  const gopInfo = manifest.gop_index[gopIdx];
  
  try {
    const resp = await fetch(`${manifest._baseUrl}${gopInfo.filename}?t=${Date.now()}`);
    const compressed = await resp.arrayBuffer();
    const raw = await decompressGzip(compressed);
    const rawView = new DataView(raw);
    
    // Parse GOP header (16 bytes)
    const gIdx = rawView.getUint32(0, true);
    const startFrame = rawView.getUint32(4, true);
    const numFrames = rawView.getUint32(8, true);
    
    const xyzBytesBase = N * 3 * 2;
    const xyzBytesInt8 = N * 3;
    const dcBytes = N * 3;
    const opBytes = N;
    
    // Allocate single compact buffer for all frames
    const gopData = new Uint8Array(numFrames * N * STRIDE);
    
    let prevOffset = -1; // offset of previous frame in gopData
    let pos = 16; // after GOP header
    
    for (let fi = 0; fi < numFrames; fi++) {
      const globalFrameIdx = startFrame + fi;
      const isBaseFrame = globalFrameIdx === 0;
      const isRefresh = !isBaseFrame && (globalFrameIdx % manifest.gop_size === 0);
      
      const frameOffset = fi * N * STRIDE;
      
      if (isBaseFrame) {
        // Base frame: float16 xyz + uint8 dc/op
        const fXyz16 = new Uint16Array(raw, pos, N * 3);
        const fXyzDelta = float16ToFloat32(fXyz16);
        pos += xyzBytesBase;
        
        const fDcU8 = new Uint8Array(raw, pos, N * 3);
        pos += dcBytes;
        const fOpU8 = new Uint8Array(raw, pos, N);
        pos += opBytes;
        
        for (let i = 0; i < N; i++) {
          const bOff = frameOffset + i * STRIDE;
          for (let c = 0; c < 3; c++) {
            const scale = 255.0 / (qXyzDMax[c] - qXyzDMin[c] + 1e-10);
            let q = Math.round((fXyzDelta[i * 3 + c] - qXyzDMin[c]) * scale);
            gopData[bOff + c] = q < 0 ? 0 : (q > 255 ? 255 : q);
          }
          gopData[bOff + 3] = fDcU8[i * 3];
          gopData[bOff + 4] = fDcU8[i * 3 + 1];
          gopData[bOff + 5] = fDcU8[i * 3 + 2];
          gopData[bOff + 6] = fOpU8[i];
        }
      } else {
        // int8 diff frame
        const fXyzI8 = new Int8Array(raw, pos, N * 3);
        pos += xyzBytesInt8;
        const fDcI8 = new Int8Array(raw, pos, N * 3);
        pos += dcBytes;
        const fOpI8 = new Int8Array(raw, pos, N);
        pos += opBytes;
        
        // Reference: refresh → baseData, inter → previous frame
        const refData = isRefresh ? baseData : gopData;
        const refOffset = isRefresh ? 0 : prevOffset;
        
        for (let i = 0; i < N; i++) {
          const bOff = frameOffset + i * STRIDE;
          const rOff = refOffset + i * STRIDE;
          // xyz
          for (let c = 0; c < 3; c++) {
            let q = refData[rOff + c] + fXyzI8[i * 3 + c];
            gopData[bOff + c] = q < 0 ? 0 : (q > 255 ? 255 : q);
          }
          // dc
          for (let c = 0; c < 3; c++) {
            let q = refData[rOff + 3 + c] + fDcI8[i * 3 + c];
            gopData[bOff + 3 + c] = q < 0 ? 0 : (q > 255 ? 255 : q);
          }
          // op
          let q = refData[rOff + 6] + fOpI8[i];
          gopData[bOff + 6] = q < 0 ? 0 : (q > 255 ? 255 : q);
        }
      }
      
      prevOffset = frameOffset;
    }
    
    gopCache.set(gopIdx, {
      data: gopData,
      numFrames,
      startFrame: gopInfo.start_frame,
      endFrame: gopInfo.end_frame,
      lastAccess: performance.now(),
    });
    
    gopLoadingSet.delete(gopIdx);
    self.postMessage({ type: 'gopState', gopIdx, state: 'loaded' });
    reportStats();
    
  } catch (err) {
    gopLoadingSet.delete(gopIdx);
    self.postMessage({ type: 'gopState', gopIdx, state: 'error', error: err.message });
  }
}

function evictDistantGops(currentGopIdx) {
  const minKeep = Math.max(0, currentGopIdx - WINDOW_GOPS);
  const maxKeep = Math.min(manifest.gop_count - 1, currentGopIdx + WINDOW_GOPS);
  
  for (const [idx, gop] of gopCache) {
    if (idx < minKeep || idx > maxKeep) {
      gopCache.delete(idx);
      self.postMessage({ type: 'gopState', gopIdx: idx, state: 'evicted' });
    }
  }
  reportStats();
}

function reportStats() {
  const loaded = gopCache.size;
  const total = manifest ? manifest.gop_count : 0;
  const frameMemMB = loaded * (manifest?.gop_size || 30) * N * STRIDE / 1024 / 1024;
  self.postMessage({
    type: 'stats',
    cached: loaded,
    total,
    memMB: frameMemMB.toFixed(1),
    windowGops: WINDOW_GOPS,
  });
}

// ============================================================
// Frame request handling
// ============================================================
function getGopIndexForFrame(globalFrame) {
  if (globalFrame === 0) return -1;
  const pFrameIdx = globalFrame - 1;
  return Math.floor(pFrameIdx / manifest.gop_size);
}

async function handleFrameRequest(globalFrame, deltaK) {
  if (globalFrame === 0) {
    // I-frame — no delta data needed
    self.postMessage({ type: 'frameData', globalFrame, data: null });
    return;
  }
  
  const gopIdx = getGopIndexForFrame(globalFrame);
  
  // Ensure current GOP is loaded
  if (!gopCache.has(gopIdx) && !gopLoadingSet.has(gopIdx)) {
    await loadGop(gopIdx);
  }
  
  // Prefetch next GOPs
  for (let d = 1; d <= PREFETCH_GOPS; d++) {
    const nextGop = gopIdx + d;
    if (nextGop < manifest.gop_count && !gopCache.has(nextGop) && !gopLoadingSet.has(nextGop)) {
      loadGop(nextGop); // fire-and-forget
    }
  }
  
  // Evict distant GOPs
  evictDistantGops(gopIdx);
  
  // Get frame data
  const gop = gopCache.get(gopIdx);
  if (!gop) {
    // Still loading...
    self.postMessage({ type: 'frameData', globalFrame, data: null, loading: true, gopIdx });
    return;
  }
  
  const pFrameIdx = globalFrame - 1;
  const localIdx = pFrameIdx - gop.startFrame;
  if (localIdx < 0 || localIdx >= gop.numFrames) {
    self.postMessage({ type: 'frameData', globalFrame, data: null });
    return;
  }
  
  gop.lastAccess = performance.now();
  
  // Extract frame slice and pack to half-float texture
  const frameSlice = getFrameSlice(gop.data, localIdx, N);
  const texData = packFrameToHalfFloat(frameSlice, N, deltaK);
  
  // Transfer the texture data (zero-copy transfer)
  self.postMessage(
    { type: 'frameData', globalFrame, data: texData.buffer, gopIdx },
    [texData.buffer]
  );
}

// ============================================================
// Message handler
// ============================================================
self.onmessage = async function(e) {
  const msg = e.data;
  
  switch (msg.type) {
    case 'init':
      manifest = msg.manifest;
      manifest._baseUrl = msg.baseUrl;
      N = manifest.dynamic_gaussians;
      WINDOW_GOPS = msg.windowGops || 3;
      PREFETCH_GOPS = msg.prefetchGops || 1;
      
      await loadGopMeta(msg.metaUrl);
      
      // Preload first GOPs
      await loadGop(0);
      loadGop(1); // fire-and-forget
      
      self.postMessage({ type: 'ready' });
      break;
    
    case 'requestFrame':
      await handleFrameRequest(msg.globalFrame, msg.deltaK || 256);
      break;
    
    case 'prefetch':
      if (msg.gopIndex !== undefined) {
        loadGop(msg.gopIndex);
      }
      break;
    
    case 'setWindow':
      WINDOW_GOPS = msg.windowSize || 3;
      PREFETCH_GOPS = msg.prefetchGops || 1;
      break;
  }
};
