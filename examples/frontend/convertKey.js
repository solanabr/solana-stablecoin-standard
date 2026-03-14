// convertKey.js

// Массив твоего private key (64 байта)
const secretKeyArray = [192,173,84,111,220,130,153,63,175,60,245,76,24,224,207,25,216,139,129,114,142,94,22,176,15,131,143,25,227,68,229,105,124,105,217,161,219,71,208,204,62,47,44,14,38,94,157,62,212,216,146,26,188,129,66,93,216,25,250,236,173,179,122,75]

// tiny helper function для base58 (чистый JS)
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encodeBase58(buffer) {
    let intVal = BigInt('0x' + Buffer.from(buffer).toString('hex'));
    let encoded = '';
    while (intVal > 0) {
        const mod = intVal % 58n;
        intVal = intVal / 58n;
        encoded = ALPHABET[Number(mod)] + encoded;
    }
    // leading zeros
    for (let b of buffer) {
        if (b === 0) encoded = '1' + encoded;
        else break;
    }
    return encoded;
}

// конвертация
const base58Key = encodeBase58(Uint8Array.from(secretKeyArray));
console.log('🎯 Base58 key для Phantom:\n', base58Key);