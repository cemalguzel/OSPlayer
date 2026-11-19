import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Basit JSON dosya deposu: hesaplar, ayarlar, favoriler, izleme konumları vb.
 * userData/osplayer-store.json içinde tutulur.
 */
export class JsonStore {
    private file: string;
    private data: Record<string, unknown> = {};
    private saveTimer: NodeJS.Timeout | null = null;

    constructor() {
        this.file = path.join(app.getPath('userData'), 'osplayer-store.json');
        try {
            this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        } catch {
            this.data = {};
        }
    }

    get(key: string): unknown {
        return this.data[key] ?? null;
    }

    set(key: string, value: unknown): void {
        this.data[key] = value;
        this.scheduleSave();
    }

    delete(key: string): void {
        delete this.data[key];
        this.scheduleSave();
    }

    private scheduleSave() {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.flush(), 300);
    }

    flush(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (e) {
            console.error('Store kaydedilemedi:', e);
        }
    }
}
