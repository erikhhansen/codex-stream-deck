import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function insideRoundedRect(x, y, size, inset, radius) {
  const left = inset;
  const right = size - inset - 1;
  const top = inset;
  const bottom = size - inset - 1;
  if (x >= left + radius && x <= right - radius) return y >= top && y <= bottom;
  if (y >= top + radius && y <= bottom - radius) return x >= left && x <= right;
  const cx = x < left + radius ? left + radius : right - radius;
  const cy = y < top + radius ? top + radius : bottom - radius;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function png(size) {
  const scale = size / 144;
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  const set = (x, y, [r, g, b, a = 255]) => {
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    pixels[offset] = r; pixels[offset + 1] = g; pixels[offset + 2] = b; pixels[offset + 3] = a;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let color = [17, 24, 39, 255];
      if (insideRoundedRect(x, y, size, 20 * scale, 24 * scale)) color = [139, 183, 255, 255];
      const eyeY = 68 * scale;
      if ((x - 52 * scale) ** 2 + (y - eyeY) ** 2 <= (10 * scale) ** 2) color = [17, 24, 39, 255];
      if ((x - 92 * scale) ** 2 + (y - eyeY) ** 2 <= (10 * scale) ** 2) color = [17, 24, 39, 255];
      const smileY = 91 * scale + Math.abs(x - 72 * scale) * 0.22;
      if (x >= 48 * scale && x <= 96 * scale && Math.abs(y - smileY) <= 3.5 * scale) color = [17, 24, 39, 255];
      set(x, y, color);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const output = path.resolve("com.codexstreamdeck.agentkeys.sdPlugin/imgs");
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "plugin.png"), png(144));
await writeFile(path.join(output, "plugin@2x.png"), png(288));
