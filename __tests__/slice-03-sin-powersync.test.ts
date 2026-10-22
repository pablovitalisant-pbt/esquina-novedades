import fs from 'fs';
import path from 'path';

// Crece por corte (Slice 3). T1: los archivos migrados no referencian PowerSync.
const MIGRADOS = [
  'components/AppShell.tsx',
  'contexts/AlertasContext.tsx',
  'components/AlertasBell.tsx',
  'app/(app)/alertas-stock/client_page.tsx',
  'app/(app)/admin/usuarios/client_page.tsx',
  'app/(app)/catalogo/admin/client_page.tsx',
  'app/(app)/alertas-stock/client_page.test.tsx',
  'app/(app)/admin/usuarios/client_page.test.tsx',
  'app/(app)/catalogo/admin/client_page.test.tsx',
  'app/(app)/clientes/client_page.tsx',
  'app/(app)/precios/client_page.tsx',
  'app/(app)/bodega/client_page.tsx',
  'app/(app)/admin/caja-config/client_page.tsx',
  'app/(app)/clientes/client_page.test.tsx',
  'app/(app)/precios/client_page.test.tsx',
  'app/(app)/bodega/client_page.test.tsx',
  'app/(app)/admin/caja-config/client_page.test.tsx',
  '__tests__/precios-eliminar-producto-ui.test.tsx',
  '__tests__/bodega-client_page.test.tsx',
  '__tests__/caja-config-client_page.test.tsx',
  'app/(app)/admin/categorias/client_page.tsx',
  'app/(app)/notas-venta/client_page.tsx',
  'app/(app)/notas-venta/client_page.test.tsx',
  '__tests__/notas-venta-prefetch-hover.test.tsx',
  'app/(app)/notas-venta/[id]/client_page.tsx',
  'app/(app)/notas-venta/[id]/client_page.test.tsx',
  '__tests__/notas-venta-eliminar-offline.test.tsx',
  '__tests__/notas-venta-guardar-offline.test.tsx',
  '__tests__/notas-venta-compartir-whatsapp.test.tsx',
  '__tests__/notas-venta-exportar-pdf.test.tsx',
];
const PROHIBIDO = /@powersync|lib\/powersync|usePowerSync|OFFLINE_READ|wa-sqlite|offline-lectura|alertas-badge-offline/;

describe('Slice 3 — T1 sin PowerSync en archivos migrados', () => {
  it.each(MIGRADOS)('%s', (f) => {
    const src = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
    expect(src).not.toMatch(PROHIBIDO);
  });
});
