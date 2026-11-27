// Mevcut OS Player logosundan macOS ICNS simgesini üretir.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
async function main() {
  const root = path.resolve(__dirname, '..');
  const chunks = [];
  for (const [type, size] of [['icp4',16], ['icp5',32], ['icp6',64], ['ic07',128], ['ic08',256], ['ic09',512]]) {
    const png = await sharp(path.join(root, 'logo.png')).resize(size, size).png().toBuffer();
    const header = Buffer.alloc(8);
    header.write(type, 0, 'ascii');
    header.writeUInt32BE(png.length + 8, 4);
    chunks.push(header, png);
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  fs.writeFileSync(path.join(root, 'buildResources/icon.icns'), Buffer.concat([header, body]));
  console.log('OS Player macOS simgesi oluşturuldu.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
