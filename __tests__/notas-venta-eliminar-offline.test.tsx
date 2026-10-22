/**
 * @jest-environment jsdom
 *
 * FASE B — tests que intentan romper el fix de `eliminarItem` (BUG-040).
 * Síntoma: con notas-venta-offline-lectura=true, el ítem eliminado no
 * desaparece de la UI hasta refrescar. Causa raíz: eliminarItem hacía el
 * DELETE al API remoto directo, pero fetchPrenota lee la DB local PowerSync
 * (que no se entera del borrado) → la fila quedaba "fantasma".
 *
 * R1 (rojo): en offline, eliminar llama db.execute (mutación local) y NO hace
 *   fetch(DELETE) remoto.
 * R2 (rojo): tras eliminar, el ítem desaparece de la UI sin refrescar.
 * R3 (verde/no-regresión): en online (flag off), se mantiene el fetch(DELETE)
 *   remoto + fetchPrenota online.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';

// Flag offline mutable: true por default (R1/R2), false en R3 (online).
let offlineFlag = true;
jest.mock('@/config/feature-flags.json', () => ({
  get 'notas-venta-offline-lectura'() { return offlineFlag; },
}));

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { rol: 'vendedor' } } }),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: '1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/notas-venta/1',
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
jest.mock('xlsx', () => ({ utils: { json_to_sheet: jest.fn(), book_new: jest.fn(), book_append_sheet: jest.fn(), writeFile: jest.fn() } }));
jest.mock('jspdf-autotable', () => jest.fn());
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({ PowerSyncProvider: ({ children }: any) => children }));
jest.mock('@/components/PagarNotaDialog', () => ({ PagarNotaDialog: () => null }));

// DB local PowerSync stateful: get/getAll/execute sobre un array mutable.
let dbItems: any[];
const dbMock = {
  get: jest.fn(async (sql: string) => {
    if (sql.includes('FROM prenotas')) return { id: 1, titulo: 'Nota de Venta #1', cliente_nombre: 'Cliente X', estado: 'activa' };
    if (sql.includes('caja_movimiento_notas')) return { total: '0' };
    return null;
  }),
  getAll: jest.fn(async () => dbItems),
  execute: jest.fn(async (sql: string, params: any[]) => {
    if (sql.includes('DELETE FROM prenota_items')) {
      dbItems = dbItems.filter(i => i.id !== params[0]);
    }
  }),
};
jest.mock('@powersync/react', () => ({
  usePowerSync: () => dbMock,
  PowerSyncContext: { Provider: ({ children }: any) => children },
}));

// fetch global: registra llamadas para verificar que NO haya DELETE remoto en offline.
const fetchMock = jest.fn(async (url: string, reqOpts?: RequestInit) => {
  const urlStr = typeof url === 'string' ? url : url.toString();
  // fetchPrenota online (solo R3)
  if (urlStr.startsWith('/api/notas-venta/1') && (!reqOpts?.method || reqOpts.method === 'GET')) {
    return { ok: true, json: async () => ({ id: 1, titulo: 'Nota de Venta #1', cliente_nombre: null, items: dbItems }) };
  }
  if (urlStr === '/api/caja/config') {
    return { ok: true, json: async () => ({ data: { valor: '0' } }) };
  }
  return { ok: true, json: async () => ({}) };
});

// prenota_items.id es UUID string (migración 027), no SERIAL. El test usa
// UUIDs reales para que Number(itemId)=NaN quede en rojo si alguien vuelve a
// convertir el id. Ver BUG-040 y BUG-041.
const itemsIniciales = () => [
  { id: 'uuid-1', codigo: 'X-001', descripcion: 'Item X', cajas: 1, unidades: 2, precio: 10 },
  { id: 'uuid-2', codigo: 'Y-002', descripcion: 'Item Y', cajas: 1, unidades: 1, precio: 15 },
];

async function abrirEdicionYeliminar() {
  await waitFor(() => expect(screen.getByText('X-001')).toBeInTheDocument());
  // Abrir modo edición de la fila X (primer ítem)
  const editButtons = screen.getAllByRole('button', { name: /editar/i });
  fireEvent.click(editButtons[0]);
  // Click en "Eliminar" (visible solo en modo edición)
  fireEvent.click(await screen.findByRole('button', { name: /eliminar/i }));
}

describe('eliminarItem — modo offline (BUG-040)', () => {
  beforeEach(() => {
    offlineFlag = true;
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    dbItems = itemsIniciales();
    global.fetch = fetchMock as any;
  });

  // R1: en offline, eliminar muta la DB local (db.execute) y NO hace fetch DELETE remoto.
  it('R1: con offline activo, eliminar llama db.execute y no dispara fetch(DELETE)', async () => {
    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);
    await abrirEdicionYeliminar();

    await waitFor(() => {
      expect(dbMock.execute).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM prenota_items'), ['uuid-1']);
    });
    const deleteCalls = (global.fetch as jest.Mock).mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/items/') && (c[1] as any)?.method === 'DELETE'
    );
    expect(deleteCalls.length).toBe(0);
  });

  // R2: tras eliminar, el ítem desaparece de la UI (refetch local lo omite).
  it('R2: el ítem eliminado desaparece de la UI sin refrescar la página', async () => {
    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);
    await abrirEdicionYeliminar();

    await waitFor(() => {
      expect(screen.queryByText('X-001')).not.toBeInTheDocument();
    });
    // El otro ítem sigue
    expect(screen.getByText('Y-002')).toBeInTheDocument();
  });
});

describe('eliminarItem — modo online (no-regresión)', () => {
  beforeEach(() => {
    offlineFlag = false;
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    dbItems = itemsIniciales();
    global.fetch = fetchMock as any;
  });

  // R3: en online (flag off), se mantiene el fetch(DELETE) remoto.
  it('R3: con offline off, eliminar mantiene el fetch(DELETE) remoto', async () => {
    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);
    await abrirEdicionYeliminar();

    await waitFor(() => {
      const deleteCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('/items/') && (c[1] as any)?.method === 'DELETE'
      );
      expect(deleteCalls.length).toBe(1);
    });
  });
});
