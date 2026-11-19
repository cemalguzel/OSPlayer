import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require('better-sqlite3') as typeof import('better-sqlite3');
type DatabaseInstance = ReturnType<typeof Database>;

/**
 * SQLite veritabanı yöneticisi.
 * Eski JsonStore ile geriye dönük uyumludur — IPC handler'lar değişmez.
 * WAL modu: çökme güvenli, eşzamanlı okuma destekli.
 */
export class AppDatabase {
    private db: DatabaseInstance;

    constructor() {
        const dbPath = path.join(app.getPath('userData'), 'osplayer.db');
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('cache_size = -32000'); // 32MB cache
        this.migrate();
        this.importLegacyJson();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Schema Migration
    // ─────────────────────────────────────────────────────────────────────

    private migrate() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS kv_store (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS accounts (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT,
                username   TEXT NOT NULL,
                password   TEXT NOT NULL,
                server_url TEXT DEFAULT '',
                is_manual  INTEGER DEFAULT 0,
                is_active  INTEGER DEFAULT 0,
                UNIQUE(username, server_url)
            );

            CREATE TABLE IF NOT EXISTS favorites (
                account_key TEXT NOT NULL,
                stream_id   TEXT NOT NULL,
                stream_type TEXT NOT NULL,
                added_at    INTEGER DEFAULT (unixepoch()),
                PRIMARY KEY (account_key, stream_id, stream_type)
            );

            CREATE TABLE IF NOT EXISTS watch_positions (
                account_key TEXT NOT NULL,
                stream_id   TEXT NOT NULL,
                position    REAL DEFAULT 0,
                duration    REAL DEFAULT 0,
                updated_at  INTEGER DEFAULT (unixepoch()),
                PRIMARY KEY (account_key, stream_id)
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id       TEXT PRIMARY KEY,
                title    TEXT DEFAULT '',
                content  TEXT DEFAULT '',
                is_read  INTEGER DEFAULT 0,
                date     TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS hidden_channels (
                account_key TEXT NOT NULL,
                stream_id   TEXT NOT NULL,
                PRIMARY KEY (account_key, stream_id)
            );
        `);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Legacy JSON Migration (ilk açılışta otomatik)
    // ─────────────────────────────────────────────────────────────────────

    private importLegacyJson() {
        const jsonPath = path.join(app.getPath('userData'), 'osplayer-store.json');
        const donePath = path.join(app.getPath('userData'), 'osplayer-store.migrated');

        if (fs.existsSync(donePath) || !fs.existsSync(jsonPath)) return;

        try {
            const raw = fs.readFileSync(jsonPath, 'utf8');
            const data: Record<string, unknown> = JSON.parse(raw);

            const insertKv = this.db.prepare('INSERT OR IGNORE INTO kv_store (key, value) VALUES (?, ?)');
            const insertMany = this.db.transaction((entries: [string, unknown][]) => {
                for (const [k, v] of entries) {
                    insertKv.run(k, JSON.stringify(v));
                }
            });

            insertMany(Object.entries(data));
            fs.writeFileSync(donePath, new Date().toISOString(), 'utf8');
            console.log('[DB] Legacy JSON migrated to SQLite.');
        } catch (e) {
            console.error('[DB] Legacy JSON migration failed:', e);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Geriye Dönük Uyumlu KV API (IPC handler'lar değişmez)
    // ─────────────────────────────────────────────────────────────────────

    get(key: string): unknown {
        const row = this.db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key) as { value: string } | undefined;
        if (!row) return null;
        try { return JSON.parse(row.value); } catch { return null; }
    }

    set(key: string, value: unknown): void {
        this.db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
    }

    delete(key: string): void {
        this.db.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
    }

    /** WAL modu: flush gerekmiyor, no-op olarak bırakıldı (eski API uyumu) */
    flush(): void { /* SQLite WAL — otomatik */ }

    close(): void {
        try { this.db.close(); } catch { /* yoksay */ }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Gelişmiş API — Tip Güvenli
    // ─────────────────────────────────────────────────────────────────────

    // Favoriler
    getFavorites(accountKey: string): { stream_id: string; stream_type: string; added_at: number }[] {
        return this.db.prepare(
            'SELECT stream_id, stream_type, added_at FROM favorites WHERE account_key = ? ORDER BY added_at DESC'
        ).all(accountKey) as any;
    }

    isFavorite(accountKey: string, streamId: string, streamType: string): boolean {
        const row = this.db.prepare(
            'SELECT 1 FROM favorites WHERE account_key=? AND stream_id=? AND stream_type=?'
        ).get(accountKey, streamId, streamType);
        return !!row;
    }

    addFavorite(accountKey: string, streamId: string, streamType: string): void {
        this.db.prepare(
            'INSERT OR IGNORE INTO favorites (account_key, stream_id, stream_type) VALUES (?,?,?)'
        ).run(accountKey, streamId, streamType);
    }

    removeFavorite(accountKey: string, streamId: string, streamType: string): void {
        this.db.prepare(
            'DELETE FROM favorites WHERE account_key=? AND stream_id=? AND stream_type=?'
        ).run(accountKey, streamId, streamType);
    }

    // İzleme Pozisyonları
    getWatchPosition(accountKey: string, streamId: string): { position: number; duration: number } | null {
        return this.db.prepare(
            'SELECT position, duration FROM watch_positions WHERE account_key=? AND stream_id=?'
        ).get(accountKey, streamId) as any;
    }

    setWatchPosition(accountKey: string, streamId: string, position: number, duration: number): void {
        this.db.prepare(
            'INSERT OR REPLACE INTO watch_positions (account_key, stream_id, position, duration, updated_at) VALUES (?,?,?,?,unixepoch())'
        ).run(accountKey, streamId, position, duration);
    }

    deleteWatchPosition(accountKey: string, streamId: string): void {
        this.db.prepare('DELETE FROM watch_positions WHERE account_key=? AND stream_id=?').run(accountKey, streamId);
    }

    // Gizli Kanallar
    getHiddenChannels(accountKey: string): string[] {
        const rows = this.db.prepare(
            'SELECT stream_id FROM hidden_channels WHERE account_key=?'
        ).all(accountKey) as { stream_id: string }[];
        return rows.map(r => r.stream_id);
    }

    addHiddenChannel(accountKey: string, streamId: string): void {
        this.db.prepare('INSERT OR IGNORE INTO hidden_channels (account_key, stream_id) VALUES (?,?)').run(accountKey, streamId);
    }

    removeHiddenChannel(accountKey: string, streamId: string): void {
        this.db.prepare('DELETE FROM hidden_channels WHERE account_key=? AND stream_id=?').run(accountKey, streamId);
    }
}
