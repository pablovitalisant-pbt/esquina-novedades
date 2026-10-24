import type { MetadataRoute } from 'next';
import { EMPRESA } from '@/lib/empresa';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: EMPRESA.nombre,
    short_name: 'La Esquina',
    description: `Venta mayorista y al detalle en ${EMPRESA.ciudad}`,
    start_url: '/precios',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: EMPRESA.colores.primario,
    orientation: 'portrait',
    icons: [
      { src: '/marca/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/marca/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/marca/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/marca/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
