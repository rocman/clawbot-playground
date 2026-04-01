#!/usr/bin/env node
// 生成简单的 PNG 图标（用 canvas 或者直接硬编码一个极小的 PNG）

const fs = require('fs');
const path = require('path');

// 用纯 Node.js 生成一个简单的 PNG 图标
// 这是一个手工编码的最小 PNG（纯色方块 + emoji 风格）

function createSimplePNG(size) {
  // 用 Buffer 手工写一个最小 PNG
  // 使用 zlib 压缩
  const zlib = require('zlib');
  
  // 图标颜色：紫色背景 + 白色 C 字样（简单）
  // 用最简单的方式：生成纯色 PNG
  
  const width = size;
  const height = size;
  
  // PNG 签名
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  function ihdr(w, h) {
    const data = Buffer.alloc(13);
    data.writeUInt32BE(w, 0);
    data.writeUInt32BE(h, 4);
    data[8] = 8;  // bit depth
    data[9] = 2;  // color type: RGB
    data[10] = 0; // compression
    data[11] = 0; // filter
    data[12] = 0; // interlace
    return chunk('IHDR', data);
  }
  
  // IDAT chunk
  function idat(w, h) {
    // 构建原始像素数据
    const rows = [];
    for (let y = 0; y < h; y++) {
      const row = Buffer.alloc(1 + w * 3);
      row[0] = 0; // filter type: None
      for (let x = 0; x < w; x++) {
        // 圆角紫色背景
        const cx = x - w/2, cy = y - h/2;
        const r = Math.sqrt(cx*cx + cy*cy);
        const cornerRadius = w * 0.25;
        
        // 检查是否在圆角矩形内
        const inCornerX = Math.abs(cx) > w/2 - cornerRadius;
        const inCornerY = Math.abs(cy) > h/2 - cornerRadius;
        const inCorner = inCornerX && inCornerY;
        const cornerDist = Math.sqrt(
          Math.pow(Math.abs(cx) - (w/2 - cornerRadius), 2) +
          Math.pow(Math.abs(cy) - (h/2 - cornerRadius), 2)
        );
        
        let R, G, B;
        if (inCorner && cornerDist > cornerRadius) {
          // 圆角外，透明（用白色代替）
          R = 255; G = 255; B = 255;
        } else {
          // 渐变紫色
          const t = y / h;
          R = Math.round(99 + (139 - 99) * t);   // 99->139
          G = Math.round(102 + (92 - 102) * t);  // 102->92
          B = Math.round(241 + (246 - 241) * t); // 241->246
          
          // 画一个简单的 🍪 符号（就用字母 C 代替）
          // 在中心区域绘制白色圆形
          if (r < w * 0.28) {
            R = 255; G = 255; B = 255;
          }
          if (r < w * 0.18) {
            // 内圆保持背景色
            R = Math.round(99 + (139 - 99) * t);
            G = Math.round(102 + (92 - 102) * t);
            B = Math.round(241 + (246 - 241) * t);
          }
        }
        
        row[1 + x * 3] = R;
        row[1 + x * 3 + 1] = G;
        row[1 + x * 3 + 2] = B;
      }
      rows.push(row);
    }
    
    const rawData = Buffer.concat(rows);
    const compressed = zlib.deflateSync(rawData);
    return chunk('IDAT', compressed);
  }
  
  // IEND chunk
  function iend() {
    return chunk('IEND', Buffer.alloc(0));
  }
  
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);
    const crcValue = crc32(crcData);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crcValue >>> 0, 0);
    return Buffer.concat([len, typeBuffer, data, crcBuffer]);
  }
  
  // CRC32
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[i] = c;
    }
    return t;
  })();
  
  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF);
  }
  
  return Buffer.concat([sig, ihdr(width, height), idat(width, height), iend()]);
}

const iconsDir = path.join(__dirname, 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

[16, 48, 128].forEach(size => {
  const png = createSimplePNG(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`生成 icon${size}.png (${png.length} bytes)`);
});

console.log('图标生成完毕');
