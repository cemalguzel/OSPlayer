import * as os from 'os';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
/** get/set metodlarına sahip herhangi bir store ile uyumlu */
interface SimpleStore {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
}

export interface DeviceInfo {
    deviceId: string;
    deviceKey: string;
    mac: string;
    model: string;
    platform: string;
    osVersion: string;
}

function readMachineGuid(): string {
    try {
        if (process.platform === 'win32') {
            const out = execSync(
                'reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid',
                { encoding: 'utf8', windowsHide: true }
            );
            const m = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
            if (m) return m[1];
        } else if (process.platform === 'darwin') {
            const out = execSync('/usr/sbin/ioreg -rd1 -c IOPlatformExpertDevice', { encoding: 'utf8' });
            return out.match(/IOPlatformUUID[^\n]*?"([A-Fa-f0-9-]{36})"/)?.[1] || '';
        } else {
            const fs = require('fs') as typeof import('fs');
            return fs.readFileSync('/etc/machine-id', 'utf8').trim();
        }
    } catch {
        /* aşağıda fallback */
    }
    return '';
}

function firstMac(): string {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const ni of ifaces[name] ?? []) {
            if (!ni.internal && ni.mac && ni.mac !== '00:00:00:00:00:00') return ni.mac;
        }
    }
    return '00:00:00:00:00:00';
}

export function getDeviceInfo(store: SimpleStore): DeviceInfo {
    let seed = readMachineGuid();
    if (!seed) {
        seed = (store.get('device.seed') as string) || '';
        if (!seed) {
            seed = crypto.randomBytes(16).toString('hex');
            store.set('device.seed', seed);
        }
    }
    const mac = firstMac();
    const deviceId = crypto.createHash('sha256').update(`osplayer:${seed}`).digest('hex').slice(0, 32);
    
    let deviceKey = store.get('device.key') as string;
    // Panelden senkronlanan key'e DOKUNMA (panel reseti 6 hane dışında key verebilir).
    const keySynced = store.get('device.keySynced') === true;
    // Key yoksa, ya da senkronlanmamış eski sistem key'i 6 haneli değilse yeniden oluştur
    if (!deviceKey || (!keySynced && deviceKey.length !== 6)) {
        const rawKey = `${seed}-${mac}-OS_PLAYER_SALT`;
        deviceKey = crypto.createHash('sha256').update(rawKey).digest('hex').substring(0, 6).toUpperCase();
        store.set('device.key', deviceKey);
    }
    
    return {
        deviceId,
        deviceKey,
        mac,
        model: os.hostname(),
        platform: process.platform === 'win32' ? 'windows' : process.platform,
        osVersion: os.release(),
    };
}
