import { spawn, ChildProcess, execFile } from 'child_process';
import { app } from 'electron';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * MPV süreç yöneticisi — Standalone pencere modu.
 *
 * Mimari:
 *  - MPV kendi native Win32 penceresinde açılır (--wid KULLANILMAZ)
 *  - mainWindow transparent + disableHardwareAcceleration sayesinde
 *    React'ın "bg-transparent" alanlarından MPV penceresi görünür
 *  - overlayWindow MPV penceresinin tam üstünde (alwaysOnTop: screen-saver)
 *  - Pencere konumu: başlangıçta --geometry, sonra setWindowBounds (PowerShell)
 */

export interface MpvEvent {
    type: 'property' | 'event' | 'status';
    name?: string;
    value?: unknown;
    event?: string;
    data?: unknown;
}

type EventCallback = (ev: MpvEvent) => void;

const OBSERVED_PROPS = [
    'time-pos',
    'duration',
    'pause',
    'paused-for-cache',
    'core-idle',
    'seeking',
    'eof-reached',
    'track-list',
    'video-params',
    'volume',
    'mute',
    'speed',
    'media-title',
];

export function findMpvBinary(): string | null {
    const platDir = process.platform === 'win32' ? 'win' : 'linux';
    const exe = process.platform === 'win32' ? 'mpv.exe' : 'mpv';
    const candidates: string[] = [];
    if (app.isPackaged) {
        candidates.push(path.join(process.resourcesPath, 'mpv', platDir, exe));
        candidates.push(path.join(process.resourcesPath, 'mpv', exe));
    } else {
        candidates.push(path.join(app.getAppPath(), 'resources', 'mpv', platDir, exe));
    }
    for (const c of candidates) {
        try {
            fs.accessSync(c, fs.constants.X_OK);
            return c;
        } catch {
            /* devam */
        }
    }
    return exe;
}

export class MpvManager {
    private proc: ChildProcess | null = null;
    private socket: net.Socket | null = null;
    private socketPath = '';
    private requestId = 1;
    private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    private buffer = '';
    private onEvent: EventCallback;
    private starting: Promise<void> | null = null;
    private userAgent: string;

    constructor(onEvent: EventCallback, userAgent: string) {
        this.onEvent = onEvent;
        this.userAgent = userAgent;
    }

    get isRunning(): boolean {
        return !!this.proc && !this.proc.killed && !!this.socket;
    }

    /**
     * MPV'yi başlatır.
     * @param initBounds - İlk pencere konumu (fiziksel piksel) veya wid
     */
    async start(initBounds: { x: number; y: number; width: number; height: number; wid?: number }): Promise<void> {
        if (this.starting) return this.starting;
        if (this.isRunning) return;
        this.starting = this.doStart(initBounds).finally(() => {
            this.starting = null;
        });
        return this.starting;
    }

    private async doStart(initBounds: { x: number; y: number; width: number; height: number; wid?: number }): Promise<void> {
        this.socketPath =
            process.platform === 'win32'
                ? `\\\\.\\pipe\\osplayer-mpv-${process.pid}`
                : path.join(os.tmpdir(), `osplayer-mpv-${process.pid}.sock`);

        const bin = findMpvBinary();
        if (!bin) throw new Error('mpv bulunamadı');

        const { x, y, width, height } = initBounds;

        const args: string[] = [
            `--input-ipc-server=${this.socketPath}`,
            '--idle=yes',
            '--keep-open=yes',
            '--no-osc',
            '--no-osd-bar',
            '--osd-level=0',
            '--no-input-default-bindings',
            '--input-vo-keyboard=no',
            '--no-input-cursor',
            '--cursor-autohide=always',
            '--no-config',
            '--msg-level=all=warn',
            `--log-file=${path.join(app.getPath('userData'), 'mpv_debug.log')}`,

            // ── Ağ / tampon
            '--network-timeout=15',
            '--cache=yes',
            '--demuxer-max-bytes=32MiB',
            '--demuxer-readahead-secs=8',
            `--user-agent=${this.userAgent}`,
            '--force-seekable=yes',
            '--tls-verify=no',

            // ── Native Window Embed (--wid)
            `--wid=${initBounds.wid || 0}`,

            // ── Video Output
            '--vo=gpu',
            '--hwdec=auto',
        ];

        console.log(`[MPV] Başlatılıyor (standalone pencere modu)...`);

        this.proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        this.proc.stdout?.on('data', (d: Buffer) => {
            const msg = d.toString().trim();
            if (msg) console.log(`[MPV] ${msg}`);
        });
        this.proc.stderr?.on('data', (d: Buffer) => {
            const msg = d.toString().trim();
            if (msg) {
                console.error('[MPV ERR]', msg);
                this.onEvent({ type: 'status', event: 'stderr', data: msg });
            }
        });
        this.proc.on('exit', (code) => {
            this.cleanup();
            this.onEvent({ type: 'status', event: 'exited', data: code });
        });
        this.proc.on('error', (err) => {
            this.cleanup();
            this.onEvent({ type: 'status', event: 'error', data: String(err) });
        });

        await this.connectSocket();
        for (let i = 0; i < OBSERVED_PROPS.length; i++) {
            await this.command(['observe_property', i + 1, OBSERVED_PROPS[i]]).catch(() => undefined);
        }
        this.onEvent({ type: 'status', event: 'started' });
        console.log('[MPV] Standalone pencere başarıyla başlatıldı.');
    }

