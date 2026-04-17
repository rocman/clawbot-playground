#!/usr/bin/env node
/**
 * V4c Pre-processor: Generate GPU-ready texture data from GOP bins
 * 
 * Reads: data_v3d/gop_meta.bin.gz, data_v3d/gop_*.bin.gz
 * Writes: data_v4c/texframes_NNN.bin.gz (each = 30 frames of pre-baked RGBA16F texture rows)
 *         data_v4c/manifest_v4c.json
 *
 * Each output file contains consecutive frames' texture data that can be
 * directly uploaded to GPU via texSubImage2D with zero CPU decode.
 *
 * Usage: node generate_v4c_texdata.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ============================================================
// Config — must match viewer
// ============================================================
const DELTA_K = 256;
const STRIDE = 7;
const DATA_DIR = path.join(__dirname, 'data_v3d');
const OUT_DIR = path.join(__dirname, 'data_v4c');

// ============================================================
// Utility: float32 → float16 (matches viewer's float32ToFloat16)
// ============================================================
const _f32Buf = new Float32Array(1);
const _i32Buf = new Int32Array(_f32Buf.buffer);

function float32ToFloat16(val) {
  _f32Buf[0] = val;
  const f = _i32Buf[0];
  const sign = (f >> 31) & 0x1;
  let exp = ((f >> 23) & 0xff) - 127 + 15;
  let mant = (f >> 13) & 0x3ff;
  if (exp <= 0) {
    if (exp < -10) return sign << 15;
    mant = (mant | 0x400) >> (1 - exp);
    return (sign << 15) | mant;
  }
  if (exp >= 31) return (sign << 15) | (31 << 10) | (mant ? 1 : 0);
  return (sign << 15) | (exp << 10) | mant;
}

function float16ToFloat32(h) {
  const sign = (h >> 15) & 0x1;
  const exp = (h >> 10) & 0x1f;
  const mant = h & 0x3ff;
  if (exp === 0) {
    return mant === 0 ? (sign ? -0 : 0) : (sign ? -1 : 1) * Math.pow(2, -14) * (mant / 1024);
  } else if (exp === 31) {
    return mant === 0 ? (sign ? -Infinity : Infinity) : NaN;
  }
  return (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + mant / 1024);
}

function float16ArrayToFloat32(u16arr) {
  const f32 = new Float32Array(u16arr.length);
  for (let i = 0; i < u16arr.length; i++) {
    f32[i] = float16ToFloat32(u16arr[i]);
  }
  return f32;
}

// ============================================================
// Load and decompress
// ============================================================
function loadGzFile(filepath) {
  const compressed = fs.readFileSync(filepath);
  return zlib.gunzipSync(compressed);
}

// ============================================================
// Main
// ============================================================
function main() {
  console.log('=== V4c Pre-processor: Generating GPU-ready texture data ===\n');

  // 1. Load manifest
  const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf-8'));
  const N = manifest.dynamic_gaussians;
  const gopCount = manifest.gop_count;
  const gopSize = manifest.gop_size;
  const totalFrames = manifest.p_frame_count; // 299 P-frames + I-frame = 300

  console.log(`N = ${N} dynamic gaussians`);
  console.log(`GOP count = ${gopCount}, GOP size = ${gopSize}`);
  console.log(`Total frames = ${totalFrames + 1} (1 I-frame + ${totalFrames} P-frames)`);

  // 2. Load GOP meta → quantization params + base frame
  console.log('\nLoading GOP meta...');
  const metaRaw = loadGzFile(path.join(DATA_DIR, manifest.gop_meta));
  const metaView = new DataView(metaRaw.buffer, metaRaw.byteOffset, metaRaw.byteLength);

  let pos = 28; // skip header

  // Quant params (56 bytes)
  const qDcMin = [metaView.getFloat32(pos, true), metaView.getFloat32(pos+4, true), metaView.getFloat32(pos+8, true)];
  const qDcMax = [metaView.getFloat32(pos+12, true), metaView.getFloat32(pos+16, true), metaView.getFloat32(pos+20, true)];
  const qOpMin = metaView.getFloat32(pos+24, true);
  const qOpMax = metaView.getFloat32(pos+28, true);
  const qXyzDMin = [metaView.getFloat32(pos+32, true), metaView.getFloat32(pos+36, true), metaView.getFloat32(pos+40, true)];
  const qXyzDMax = [metaView.getFloat32(pos+44, true), metaView.getFloat32(pos+48, true), metaView.getFloat32(pos+52, true)];
  pos += 56;

  const qXyzDScale = [
    (qXyzDMax[0] - qXyzDMin[0]) / 255.0,
    (qXyzDMax[1] - qXyzDMin[1]) / 255.0,
    (qXyzDMax[2] - qXyzDMin[2]) / 255.0,
  ];

  console.log('  qXyzDMin:', qXyzDMin);
  console.log('  qXyzDMax:', qXyzDMax);
  console.log('  qDcMin:', qDcMin);
  console.log('  qDcMax:', qDcMax);
  console.log(`  qOpMin: ${qOpMin}, qOpMax: ${qOpMax}`);

  // Skip SPZ baseline
  const spzSize = metaView.getUint32(pos, true);
  pos += 4 + spzSize;

  // Parse base frame from meta
  const xyzBytesBase = N * 3 * 2;
  const dcBytes = N * 3;
  const baseXyz16 = new Uint16Array(metaRaw.buffer, metaRaw.byteOffset + pos, N * 3);
  const baseXyzDelta = float16ArrayToFloat32(baseXyz16);
  pos += xyzBytesBase;
  const baseDcRaw = new Uint8Array(metaRaw.buffer, metaRaw.byteOffset + pos, N * 3);
  pos += dcBytes;
  const baseOpRaw = new Uint8Array(metaRaw.buffer, metaRaw.byteOffset + pos, N);

  // Build base frame (same logic as viewer)
  const baseData = new Uint8Array(N * STRIDE);
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
  console.log('  Base frame parsed');

  // 3. Texture geometry
  const texW = DELTA_K * 2; // 512
  const rowsPerFrame = Math.ceil(N / DELTA_K); // 501
  console.log(`\nTexture layout: ${texW} × ${rowsPerFrame} per frame (${(texW * rowsPerFrame * 4 * 2 / 1024 / 1024).toFixed(2)} MB/frame)`);

  // Create output directory
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // 4. Process each GOP
  const prevFrame = new Uint8Array(N * STRIDE);
  const outFrame = new Uint8Array(N * STRIDE);
  let globalFrameCounter = 0;

  // Pre-compute dequant scales
  const dcScale = [
    (qDcMax[0] - qDcMin[0]) / 255.0,
    (qDcMax[1] - qDcMin[1]) / 255.0,
    (qDcMax[2] - qDcMin[2]) / 255.0,
  ];
  const opScale = (qOpMax - qOpMin) / 255.0;

  const v4cManifest = {
    version: 'v4c',
    base_version: manifest.version,
    total_gaussians: manifest.total_gaussians,
    dynamic_gaussians: N,
    total_frames: totalFrames + 1,
    p_frame_count: totalFrames,
    target_fps: manifest.target_fps,
    delta_k: DELTA_K,
    tex_width: texW,
    rows_per_frame: rowsPerFrame,
    bytes_per_frame: texW * rowsPerFrame * 4 * 2, // RGBA16F = 8 bytes/texel
    i_frame: manifest.i_frame,
    dynamic_mask: manifest.dynamic_mask,
    gop_meta: manifest.gop_meta,
    quantization: manifest.quantization,
    // Will be filled with texframe file entries
    texframe_files: [],
  };

  // Frame 0 (I-frame) → no delta, just zeros — shader skips it
  // But we should still pack baseData as frame 0's texture for consistency
  console.log('\n--- Processing I-Frame (frame 0) ---');
  const iframeTex = packFrameToHalfFloat(baseData, texW, rowsPerFrame, N, qXyzDScale, qXyzDMin, dcScale, qDcMin, opScale, qOpMin);
  
  // Collect all frame textures for batching
  let allFrameTextures = [iframeTex]; // frame 0

  // Track current state for sequential decoding
  prevFrame.fill(0);

  for (let gopIdx = 0; gopIdx < gopCount; gopIdx++) {
    const gopInfo = manifest.gop_index[gopIdx];
    const filename = gopInfo.filename;
    console.log(`\n--- Processing GOP ${gopIdx}: ${filename} (frames ${gopInfo.start_frame}-${gopInfo.end_frame - 1}) ---`);

    const gopRaw = loadGzFile(path.join(DATA_DIR, filename));
    const gopView = new DataView(gopRaw.buffer, gopRaw.byteOffset, gopRaw.byteLength);
    const gopU8 = new Uint8Array(gopRaw.buffer, gopRaw.byteOffset, gopRaw.byteLength);

    const numFrames = gopView.getUint32(8, true);
    console.log(`  numFrames: ${numFrames}`);

    let gPos = 16; // skip GOP header

    for (let fi = 0; fi < numFrames; fi++) {
      const globalFrameIdx = gopInfo.start_frame + fi;
      const isBaseFrame = globalFrameIdx === 0;
      const isRefresh = !isBaseFrame && (globalFrameIdx % gopSize === 0);

      if (isBaseFrame) {
        // Base frame: float16 xyz + uint8 dc + uint8 op
        const fXyz16 = new Uint16Array(gopRaw.buffer, gopRaw.byteOffset + gPos, N * 3);
        const fXyzDelta = float16ArrayToFloat32(fXyz16);
        gPos += N * 3 * 2;
        const dcOff = gPos;
        gPos += N * 3;
        const opOff = gPos;
        gPos += N;

        for (let i = 0; i < N; i++) {
          const bOff = i * STRIDE;
          for (let c = 0; c < 3; c++) {
            const scale = 255.0 / (qXyzDMax[c] - qXyzDMin[c] + 1e-10);
            let q = Math.round((fXyzDelta[i * 3 + c] - qXyzDMin[c]) * scale);
            outFrame[bOff + c] = q < 0 ? 0 : (q > 255 ? 255 : q);
          }
          const i3 = i * 3;
          outFrame[bOff + 3] = gopU8[dcOff + i3];
          outFrame[bOff + 4] = gopU8[dcOff + i3 + 1];
          outFrame[bOff + 5] = gopU8[dcOff + i3 + 2];
          outFrame[bOff + 6] = gopU8[opOff + i];
        }
      } else {
        // P-frame: int8 delta decode
        const xyzOff = gPos;
        gPos += N * 3;
        const dcOff = gPos;
        gPos += N * 3;
        const opOff = gPos;
        gPos += N;

        const ref = isRefresh ? baseData : prevFrame;

        for (let i = 0; i < N; i++) {
          const bOff = i * STRIDE;
          const i3 = i * 3;
          for (let c = 0; c < 3; c++) {
            let v = gopU8[xyzOff + i3 + c];
            if (v > 127) v -= 256;
            let q = ref[bOff + c] + v;
            outFrame[bOff + c] = q < 0 ? 0 : (q > 255 ? 255 : q);
          }
          for (let c = 0; c < 3; c++) {
            let v = gopU8[dcOff + i3 + c];
            if (v > 127) v -= 256;
            let q = ref[bOff + 3 + c] + v;
            outFrame[bOff + 3 + c] = q < 0 ? 0 : (q > 255 ? 255 : q);
          }
          let v = gopU8[opOff + i];
          if (v > 127) v -= 256;
          let q = ref[bOff + 6] + v;
          outFrame[bOff + 6] = q < 0 ? 0 : (q > 255 ? 255 : q);
        }
      }

      // Copy outFrame → prevFrame
      prevFrame.set(outFrame);

      // Pack to HalfFloat texture
      const texData = packFrameToHalfFloat(outFrame, texW, rowsPerFrame, N, qXyzDScale, qXyzDMin, dcScale, qDcMin, opScale, qOpMin);
      allFrameTextures.push(texData);

      if ((fi + 1) % 10 === 0 || fi === numFrames - 1) {
        process.stdout.write(`  Processed frame ${fi + 1}/${numFrames} (global: ${globalFrameIdx})\r`);
      }
    }
    console.log('');
  }

  console.log(`\nTotal frames processed: ${allFrameTextures.length}`);

  // 5. Write output: group frames into chunks (same GOP boundaries as original)
  const FRAMES_PER_CHUNK = 15; // 15 frames per output file (half GOP → ~29 MB/chunk → 2 active ≈ 58 MB < 80 MB target)
  const bytesPerFrame = texW * rowsPerFrame * 4 * 2;
  let totalGzBytes = 0;

  for (let chunkIdx = 0; chunkIdx * FRAMES_PER_CHUNK < allFrameTextures.length; chunkIdx++) {
    const startFrame = chunkIdx * FRAMES_PER_CHUNK;
    const endFrame = Math.min(startFrame + FRAMES_PER_CHUNK, allFrameTextures.length);
    const numFramesInChunk = endFrame - startFrame;

    // Concatenate frame textures into one buffer
    const chunkBuf = Buffer.alloc(numFramesInChunk * bytesPerFrame);
    for (let fi = 0; fi < numFramesInChunk; fi++) {
      const texData = allFrameTextures[startFrame + fi];
      const u8view = new Uint8Array(texData.buffer, texData.byteOffset, texData.byteLength);
      chunkBuf.set(u8view, fi * bytesPerFrame);
    }

    // Gzip compress
    const compressed = zlib.gzipSync(chunkBuf, { level: 9 });
    const outFilename = `texframes_${String(chunkIdx).padStart(3, '0')}.bin.gz`;
    fs.writeFileSync(path.join(OUT_DIR, outFilename), compressed);

    const rawMB = (chunkBuf.byteLength / 1024 / 1024).toFixed(2);
    const gzMB = (compressed.byteLength / 1024 / 1024).toFixed(2);
    const ratio = (chunkBuf.byteLength / compressed.byteLength).toFixed(1);
    totalGzBytes += compressed.byteLength;

    console.log(`  ${outFilename}: ${numFramesInChunk} frames, raw ${rawMB} MB → gz ${gzMB} MB (${ratio}x)`);

    v4cManifest.texframe_files.push({
      index: chunkIdx,
      filename: outFilename,
      start_frame: startFrame,
      end_frame: endFrame,
      num_frames: numFramesInChunk,
      raw_bytes: chunkBuf.byteLength,
      gz_bytes: compressed.byteLength,
    });
  }

  // 6. Write V4c manifest
  v4cManifest.total_gz_bytes = totalGzBytes;
  v4cManifest.total_raw_bytes = allFrameTextures.length * bytesPerFrame;
  v4cManifest.compression_ratio = (v4cManifest.total_raw_bytes / totalGzBytes).toFixed(1);

  fs.writeFileSync(path.join(OUT_DIR, 'manifest_v4c.json'), JSON.stringify(v4cManifest, null, 2));

  console.log('\n=== Summary ===');
  console.log(`Total frames: ${allFrameTextures.length}`);
  console.log(`Chunks: ${v4cManifest.texframe_files.length}`);
  console.log(`Total raw: ${(v4cManifest.total_raw_bytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Total gz: ${(totalGzBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Compression ratio: ${v4cManifest.compression_ratio}x`);
  console.log(`Output directory: ${OUT_DIR}`);
  console.log('\nDone!');
}

// ============================================================
// Pack frame → HalfFloat texture data (identical to viewer)
// ============================================================
function packFrameToHalfFloat(frame, texW, rowsPerFrame, N, qXyzDScale, qXyzDMin, dcScale, qDcMin, opScale, qOpMin) {
  const texData = new Uint16Array(texW * rowsPerFrame * 4);
  texData.fill(0);

  let row = 0, col = 0;
  for (let i = 0; i < N; i++) {
    const bOff = i * STRIDE;

    const dx = frame[bOff + 0] * qXyzDScale[0] + qXyzDMin[0];
    const dy = frame[bOff + 1] * qXyzDScale[1] + qXyzDMin[1];
    const dz = frame[bOff + 2] * qXyzDScale[2] + qXyzDMin[2];
    const dc0 = frame[bOff + 3] * dcScale[0] + qDcMin[0];
    const dc1 = frame[bOff + 4] * dcScale[1] + qDcMin[1];
    const dc2 = frame[bOff + 5] * dcScale[2] + qDcMin[2];
    const op = frame[bOff + 6] * opScale + qOpMin;

    const sc = col * 2;
    let off = (row * texW + sc) * 4;
    texData[off + 0] = float32ToFloat16(dx);
    texData[off + 1] = float32ToFloat16(dy);
    texData[off + 2] = float32ToFloat16(dz);
    texData[off + 3] = float32ToFloat16(dc0);

    off = (row * texW + sc + 1) * 4;
    texData[off + 0] = float32ToFloat16(dc1);
    texData[off + 1] = float32ToFloat16(dc2);
    texData[off + 2] = float32ToFloat16(op);
    texData[off + 3] = 0;

    col++;
    if (col >= DELTA_K) { col = 0; row++; }
  }
  return texData;
}

main();
