/**
 * build-protected.js
 * ==================
 * Tek komut ile korumalı EXE üretir:
 *   1. TypeScript (renderer + electron main) derlenir
 *   2. main.js  →  javascript-obfuscator  →  main.obf.js
 *   3. main.obf.js  →  bytenode (Electron V8)  →  main.jsc
 *   4. Ham .js dosyaları silinir
 *   5. electron-builder --win çağrılır
 *
 * Kullanım:  node scripts/build-protected.js
 *            npm run dist:win
 */

'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const bytenode = require('bytenode');

const root     = path.join(__dirname, '..');
const distElec = path.join(root, 'dist-electron');
const mainJs   = path.join(distElec, 'main.js');
const mainObf  = path.join(distElec, 'main.obf.js');
const mainJsc  = path.join(distElec, 'main.jsc');

// ─── Yardımcılar ────────────────────────────────────────────────────────────
function log(msg)     { console.log(`\n[build] ${msg}`); }
function step(n, msg) { console.log(`\n\x1b[36m── Step ${n}: ${msg}\x1b[0m`); }
function ok(msg)      { console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`); }
function fail(msg)    { console.error(`\x1b[31m  ✗ ${msg}\x1b[0m`); process.exit(1); }

function run(cmd, cwd) {
    try {
        execSync(cmd, { cwd: cwd || root, stdio: 'inherit' });
    } catch {
        fail(`Komut başarısız: ${cmd}`);
    }
}

// ─── Ana Pipeline ────────────────────────────────────────────────────────────
async function main() {

    // STEP 1 — TypeScript + Vite build
    step(1, 'TypeScript & Vite derleniyor...');
    run('npm run build');
    ok('Renderer (dist/) ve Electron main (dist-electron/) derlendi.');

    if (!fs.existsSync(mainJs)) {
        fail(`${mainJs} bulunamadı — build başarısız olmuş olabilir.`);
    }

    // STEP 2 — javascript-obfuscator
    step(2, 'javascript-obfuscator çalıştırılıyor...');
    const sourceCode = fs.readFileSync(mainJs, 'utf8');

    const obfResult = JavaScriptObfuscator.obfuscate(sourceCode, {
        compact: true,
        controlFlowFlattening: false,   // bytenode öncesi CF flattening bozabilir
        deadCodeInjection: false,
        debugProtection: false,
        disableConsoleOutput: false,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,           // Electron global'larını bozmamak için
        selfDefending: false,           // bytenode ile uyumsuz
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.75,
        transformObjectKeys: true,
        unicodeEscapeSequence: false
    });

    fs.writeFileSync(mainObf, obfResult.getObfuscatedCode(), 'utf8');
    ok(`Obfuscate edildi → ${path.relative(root, mainObf)}`);

    // STEP 3 — bytenode .jsc (Electron V8 ile derlenir)
    step(3, 'Bytenode V8 bytecode üretiliyor (Electron V8)...');
    await bytenode.compileFile({
        filename: mainObf,
        output:   mainJsc,
        electron: true   // Electron'un kendi V8'ini kullanır
    });

    if (!fs.existsSync(mainJsc)) fail('main.jsc üretilemedi!');
    const jscMB = (fs.statSync(mainJsc).size / 1024 / 1024).toFixed(2);
    ok(`Bytecode üretildi → ${path.relative(root, mainJsc)}  (${jscMB} MB)`);

    // STEP 4 — Temizlik
    step(4, 'Ham JS dosyaları siliniyor...');
    if (fs.existsSync(mainJs))  { fs.unlinkSync(mainJs);  ok('main.js silindi'); }
    if (fs.existsSync(mainObf)) { fs.unlinkSync(mainObf); ok('main.obf.js silindi'); }

    // STEP 5 — electron-builder
    step(5, 'electron-builder ile EXE oluşturuluyor...');
    const isLinux = process.argv.includes('--linux');
    const builderEnv = { ...process.env };
    // Kod imzalama sertifikası yok — ilgili env değişkenlerini tamamen kaldır
    delete builderEnv.WIN_CSC_LINK;
    delete builderEnv.WIN_CSC_KEY_PASSWORD;
    delete builderEnv.CSC_LINK;
    delete builderEnv.CSC_KEY_PASSWORD;
    builderEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
    try {
        execSync(`npx electron-builder ${isLinux ? '--linux' : '--win'}`, {
            cwd: root,
            stdio: 'inherit',
            env: builderEnv
        });
    } catch {
        fail('electron-builder başarısız oldu.');
    }

    log('');
    log('╔═══════════════════════════════════════╗');
    log('║  BUILD TAMAMLANDI ✓                   ║');
    log('║  release/OSPlayer-Setup-*.exe hazır   ║');
    log('╚═══════════════════════════════════════╝');
}

main().catch(err => {
    console.error('\x1b[31m[build] HATA:\x1b[0m', err.message || err);
    process.exit(1);
});
