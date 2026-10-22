/**
 * @jest-environment jsdom
 *
 * FASE B — Tests que intentan romper el slice BUG-051 (buscador "Agregar Productos"
 * no funciona offline).
 *
 * Causa raíz: el useEffect de búsqueda siempre llamaba fetch('/api/productos?search=...'),
 * y sw.ts fuerza NetworkOnly en /api/* → offline falla sin fallback. La tabla local
 * productos (PowerSync) ya tiene codigo/detalle/saldo sincronizados.
 *
 * El fix agrega una rama OFFLINE_READ && db que consulta db.getAll a la tabla local
 * en vez de fetch. Este test verifica: escribiendo en el buscador con el flag offline
 * activo, la búsqueda va a db.getAll (query a productos), NO a fetch('/api/productos').
 * - HOY (ROJO): solo hay fetch → getFromDB no recibe la query de productos → assert falla.
 * - Tras fix (VERDE): db.getAll recibe la query local de productos → assert pasa.
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { rol: 'vendedor' } } }),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, prefetch: jest.fn() }),
  useParams: () => ({ id: '1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/notas-venta/1',
}));

const getMock = jest.fn();
const getAllMock = jest.fn();
const executeMock = jest.fn();
jest.mock('@powersync/react', () => {
  const ReactMock = require('react');
  return {
    usePowerSync: () => ({ get: getMock, getAll: getAllMock, execute: executeMock }),
    PowerSyncContext: ReactMock.createContext<any>(null),
  };
});

beforeEach(() => {
  getMock.mockReset();
  getAllMock.mockReset();
  executeMock.mockReset();
  getMock.mockImplementation(async () => ({ id: 1, titulo: 'Nota', cliente_nombre: null }));
  getAllMock.mockImplementation(async () => []);
});

test('la búsqueda de productos con flag offline consulta la tabla local, no fetch /api/productos', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
  global.fetch = fetchMock as any;

  const { getByPlaceholderText } = render(
    <PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />
  );

  const input = getByPlaceholderText('Buscar por código o descripción...');
  // Simula escribir en el buscador (≥2 caracteres para disparar el debounce)
  fireEvent.change(input, { target: { value: 'Toni' } });

  await waitFor(() => {
    // Debe existir una llamada a db.getAll con la query local de productos
    const localCall = getAllMock.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('FROM productos') && sql.includes('WHERE LOWER(codigo) LIKE')
    );
    expect(localCall).toBeDefined();
  }, { timeout: 3000 });

  // Y NO debe haber llamado a /api/productos
  const apiCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/api/productos'));
  expect(apiCall).toBeUndefined();
});
