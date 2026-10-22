/**
 * Test — Slice Deudores WhatsApp.
 * Fase B: intenta romper el slice.
 * 1. Botón deshabilitado cuando telefono es '', null o undefined.
 * 2. Botón habilitado y window.open con teléfono limpio (sin no-dígitos).
 * 3. Mensaje decodificado preserva nombre, monto formateado y títulos (tildes, #).
 * 4. Smoke E2E: tabla con 1 deudor con teléfono → click → window.open una vez.
 */

import { render, screen, within, fireEvent } from '@testing-library/react';
import { DeudoresClient } from '@/app/(app)/deudores/client_page';

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('lucide-react', () => {
  const Mock = (p: any) => <span data-testid={`icon-${p.name}`} />;
  return { MessageCircle: (p: any) => <span data-testid="icon-whatsapp" /> };
});

const fetchMock = jest.fn((url: string) => {
  if (url === '/api/deudores') {
    return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
  }
  return Promise.resolve({ ok: true, json: async () => ({ data: { valor: '0' } }) });
});
global.fetch = fetchMock as any;

const openSpy = jest.fn();
window.open = openSpy as any;

const deudorConTel = {
  cliente_id: '1',
  cliente_nombre: 'Juana Pérez',
  telefono: '591 712-34567',
  num_notas: 1,
  deuda_total: 1450.0,
  notas: [{ id: 12, titulo: 'Nota de Venta #12' }],
  deuda_mas_antigua: '2026-07-01T00:00:00.000Z',
};

const renderCon = (deudores: any[]) => {
  fetchMock.mockImplementation((url: string) => {
    if (url === '/api/deudores') {
      return Promise.resolve({ ok: true, json: async () => ({ data: deudores }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: { valor: '0' } }) });
  });
  return render(<DeudoresClient session={{ user: { role: 'admin' } }} />);
};

describe('DeudoresClient — botón WhatsApp', () => {
  beforeEach(() => {
    openSpy.mockClear();
    fetchMock.mockClear();
  });

  test('TEST 1: botón deshabilitado cuando telefono es vacío/null/undefined', async () => {
    for (const tel of ['', null, undefined]) {
      const d = { ...deudorConTel, telefono: tel };
      const { unmount } = renderCon([d]);
      const row = await screen.findByText('Juana Pérez').then(el => el.closest('tr')!);
      const btn = within(row).getByTestId('btn-whatsapp');
      expect(btn).toBeDisabled();
      unmount();
    }
  });

  test('TEST 2: botón habilitado y window.open con teléfono limpio', async () => {
    renderCon([deudorConTel]);
    const row = await screen.findByText('Juana Pérez').then(el => el.closest('tr')!);
    const btn = within(row).getByTestId('btn-whatsapp');
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = openSpy.mock.calls[0][0] as string;
    expect(url.startsWith('https://wa.me/59171234567?text=')).toBe(true);
  });

  test('TEST 3: mensaje decodificado preserva nombre, monto y títulos', async () => {
    renderCon([deudorConTel]);
    const row = await screen.findByText('Juana Pérez').then(el => el.closest('tr')!);
    fireEvent.click(within(row).getByTestId('btn-whatsapp'));
    const url = openSpy.mock.calls[0][0] as string;
    const msg = decodeURIComponent(url.split('?text=')[1]);
    expect(msg).toContain('Juana Pérez');
    expect(msg).toContain('$1.450');
    expect(msg).toContain('Nota de Venta #12');
  });

  test('TEST 4: smoke E2E — click abre nueva pestaña una vez', async () => {
    renderCon([deudorConTel]);
    const row = await screen.findByText('Juana Pérez').then(el => el.closest('tr')!);
    const btn = within(row).getByTestId('btn-whatsapp');
    fireEvent.click(btn);
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][1]).toBe('_blank');
  });
});
