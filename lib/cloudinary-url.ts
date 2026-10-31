/**
 * fotos-1 — helpers puros de Cloudinary (sin importar el SDK del servidor,
 * porque este modulo lo usa un componente cliente).
 */
const MARCA = '/image/upload/';

/** Inserta `f_auto,q_auto,c_limit,w_<ancho>` tras /image/upload/. */
export function urlCloudinary(url: string | null | undefined, ancho = 600): string {
  if (!url) return '';
  if (!url.includes('res.cloudinary.com') || !url.includes(MARCA)) return url;

  const corte = url.indexOf(MARCA) + MARCA.length;
  const resto = url.slice(corte);
  const primero = resto.split('/')[0];
  // v1234567890 es version, no transformacion.
  const yaTransformada = /^[a-z]{1,2}_/.test(primero) && !/^v\d+$/.test(primero);
  if (yaTransformada) return url;

  return `${url.slice(0, corte)}f_auto,q_auto,c_limit,w_${ancho}/${resto}`;
}

/** public_id de Cloudinary: solo [A-Za-z0-9_-]; el resto a "_". */
export function sanearCodigo(codigo: string): string {
  return codigo.replace(/[^A-Za-z0-9_-]/g, '_');
}
