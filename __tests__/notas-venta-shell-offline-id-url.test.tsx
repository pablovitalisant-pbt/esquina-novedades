/**
 * @jest-environment jsdom
 *
 * FASE B — Tests que intentan romper el slice "notas-venta-shell-offline-nunca-visitada".
 *
 * Riesgo declarado en Fase A (hidratación/URL): el service worker puede servir el
 * HTML cacheado de la nota A para la URL de la nota B. Por eso `PrenotaDetalleContent`
 * DEBE tomar el `id` de `useParams()` (el segmento real de la URL del navegador), NO
 * del prop `params` (que viene horneado en el HTML que el SW pudo cachear de otra nota).
 *
 * Con `notas-venta-offline-lectura=true` (default en feature-flags.json), el id se
 * resuelve vía la DB local (`db.get`/`db.getAll`), no vía `fetch`. Este test fuerza la
 * discrepancia: `params` prop dice id '1' (HTML cacheado de la nota 1), `useParams()`
 * dice id '999' (URL real). La DB local debe consultarse con 999, no con 1.
 * - HOY (ROJO): el código usa el prop `params` → db.get([1]) → assert falla.
 * - Tras Fase C (VERDE): usa useParams() → db.get([999]) → assert pasa.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { rol: 'vendedor' } } }),
}));

const push = jest.fn();
// useParams devuelve la URL REAL del navegador (id 999).
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, prefetch: jest.fn() }),
  useParams: () => ({ id: '999' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/notas-venta/999',
}));

// db falsa que registra con qué id se consulta (replica el uso real de fetchPrenota).
// PowerSyncProvider se mockea como passthrough (sus hijos) para no montar la DB real.
const getMock = jest.fn();
const getAllMock = jest.fn();
jest.mock('@powersync/react', () => {
  const ReactMock = require('react');
  return {
    usePowerSync: () => ({ get: getMock, getAll: getAllMock }),
    PowerSyncContext: ReactMock.createContext<any>(null),
  };
});

beforeEach(() => {
  getMock.mockReset();
  getAllMock.mockReset();
  // GET de prenota por id → fila con título (fetchPrenota branch offline).
  getMock.mockImplementation(async (_sql: string, params: any[]) => {
    // primera consulta: SELECT p.* FROM prenotas WHERE p.id = ?
    return { id: params[0], titulo: 'Nota', cliente_nombre: null };
  });
  // items (vacío) y total_pagado (0).
  getAllMock.mockImplementation(async () => []);
});

test('la nota de detalle se lee de la DB local con el id de la URL real (useParams), no el del params horneado', async () => {
  // params prop dice '1' (HTML que el SW pudo cachear de la nota 1),
  // pero la URL real (useParams) es '999'.
  render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

  await waitFor(() => {
    // la primera consulta local a la prenota debe usar el id de la URL real (999)
    const firstGet = getMock.mock.calls[0];
    expect(firstGet).toBeDefined();
    expect(firstGet[1]).toEqual([999]);
  });
});
