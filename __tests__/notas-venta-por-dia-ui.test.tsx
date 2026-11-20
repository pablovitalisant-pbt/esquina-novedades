/**
 * @jest-environment jsdom
 *
 * FASE B — S3: separador por día en la lista de notas de venta (flag on).
 * Riesgos cubiertos: 3 (cada nota una vez), 4 (anuladas), 5 (singular),
 * 6 (total), 8 (vacío), 9 (SSR sin encabezados), 11 (regresión Pagar).
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({ 'notas-venta-por-dia': true }),
);
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/PagarNotaDialog', () => ({
  PagarNotaDialog: ({ notaId, open }: any) =>
    open ? require('react').createElement('div', { 'data-testid': 'pagar-dialog' }, `nota ${notaId}`) : null,
}));

import { PrenotasPage } from '@/app/(app)/notas-venta/client_page';

const session = { user: { id: '1', rol: 'admin' } };

type Nota = Record<string, any>;
const A: Nota = { id: 3, titulo: 'Nota A', created_at: '2026-11-20T14:00:00.000Z', total: 7000, total_pagado: 0, saldo_pendiente: 7000, estado: 'activa' };
const B: Nota = { id: 2, titulo: 'Nota B', created_at: '2026-11-20T03:30:00.000Z', total: 5000, total_pagado: 0, saldo_pendiente: 0, estado: 'activa' };
const C: Nota = { id: 1, titulo: 'Nota C', created_at: '2026-11-20T02:30:00.000Z', total: 3000, total_pagado: 0, saldo_pendiente: 3000, estado: 'activa' };
const D: Nota = { id: 4, titulo: 'Nota D', created_at: '2026-11-19T15:00:00.000Z', total: 1000, total_pagado: 0, saldo_pendiente: 1000, estado: 'anulada' };

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

function serve(data: Nota[]) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data }) });
}

const texto = (el: HTMLElement) => (el.textContent || '').replace(/\s/g, ' ');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('lista de notas agrupada por día', () => {
  test('separador: "<día> · N notas · $total" con día calendario chileno', async () => {
    serve([A, B, C, D]);
    render(<PrenotasPage session={session} />);

    const dia20 = await screen.findByTestId('dia-2026-11-20');
    const dia19 = screen.getByTestId('dia-2026-11-19');

    expect(texto(dia20)).toContain('Viernes 20 de noviembre · 2 notas · $12.000');
    // risk 5: singular; risk 4: la anulada no se cuenta ni suma (1000 excluido)
    expect(texto(dia19)).toContain('Jueves 19 de noviembre · 1 nota · $3.000');
  });

  test('riesgo 3/4: cada fila aparece exactamente una vez, incluida la anulada visible', async () => {
    serve([A, B, C, D]);
    render(<PrenotasPage session={session} />);
    await screen.findByTestId('dia-2026-11-20');

    for (const id of [1, 2, 3, 4]) {
      expect(screen.getAllByTestId(`nota-row-${id}`)).toHaveLength(1);
    }
    // La anulada está en la sección del 19, no en la del 20.
    const seccion20 = screen.getByTestId('dia-2026-11-20').closest('section')!;
    const seccion19 = screen.getByTestId('dia-2026-11-19').closest('section')!;
    expect(seccion20.querySelector('[data-testid="nota-row-4"]')).toBeNull();
    expect(seccion19.querySelector('[data-testid="nota-row-4"]')).not.toBeNull();
  });

  test('riesgo 6/1: 23:30 y 00:30 quedan en días separados', async () => {
    serve([B, C]);
    render(<PrenotasPage session={session} />);
    const dia20 = await screen.findByTestId('dia-2026-11-20');
    const dia19 = screen.getByTestId('dia-2026-11-19');
    expect(dia20.closest('section')!.querySelector('[data-testid="nota-row-2"]')).not.toBeNull();
    expect(dia19.closest('section')!.querySelector('[data-testid="nota-row-1"]')).not.toBeNull();
  });

  test('riesgo 8: lista vacía mantiene "No hay notas de venta" y ningún separador', async () => {
    serve([]);
    render(<PrenotasPage session={session} />);
    await screen.findByText('No hay notas de venta');
    expect(screen.queryByTestId(/^dia-/)).toBeNull();
  });

  test('riesgo 11: el botón Pagar sigue abriendo el diálogo de la nota correcta', async () => {
    serve([A, C]);
    render(<PrenotasPage session={session} />);
    await screen.findByTestId('dia-2026-11-19');

    fireEvent.click(screen.getAllByRole('button', { name: /pagar/i })[1]); // C (id=1)
    await waitFor(() => {
      expect(screen.getByTestId('pagar-dialog')).toHaveTextContent('nota 1');
    });
  });

  test('riesgo 9: el render de servidor no imprime encabezados de día (hidratación)', () => {
    const html = renderToString(<PrenotasPage session={session} />);
    expect(html).not.toMatch(/dia-\d{4}-\d{2}-\d{2}/);
    expect(html).not.toMatch(/de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/);
  });
});
