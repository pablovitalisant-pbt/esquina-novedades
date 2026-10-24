type Marca = {
  nombre: string;
  razonSocial: string;
  slug: string;
  direccion: string;
  ciudad: string;
  horario: string;
  whatsapp: string;
  whatsappUrl: string;
  /** Ruta en /public/marca. null = wordmark de texto. */
  logo: string | null;
  /** Logo del PDF de notas. null = wordmark de texto. */
  logoNota: string | null;
  /** URL vacía = red no se renderiza. */
  redes: { facebook: string; instagram: string; tiktok: string };
  colores: { primario: string; acento: string; tinta: string };
};

export const EMPRESA: Marca = {
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
  colores: { primario: '#E21E26', acento: '#FFB612', tinta: '#231F20' },
};
