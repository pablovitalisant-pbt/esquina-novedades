import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProductosPage() {
  // Slice 8b: con la portada v2 hay una sola tienda; /productos deja de existir.
  permanentRedirect('/');
}
