export const EMPRESA = {
  nombre: 'La Esquina de las Novedades',
  razonSocial: 'LA ESQUINA DE LAS NOVEDADES SPA',
  slug: 'la-esquina-de-las-novedades',
  direccion: 'Avenida Aeropuerto 2860',
  ciudad: 'Iquique',
  horario: '11:00 a 20:00',
  whatsapp: '+56 9 7340 9133',
  whatsappUrl: 'https://wa.me/56973409133',
  // Hasta que Paola entregue PNG: se usa el wordmark de texto actual.
  logo: null,
  logoNota: null,
  redes: { facebook: '', instagram: '', tiktok: '' },
  colores: {
    primario: '#590078',
    acento: '#F2B936',
    tinta: '#21002F',
    // Tokens de archivos generados (PDF/Excel/QR/print).
    fondoSuave: '#FFF8EA',
    champagne: '#FFE6A0',
    violetaSuave: '#F5EEF8',
    textoClaro: '#FFF8EA',
    borde: '#E4D8EA',
  },
} as const;

/** jsPDF pide colores como [r, g, b]. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** exceljs pide ARGB de 8 dígitos ('FF' + RRGGBB). */
export function hexToArgb(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`;
}
