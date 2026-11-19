/**
 * encrypt.js — Build sonrası main.js'i RC4 ile şifreler.
 * Kullanım: node scripts/encrypt.js
 */

const fs = require('fs');
const path = require('path');

// !! C++ loader.cpp içindeki anahtar ile AYNI OLMALI !!
const KEY = 'OSPlayer_Secure_Key_2026_X!';

function rc4Crypt(data, key) {
    const s = Array.from({ length: 256 }, (_, i) => i);
    const keyBytes = Buffer.from(key, 'utf8');
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + s[i] + keyBytes[i % keyBytes.length]) % 256;
        [s[i], s[j]] = [s[j], s[i]];
    }
    let i = 0;
    j = 0;
    const output = Buffer.alloc(data.length);
    for (let k = 0; k < data.length; k++) {
        i = (i + 1) % 256;
        j = (j + s[i]) % 256;
        [s[i], s[j]] = [s[j], s[i]];
        output[k] = data[k] ^ s[(s[i] + s[j]) % 256];
    }
    return output;
}

const distDir   = path.join(__dirname, '..', 'dist-electron');
const inputFile = path.join(distDir, 'main.js');
const outputFile = path.join(distDir, 'main.enc');

if (!fs.existsSync(inputFile)) {
    console.error(`[encrypt] HATA: ${inputFile} bulunamadı. Önce 'npm run build:electron' çalıştırın.`);
    process.exit(1);
}

const plaintext  = fs.readFileSync(inputFile);
const encrypted  = rc4Crypt(plaintext, KEY);
fs.writeFileSync(outputFile, encrypted);
console.log(`[encrypt] Şifrelendi → ${outputFile}  (${encrypted.length} byte)`);

// Orijinal main.js'i temizle (dağıtımda açık kaynak kalmasın)
fs.unlinkSync(inputFile);
console.log(`[encrypt] Orijinal main.js silindi.`);
