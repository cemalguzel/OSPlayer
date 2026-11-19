/**
 * make-ico.mjs
 * JPEG/PNG kaynak → 256x256 PNG → ICO (Vista format: embedded PNG)
 * Kullanım: node scripts/make-ico.mjs
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const src = path.join(root, 'logo.png');

// 1. Kaynağı 256x256 PNG'ye dönüştür (orijinal oranları koruyarak şeffaf arkaplanla)
const pngBuf = await sharp(src)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

console.log('PNG üretildi:', pngBuf.length, 'byte');

// 2. Vista ICO formatında wrap et (ICO header + PNG data)
// ICO Header: 6 byte
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);   // Reserved = 0
icoHeader.writeUInt16LE(1, 2);   // Type = 1 (ICO)
icoHeader.writeUInt16LE(1, 4);   // Count = 1 image

// Directory Entry: 16 byte
const dirEntry = Buffer.alloc(16);
dirEntry.writeUInt8(0, 0);       // Width:  0 = 256
dirEntry.writeUInt8(0, 1);       // Height: 0 = 256
dirEntry.writeUInt8(0, 2);       // Color count = 0
dirEntry.writeUInt8(0, 3);       // Reserved
dirEntry.writeUInt16LE(1, 4);    // Planes = 1
dirEntry.writeUInt16LE(32, 6);   // Bit count = 32
dirEntry.writeUInt32LE(pngBuf.length, 8);        // Image data size
dirEntry.writeUInt32LE(6 + 16, 12);              // Offset = header + 1 dir entry

// ICO dosyasını birleştir
const icoBuf = Buffer.concat([icoHeader, dirEntry, pngBuf]);

// 3. Kaydet
const outPaths = [
    path.join(root, 'favicon.ico'),
    path.join(root, 'buildResources', 'icon.ico'),
];

for (const p of outPaths) {
    writeFileSync(p, icoBuf);
    console.log('Kaydedildi:', p, '—', icoBuf.length, 'byte');
}

// 4. Ayrıca PNG'yi de kaydet (Linux builder için)
writeFileSync(path.join(root, 'buildResources', 'icon.png'), pngBuf);
console.log('PNG kaydedildi: buildResources/icon.png');
console.log('TAMAMLANDI ✓');
