/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PrenotasPage } from './client_page';

// dbMock se lee por referencia en tiempo de render (no TDZ en factories hoisted).
var dbMock: any;

jest.mock('@powersync/react', () => ({
  usePowerSync: () => dbMock,
  PowerSyncContext: { Provider: ({ children }: any) => children },
}));

jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));

jest.mock('@/config/feature-flags.json', () => ({
  get 'notas-venta-offline-lectura'() {
    return (globalThis as any).__notasOffline === true;
  },
}));

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/PagarNotaDialog', () => ({ PagarNotaDialog: () => null }));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).__notasOffline = false;
  dbMock = { getAll: jest.fn().mockResolvedValue([]) };
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
});

describe('app/(app)/notas-venta — notas-venta-offline-lectura (regresión)', () => {
  it('flag en false (default): usa fetch a /api/notas-venta, NO getAll local', async () => {
    render(<PrenotasPage session={{ user: { id: '1', rol: 'admin' } }} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/notas-venta');
    expect(dbMock.getAll).not.toHaveBeenCalled();
  });

  it('flag en true: usa la query local vía getAll SIN filtro por usuario (compartida) y NO fetch', async () => {
    (globalThis as any).__notasOffline = true;
    render(<PrenotasPage session={{ user: { id: '7', rol: 'vendedor' } }} />);
    await waitFor(() => expect(dbMock.getAll).toHaveBeenCalled());
    const sql = dbMock.getAll.mock.calls[0][0] as string;
    expect(sql).toContain('FROM prenotas p');
    expect(sql).toContain('prenota_items pi');
    expect(sql).toContain('caja_movimiento_notas cmn');
    expect(sql).toContain("p.estado != 'anulada'");
    expect(sql).not.toContain('p.usuario_id'); // notas compartidas: sin filtro de dueño
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flag en true: anular usa db.get (chequeo pago) + db.execute (UPDATE estado), NO fetch DELETE', async () => {
    (globalThis as any).__notasOffline = true;
    dbMock.getAll.mockResolvedValue([{ id: 40, titulo: 'Nota #1', created_at: '2026-08-01', total: 100, total_pagado: 0, saldo_pendiente: 100, estado: 'activa' }]);
    dbMock.get = jest.fn().mockResolvedValue({ total: 0 });
    dbMock.execute = jest.fn().mockResolvedValue(undefined);
    global.confirm = jest.fn(() => true) as any;

    render(<PrenotasPage session={{ user: { id: '1', rol: 'admin' } }} />);
    await screen.findByText('Nota #1');
    fireEvent.click(screen.getByText('Anular'));

    await waitFor(() => expect(dbMock.execute).toHaveBeenCalled());
    const sql = dbMock.execute.mock.calls[0][0] as string;
    expect(sql).toContain("UPDATE prenotas SET estado = 'anulada'");
    // NO genera op de stock (solo muta prenotas.estado) y NO hace fetch DELETE
    expect(sql).not.toContain('UPDATE productos');
    const del = fetchMock.mock.calls.filter((c: any[]) => String(c[0]).includes('/api/notas-venta/40') && c[1]?.method === 'DELETE');
    expect(del.length).toBe(0);
  });
});
