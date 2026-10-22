/** Slice 9d — redirección de página completa, aislada para poder testearla. */
export function redirigirA(url: string) {
  if (typeof window !== 'undefined') window.location.href = url;
}
