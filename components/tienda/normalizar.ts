/** Minúsculas y sin tildes: "Mágica" y "magica" buscan igual. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
