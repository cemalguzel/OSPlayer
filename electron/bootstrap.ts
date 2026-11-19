import path from 'path';
import fs from 'fs';

// Geliştirme ortamı (ASAR dışı) ve paketlenmiş ortam (ASAR içi) için yol belirleme
let addonPath;
if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'crypto_loader.node'))) {
    addonPath = path.join(process.resourcesPath, 'crypto_loader.node');
} else {
    addonPath = path.join(__dirname, '..', 'crypto-addon', 'build', 'Release', 'crypto_loader.node');
}

// main.enc yolunu bul
let encPath;
if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'main.enc'))) {
    encPath = path.join(process.resourcesPath, 'main.enc');
} else {
    encPath = path.join(__dirname, 'main.enc');
}

// require kullanarak addon'u yükle
const addon = require(addonPath);
addon.loadEncryptedFile(encPath, require, module, __filename, __dirname);
