/**
 * Fase B — Ciclo pedido festivo: confetti al confirmar la compra.
 * Intenta romper: ángulos/esquinas equivocados o ignorar "reducir movimiento".
 */
import { render, waitFor } from '@testing-library/react';

const mockConfetti = jest.fn();
jest.mock('canvas-confetti', () => ({ __esModule: true, default: (...a: any[]) => mockConfetti(...a) }));

import { ConfettiCompra } from '@/components/ConfettiCompra';

beforeEach(() => mockConfetti.mockReset());

test('dispara desde las dos esquinas inferiores hacia arriba en 45° y respeta reduced motion', async () => {
  render(<ConfettiCompra />);
  await waitFor(() => expect(mockConfetti).toHaveBeenCalledTimes(2));
  const opciones = mockConfetti.mock.calls.map((c) => c[0]);
  expect(opciones).toEqual(expect.arrayContaining([
    expect.objectContaining({ angle: 45, origin: { x: 0, y: 1 }, disableForReducedMotion: true }),
    expect.objectContaining({ angle: 135, origin: { x: 1, y: 1 }, disableForReducedMotion: true }),
  ]));
});

test('renderiza solo un marcador oculto (sin contenido visible que pueda desalinear el SSR)', () => {
  const { container } = render(<ConfettiCompra />);
  const marcador = container.querySelector('[data-confetti]');
  expect(marcador).not.toBeNull();
  expect(marcador?.hasAttribute('hidden')).toBe(true);
  expect(container.textContent).toBe('');
});