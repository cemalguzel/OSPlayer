/**
 * RC4 şifreleme/çözme döngüsü testi
 */
const KEY = 'OSPlayer_Secure_Key_2026_X!';

function rc4Crypt(data, key) {
    const s = Array.from({ length: 256 }, (_, i) => i);
    const keyBytes = Buffer.from(key, 'utf8');
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + s[i] + keyBytes[i % keyBytes.length]) % 256;
        [s[i], s[j]] = [s[j], s[i]];
    }
    let i = 0; j = 0;
    const output = Buffer.alloc(data.length);
    for (let k = 0; k < data.length; k++) {
        i = (i + 1) % 256;
        j = (j + s[i]) % 256;
        [s[i], s[j]] = [s[j], s[i]];
        output[k] = data[k] ^ s[(s[i] + s[j]) % 256];
    }
    return output;
}

const plaintext = Buffer.from('console.log("Hello from encrypted main!");');
const encrypted = rc4Crypt(plaintext, KEY);
const decrypted = rc4Crypt(encrypted, KEY);

console.log('Orijinal    :', plaintext.toString());
console.log('Sifrelendi  :', encrypted.toString('hex').substring(0, 40) + '...');
console.log('Cozuldu     :', decrypted.toString());
console.log('TEST:', plaintext.equals(decrypted) ? 'BASARILI ✓' : 'BASARISIZ ✗');
