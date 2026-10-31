/**
 * fotos-1 — reduccion de fotos en el cliente antes de subirlas.
 *
 * Canvas + toDataURL('image/jpeg', 0.85): lado mayor <= 1600 px. Si la foto ya
 * es chica y liviana se manda tal cual; si pesa mas de 1.5 MB se re-encodea
 * igual. El base64 resultante debe quedar bajo 3 MB.
 */
export const LADO_MAX = 1600;
const CALIDAD_JPEG = 0.85;
export const MAX_ENTRADA_BYTES = 20 * 1024 * 1024;
const MAX_BASE64_BYTES = 3 * 1024 * 1024;
const REENCODE_MIN_BYTES = 1.5 * 1024 * 1024;
export const TIPOS_ACEPTADOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export function dimensionesReducidas(ancho: number, alto: number, ladoMax = LADO_MAX) {
  const mayor = Math.max(ancho, alto);
  if (mayor <= ladoMax) return { ancho, alto, cambio: false };
  const escala = ladoMax / mayor;
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala), cambio: true };
}

/** Bytes del contenido base64 (sin el prefijo `data:...;base64,`). */
export function tamanoBase64(dataUrl: string): number {
  const coma = dataUrl.indexOf(',');
  const payload = coma >= 0 ? dataUrl.slice(coma + 1) : dataUrl;
  return Math.floor((payload.length * 3) / 4);
}

function leerDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
    img.src = src;
  });
}

export async function reducirImagen(file: File): Promise<string> {
  if (!TIPOS_ACEPTADOS.includes(file.type)) {
    throw new Error('Solo se aceptan JPG, PNG o WEBP');
  }
  if (file.size > MAX_ENTRADA_BYTES) {
    throw new Error('La imagen no puede superar 20 MB');
  }

  const original = await leerDataUrl(file);
  const img = await cargarImagen(original);
  const dims = dimensionesReducidas(img.width, img.height);

  // Ya chica y liviana: no hay nada que ganar re-encodeando.
  if (!dims.cambio && file.size <= REENCODE_MIN_BYTES) return original;

  const canvas = document.createElement('canvas');
  canvas.width = dims.ancho;
  canvas.height = dims.alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');
  // PNG/WEBP con transparencia: fondo blanco antes del JPEG (si no, negro).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dims.ancho, dims.alto);
  ctx.drawImage(img, 0, 0, dims.ancho, dims.alto);

  const reducida = canvas.toDataURL('image/jpeg', CALIDAD_JPEG);
  if (tamanoBase64(reducida) > MAX_BASE64_BYTES) {
    throw new Error('La foto es muy pesada');
  }
  return reducida;
}
