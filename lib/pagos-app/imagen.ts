/** N12d1 — comprobante de transferencia válido, ya leído y verificado. */
export type ImagenComprobante = { mime: MimeComprobante; bytes: Uint8Array };

const MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
type MimeComprobante = (typeof MIMES)[number];

const MAX_BYTES = 2 * 1024 * 1024;

const firmaValida = (mime: MimeComprobante, b: Uint8Array): boolean => {
  if (mime === 'image/png') {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v);
  }
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return (
    String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.subarray(8, 12)) === 'WEBP'
  );
};

/** Lee hasta 2 MiB del cuerpo; null si no es un PNG/JPEG/WebP coherente. */
export async function leerImagenComprobante(request: Request): Promise<ImagenComprobante | null> {
  const mime = (request.headers.get('content-type') ?? '').trim().toLowerCase();
  if (!MIMES.includes(mime as MimeComprobante)) return null;

  const lector = request.body?.getReader();
  if (!lector) return null;

  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await lector.cancel();
      return null;
    }
    trozos.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const trozo of trozos) {
    bytes.set(trozo, offset);
    offset += trozo.byteLength;
  }

  return firmaValida(mime as MimeComprobante, bytes) ? { mime: mime as MimeComprobante, bytes } : null;
}