    /**
     * MPV standalone penceresini PowerShell ile taşı/yeniden boyutlandır.
     * Fiziksel piksel koordinatları beklenir.
     */
    async setWindowBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void> {
        const pid = this.proc?.pid;
        if (!pid || process.platform !== 'win32') return;

        const { x, y, width, height } = bounds;

        const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class MpvWin {
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool r);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
}
'@ -ErrorAction SilentlyContinue
$targetPid = ${pid}
$found = [IntPtr]::Zero
$cb = [MpvWin+EnumWindowsProc]{
    param([IntPtr]$hWnd, [IntPtr]$lParam)
    $p = [uint32]0
    [MpvWin]::GetWindowThreadProcessId($hWnd, [ref]$p) | Out-Null
    if ($p -eq $targetPid -and [MpvWin]::IsWindowVisible($hWnd)) {
        $script:found = $hWnd
        return $false
    }
    return $true
}
[MpvWin]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($script:found -ne [IntPtr]::Zero) {
    [MpvWin]::MoveWindow($script:found, ${x}, ${y}, ${width}, ${height}, $true) | Out-Null
}`;

        return new Promise((resolve) => {
            execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], (err) => {
                if (err) console.error('[MPV] setWindowBounds PowerShell hatası:', err.message);
                resolve();
            });
        });
    }

    private connectSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + 10_000;
            const tryConnect = () => {
                const sock = net.connect(this.socketPath);
                sock.once('connect', () => {
                    this.socket = sock;
                    sock.setEncoding('utf8');
                    sock.on('data', (chunk: string) => this.onData(chunk));
                    sock.on('close', () => { this.socket = null; });
                    sock.on('error', () => undefined);
                    resolve();
                });
                sock.once('error', () => {
                    sock.destroy();
                    if (Date.now() > deadline) reject(new Error('mpv IPC soketine bağlanılamadı'));
                    else setTimeout(tryConnect, 200);
                });
            };
            tryConnect();
        });
    }

    private onData(chunk: string) {
        this.buffer += chunk;
        let idx: number;
        while ((idx = this.buffer.indexOf('\n')) >= 0) {
            const line = this.buffer.slice(0, idx).trim();
            this.buffer = this.buffer.slice(idx + 1);
            if (!line) continue;
            let msg: Record<string, unknown>;
            try { msg = JSON.parse(line); } catch { continue; }
            if (typeof msg.request_id === 'number' && this.pending.has(msg.request_id)) {
                const p = this.pending.get(msg.request_id)!;
                this.pending.delete(msg.request_id);
                if (msg.error === 'success') p.resolve(msg.data);
                else p.reject(new Error(String(msg.error)));
            } else if (msg.event === 'property-change') {
                this.onEvent({ type: 'property', name: String(msg.name), value: msg.data });
            } else if (msg.event) {
                this.onEvent({ type: 'event', event: String(msg.event), data: msg });
            }
        }
    }

    command(cmd: unknown[]): Promise<unknown> {
        if (!this.socket) return Promise.reject(new Error('mpv çalışmıyor'));
        const id = this.requestId++;
        const payload = JSON.stringify({ command: cmd, request_id: id }) + '\n';
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket!.write(payload, (err) => {
                if (err) {
                    this.pending.delete(id);
                    reject(err);
                }
            });
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error('mpv komut zaman aşımı'));
                }
            }, 10_000);
        });
    }

    async load(url: string): Promise<void> {
        await this.command(['loadfile', url, 'replace']);
        await this.command(['set_property', 'pause', false]).catch(() => undefined);
    }

    async stop(): Promise<void> {
        await this.command(['stop']).catch(() => undefined);
    }

    quit(): void {
        const sock = this.socket;
        const proc = this.proc;
        // Önce akışı boşalt (stop) + sonra çık (quit). Soketi HEMEN yok etmiyoruz;
        // eskiden cleanup() bu yazımları flush edilmeden kapatıyordu → 'quit' MPV'ye
        // ulaşmıyor, bağlantı yalnızca 500ms sonraki force-kill ile kapanıyordu.
        if (sock) {
            try {
                sock.write(JSON.stringify({ command: ['stop'] }) + '\n');
                sock.write(JSON.stringify({ command: ['quit'] }) + '\n');
            } catch { /* yoksay */ }
        }
        // Referansları bırak ki isRunning hemen false dönsün (yeni oynatım taze MPV açar)
        this.socket = null;
        this.proc = null;
        for (const [, p] of this.pending) p.reject(new Error('mpv kapandı'));
        this.pending.clear();
        // Yazımların flush olmasına izin ver, sonra soketi kapat ve süreci sonlandır.
        setTimeout(() => {
            try { sock?.destroy(); } catch { /* yoksay */ }
            try { proc?.kill(); } catch { /* yoksay */ }
            if (process.platform !== 'win32' && this.socketPath) {
                try { fs.unlinkSync(this.socketPath); } catch { /* yoksay */ }
            }
        }, 200);
    }

    private cleanup() {
        this.socket?.destroy();
        this.socket = null;
        this.proc = null;
        for (const [, p] of this.pending) p.reject(new Error('mpv kapandı'));
        this.pending.clear();
        if (process.platform !== 'win32' && this.socketPath) {
            try { fs.unlinkSync(this.socketPath); } catch { /* yoksay */ }
        }
    }
}
