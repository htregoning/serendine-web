// Turn a camera photo into a small square JPEG thumbnail (about 15–40 KB),
// so selfies are quick to share and nothing large is ever stored.
export async function selfieThumbnail(file: File, size = 320): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that photo'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that photo');
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    let quality = 0.82;
    let data = canvas.toDataURL('image/jpeg', quality);
    while (data.length > 110000 && quality > 0.4) {
      quality -= 0.1;
      data = canvas.toDataURL('image/jpeg', quality);
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
