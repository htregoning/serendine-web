// Photos and short videos: shrinking on the phone, encrypting for private chats,
// and saving or sharing to other apps.

import { fromB64, toB64 } from '@/lib/crypto';

export const MAX_VIDEO_SECONDS = 30;
export const MAX_BYTES = 25 * 1024 * 1024;

export type MediaKind = 'image' | 'video';
export type Prepared = { blob: Blob; mime: string; kind: MediaKind; w?: number; h?: number; ext: string };

// What travels (encrypted) inside a private chat message.
export type MediaPayload = {
  $m: 1;
  path: string;
  key: string;
  iv: string;
  mime: string;
  kind: MediaKind;
  w?: number;
  h?: number;
  caption?: string;
};

export class MediaProblem extends Error {}

// Photos are resized to at most 1600 px and re-saved as JPEG. That keeps them small and
// also strips hidden details such as the location the photo was taken.
async function prepareImage(file: File): Promise<Prepared> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new MediaProblem("That photo couldn't be opened. Try a JPG or PNG.");
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) throw new MediaProblem("That photo couldn't be prepared.");
  return { blob, mime: 'image/jpeg', kind: 'image', w, h, ext: 'jpg' };
}

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    const url = URL.createObjectURL(file);
    const done = (d: number) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onloadedmetadata = () => done(v.duration);
    v.onerror = () => done(NaN);
    v.src = url;
  });
}

async function prepareVideo(file: File): Promise<Prepared> {
  if (file.size > MAX_BYTES) throw new MediaProblem('That video is too big. Keep it under 25 MB (about 30 seconds).');
  const d = await videoDuration(file);
  if (Number.isFinite(d) && d > MAX_VIDEO_SECONDS + 1) {
    throw new MediaProblem(`Videos can be up to ${MAX_VIDEO_SECONDS} seconds. Trim it on your phone first.`);
  }
  const mime = /^video\/(mp4|quicktime|webm)$/.test(file.type) ? file.type : 'video/mp4';
  const ext = mime === 'video/quicktime' ? 'mov' : mime === 'video/webm' ? 'webm' : 'mp4';
  return { blob: file, mime, kind: 'video', ext };
}

export async function prepareMedia(file: File): Promise<Prepared> {
  if (file.type.startsWith('image/')) return prepareImage(file);
  if (file.type.startsWith('video/')) return prepareVideo(file);
  throw new MediaProblem('You can share photos and videos.');
}

// Each file gets its own key, sent inside the (already encrypted) chat message.
export async function encryptBlob(blob: Blob) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await blob.arrayBuffer());
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  return { cipher: new Blob([data], { type: 'application/octet-stream' }), key: toB64(raw), iv: toB64(iv) };
}

export async function decryptBlob(cipher: Blob, keyB64: string, ivB64: string, mime: string) {
  const key = await crypto.subtle.importKey('raw', fromB64(keyB64), { name: 'AES-GCM' }, false, ['decrypt']);
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, await cipher.arrayBuffer());
  return new Blob([data], { type: mime });
}

export function encodeMedia(p: MediaPayload) {
  return JSON.stringify(p);
}

export function parseMedia(text: string): MediaPayload | null {
  if (!text.startsWith('{"$m":1')) return null;
  try {
    const p = JSON.parse(text) as MediaPayload;
    return p && typeof p.path === 'string' && typeof p.key === 'string' ? p : null;
  } catch {
    return null;
  }
}

export function fileName(kind: MediaKind, mime: string) {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'video/quicktime' ? 'mov' : mime === 'video/webm' ? 'webm' : kind === 'video' ? 'mp4' : 'jpg';
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `serendine-${stamp}.${ext}`;
}

// Opens the phone's share sheet (save to Photos, WhatsApp, Instagram…), or downloads where that isn't available.
export async function saveOrShare(blob: Blob, kind: MediaKind) {
  const file = new File([blob], fileName(kind, blob.type), { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
