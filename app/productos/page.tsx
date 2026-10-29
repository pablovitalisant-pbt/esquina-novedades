import { permanentRedirect } from 'next/navigation';
import flags from '@/config/feature-flags.json';
import { getProductosTienda } from '@/lib/tienda-productos';
import { ProductosPublicos } from './client_page';

export const dynamic = 'force-dynamic';

export default async function ProductosPage() {
  // Slice 8b: con la portada v2 hay una sola tienda; /productos deja de existir.
  if (flags['tienda-portada-v2'] === true) {
    permanentRedirect('/');
  }
  const { productos, empresaSlug } = await getProductosTienda();
  return <ProductosPublicos productos={productos} empresaSlug={empresaSlug} />;
}
