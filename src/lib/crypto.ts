// End-to-end encryption helpers, built on the browser's Web Crypto.
//
// Each visit gets its own key pair, made on the guest's phone. The private key
// never leaves the phone: it is stored in IndexedDB as a non-extractable key.
// Only the public key is sent to the server. Two guests derive the same secret
// from their own private key and the other's public key (ECDH P-256), and use
// it to encrypt messages with AES-GCM. The server only ever stores ciphertext.

const DB_NAME = 'serendine-keys';
const STORE = 'keys';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function createKeyPair(): Promise<{ pair: CryptoKeyPair; publicJwk: string }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { pair, publicJwk: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }) };
}

export async function saveKeyPair(id: string, pair: CryptoKeyPair): Promise<void> {
  await idb<IDBValidKey>('readwrite', (s) => s.put(pair, id));
}

export async function loadKeyPair(id: string): Promise<CryptoKeyPair | undefined> {
  return idb<CryptoKeyPair | undefined>('readonly', (s) => s.get(id));
}

export async function sharedKey(mine: CryptoKeyPair, theirPublicJwk: string): Promise<CryptoKey> {
  const theirs = await crypto.subtle.importKey(
    'jwk',
    JSON.parse(theirPublicJwk) as JsonWebKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirs },
    mine.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function encryptText(key: CryptoKey, text: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { ciphertext: toB64(new Uint8Array(buf)), iv: toB64(iv) };
}

export async function decryptText(key: CryptoKey, ciphertext: string, iv: string): Promise<string> {
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ciphertext));
  return new TextDecoder().decode(buf);
}
