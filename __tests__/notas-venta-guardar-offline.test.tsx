/**
 * @jest-environment jsdom
 *
 * FASE B — fix de `handleGuardar` (PATCH de ítem). Mismo patrón roto que
 * `eliminarItem` tenía antes de BUG-040/041: siempre va al API remoto, sin rama
 * offline. Con notas-venta-offline-lectura=true:
 *   - ítem creado offline NO sincronizado a Neon → el PATCH remoto da 404
 *     "Item no encontrado" (route.ts:69).
 *   - ítem ya sincronizado → el PATCH persiste en Neon pero la réplica local no
 *     se actualiza → "no aplica".
 * Fix: en offline, mutar la DB local con db.execute (UUID string) + refetch.
 *
 * R1 (rojo): ítem local sin sync → guardar hace db.execute(UPDATE) y NO fetch PATCH.
 * R2 (rojo): tras guardar offline, la réplica local se actualiza (UI refleja).
 * R3 (verde/no-regresión): online mantiene el fetch PATCH remoto.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';

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
    if (sql.includes('UPDATE prenota_items')) {
      const [cajas, unidades, precio, id] = params;
      dbItems = dbItems.map(i => i.id === id ? { ...i, cajas, unidades, precio } : i);
    }
  }),
};
jest.mock('@powersync/react', () => ({
  usePowerSync: () => dbMock,
  PowerSyncContext: { Provider: ({ children }: any) => children },
}));

// fetch global: PATCH configurable (404 = ítem local sin sync a Neon; 200 = sync).
let patchStatus = 200;
const fetchMock = jest.fn(async (url: string, reqOpts?: RequestInit) => {
  const urlStr = typeof url === 'string' ? url : url.toString();
  const method = reqOpts?.method;
  if (urlStr.startsWith('/api/notas-venta/1') && (!method || method === 'GET')) {
    return { ok: true, json: async () => ({ id: 1, titulo: 'Nota de Venta #1', cliente_nombre: null, items: dbItems }) };
  }
  if (urlStr.includes('/items/') && method === 'PATCH') {
    return patchStatus === 200
      ? { ok: true, json: async () => ({ ok: true }) }
      : { ok: false, json: async () => ({ error: 'Item no encontrado' }) };
  }
  if (urlStr === '/api/caja/config') {
    return { ok: true, json: async () => ({ data: { valor: '0' } }) };
  }
  return { ok: true, json: async () => ({}) };
});

const itemsIniciales = () => [
  { id: 'uuid-1', codigo: 'X-001', descripcion: 'Item X', cajas: 1, unidades: 2, precio: 10 },
  { id: 'uuid-2', codigo: 'Y-002', descripcion: 'Item Y', cajas: 1, unidades: 1, precio: 15 },
];

async function abrirEdicionYcambiarPrecio(nuevoPrecio: string) {
  await waitFor(() => expect(screen.getByText('X-001')).toBeInTheDocument());
  const editButtons = screen.getAllByRole('button', { name: /editar/i });
  fireEvent.click(editButtons[0]);
  // Input de precio (el spinbutton con valor inicial 10 de uuid-1)
  await waitFor(() => {
    const precioInput = screen.getAllByRole('spinbutton').find(inp => (inp as HTMLInputElement).value === '10');
    expect(precioInput).toBeTruthy();
  });
  const precioInput = screen.getAllByRole('spinbutton').find(inp => (inp as HTMLInputElement).value === '10')!;
  fireEvent.change(precioInput, { target: { value: nuevoPrecio } });
  fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
}

describe('handleGuardar — modo offline (BUG patrón eliminarItem)', () => {
  beforeEach(() => {
    offlineFlag = true;
    jest.clearAllMocks();
    dbItems = itemsIniciales();
    global.fetch = fetchMock as any;
  });

  // R1: ítem local sin sync a Neon (PATCH remoto daría 404) → se muta DB local,
  //     NO se dispara fetch PATCH.
  it('R1: offline, ítem local sin sync → db.execute(UPDATE) y sin fetch PATCH', async () => {
    patchStatus = 404; // simula que el ítem aún no llegó a Neon
    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);
    await abrirEdicionYcambiarPrecio('12');

    await waitFor(() => {
      expect(dbMock.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE prenota_items'),
        [1, 2, 12, 'uuid-1']
      );
    });
    const patchCalls = (global.fetch as jest.Mock).mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/items/') && (c[1] as any)?.method === 'PATCH'
    );
    expect(patchCalls.length).toBe(0);
  });

  // R2: tras guardar offline, la réplica local se actualiza (UI refleja el cambio).
  it('R2: offline, tras guardar la réplica local refleja el precio nuevo', async () => {
    patchStatus = 200; // ya sincronizado
    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);
    await abrirEdicionYcambiarPrecio('12');

    await waitFor(() => {
      expect(dbMock.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE prenota_items'),
        [1, 2, 12, 'uuid-1']
      );
    });
    // El ítem sale de edición y la réplica local quedó con precio 12.
    expect(dbItems[0].precio).toBe(12);
    await waitFor(() => {
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    });
  });
});

describe('handleGuardar — modo online (no-regresión)', () => {
  beforeEach(() => {
    offlineFlag = false;
    jest.clearAllMocks();
    dbItems = itemsIniciales();
    global.fetch = fetchMock as any;
    patchStatus = 200;
  });

  // R3: online mantiene el fetch(PATCH) remoto.
  it('R3: con offline off, guardar mantiene el fetch(PATCH) remoto', async () => {
    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);
    await abrirEdicionYcambiarPrecio('12');

    await waitFor(() => {
      const patchCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('/items/') && (c[1] as any)?.method === 'PATCH'
      );
      expect(patchCalls.length).toBe(1);
    });
  });
});
