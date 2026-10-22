/**
 * Fase B — Slice 18b: Test de comportamiento real contra race condition.
 *
 * Verifica que al escribir rapido, AbortController cancela la request anterior
 * y el usuario ve el resultado de su busqueda mas reciente.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgregarANotaVentaModal } from '@/components/AgregarANotaVentaModal';

const abortSpy = jest.spyOn(AbortController.prototype, 'abort');
const originalFetch = global.fetch;

beforeEach(() => {
  jest.useFakeTimers();
  abortSpy.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
});

describe('AgregarANotaVentaModal — race condition', () => {
  test('AbortController cancela busqueda vieja y muestra resultado mas reciente', async () => {
    // Mock inicial: prenotas fetch (no nos importa, devuelve vacio)
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) } as Response)
    ) as any;

    render(
      <AgregarANotaVentaModal
        open={true}
        onClose={jest.fn()}
        producto={{ id: 1, codigo: 'X', detalle: 'T', prcventa: 10, imagen_url: null, empresa_id: 1, cantcaja: 1, saldo: 5, prcminimo: 8 } as any}
      />
    );
    await waitFor(() => screen.getByText('Agregar a Nota de Venta'));
    jest.advanceTimersByTime(100); // resolver fetch inicial de prenotas

    // Mock de fetch que devuelve resultados segun el query
    const marResult = [{ id: 2, nombre: 'Mar-Result', telefono: null }];
    const mariResult = [{ id: 3, nombre: 'Mari-Result', telefono: '555' }];
    let callCount = 0;
    global.fetch = jest.fn((_input: any, init?: { signal?: AbortSignal }) => {
      callCount++;
      const { signal } = init || {};
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
          } else if (callCount === 1) {
            resolve({ ok: true, json: () => Promise.resolve({ data: marResult }) } as Response);
          } else {
            resolve({ ok: true, json: () => Promise.resolve({ data: mariResult }) } as Response);
          }
        }, 50);
      });
    }) as any;

    const input = screen.getByPlaceholderText(/buscar cliente/i);

    // Escribir "Mar" y adelantar solo hasta que el fetch se DISPARE (no resuelva)
    fireEvent.change(input, { target: { value: 'Mar' } });
    jest.advanceTimersByTime(220);
    expect(callCount).toBe(1);
    expect(abortSpy).not.toHaveBeenCalled();

    // Escribir "Mari" ANTES de que la primera request resuelva
    fireEvent.change(input, { target: { value: 'Mari' } });

    // abort() debe haberse llamado (cancelando la request de "Mar")
    expect(abortSpy).toHaveBeenCalledTimes(1);

    // Avanzar timers y esperar que React procese los updates
    jest.advanceTimersByTime(1000);
    jest.useRealTimers();
    await new Promise(r => setTimeout(r, 100)); // flush React
    jest.useFakeTimers();

    // Verificar: 2 llamadas a fetch, solo el resultado mas reciente visible
    expect(callCount).toBe(2);

    // El resultado visible debe ser "Mari-Result" (busqueda mas reciente)
    // "Mar-Result" NO debe aparecer (fue abortado antes de resolver)
    expect(screen.getByText('Mari-Result')).toBeInTheDocument();
    expect(screen.queryByText('Mar-Result')).not.toBeInTheDocument();
  });
});
