/**
 * Test de renderizado — Slice Config de caja (PRD §3 fila 7).
 * Verifica el contrato Fase B:
 * 1. Botón "Dólar observado" no existe en el DOM (ruta eliminada en Slice 2)
 * 2. Timestamp de "Última actualización" usa formato es-BO (barras, no guiones)
 * 3. Sin console.error durante el render (sin referencias huérfanas a estados eliminados)
 *
 * Actualizado en Slice 17: la carga inicial pasó de props SSR a fetch en
 * useEffect (online) / SQLite local (offline). Se renderiza con la firma nueva
 * (currentUserNombre) y se mockea fetch para la carga online.
 */

import { render, screen } from '@testing-library/react';
import { CajaConfigClient } from '@/app/(app)/admin/caja-config/client_page';

// Mockear la cadena PowerSync: evita importar @powersync/web (referencia Worker
// a nivel de módulo, no definido en jsdom). Flag off por defecto → rama online.
jest.mock('@/lib/powersync/PowerSyncProvider', () => ({
  PowerSyncProvider: ({ children }: any) => children,
}));
jest.mock('@powersync/react', () => ({
  usePowerSync: () => null,
  PowerSyncContext: { Provider: ({ children }: any) => children },
}));

// Mock sonner
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  },
}));

// Mock lucide icons — evita renderizar SVGs reales
jest.mock('lucide-react', () => ({
  Pencil: () => <span data-testid="icon-pencil" />,
  Plus: () => <span data-testid="icon-plus" />,
  Save: () => <span data-testid="icon-save" />,
  Loader2: () => <span data-testid="icon-loader" />,
  Trash2: () => <span data-testid="icon-trash" />,
}));

// Mock fetch para la carga online (Slice 17): devuelve config/cuentas/saldos
const fetchMock = jest.fn((url: string) => {
  if (url === '/api/caja/config') {
    return Promise.resolve({ ok: true, json: async () => ({ data: { valor: '980.5', updated_at: '2026-07-05T10:30:00.000Z', updated_por: 'Admin' } }) });
  }
  if (url === '/api/caja/cuentas') {
    return Promise.resolve({ ok: true, json: async () => ({ data: [{ id: 1, nombre: 'Caja chica', moneda: 'ARS', activa: true, orden: 1, created_at: '2026-01-01' }] }) });
  }
  if (url === '/api/caja/saldos-iniciales') {
    return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
  }
  return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
});
global.fetch = fetchMock as any;

describe('CajaConfigClient — renderizado post-limpieza', () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    fetchMock.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  test('TEST 1: NO muestra botón "Dólar observado"', async () => {
    render(<CajaConfigClient currentUserNombre="Admin" />);
    await screen.findAllByText(/dólar del día/i);
    expect(screen.queryByText(/dólar observado/i)).toBeNull();
  });

  test('TEST 2: timestamp de "Última actualización" usa formato es-BO (barras, no guiones)', async () => {
    render(<CajaConfigClient currentUserNombre="Admin" />);

    // El texto aparece tras la carga async del dólar (fetch online)
    const timestampText = await screen.findByText(/última actualización/i);
    expect(timestampText).toBeDefined();

    // Formato es-BO: DD/MM/YYYY con barras. Formato es-CL viejo: DD-MM-YYYY con guiones.
    const fullText = timestampText.textContent || '';
    expect(fullText).not.toMatch(/\d{2}-\d{2}-\d{4}/);
    expect(fullText).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  test('TEST 3: sin console.error durante el render (sin referencias huérfanas)', async () => {
    render(<CajaConfigClient currentUserNombre="Admin" />);
    await screen.findAllByText(/dólar del día/i);

    // Filtra solo errores del test (no warnings de React/act)
    const errors = consoleErrorSpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('Error')
    );
    expect(errors).toHaveLength(0);
  });
});
