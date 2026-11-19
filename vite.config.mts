import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import path from 'path';

// Electron file:// ile yüklediği için base "./" olmalı
export default defineConfig({
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
    },
    build: {
        outDir: 'dist',
        target: 'chrome120',
    },
    server: { port: 5183 },
});
