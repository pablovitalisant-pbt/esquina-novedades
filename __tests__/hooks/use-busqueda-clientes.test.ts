import { renderHook, waitFor } from '@testing-library/react';
import { useBusquedaClientes } from '@/hooks/useBusquedaClientes';

type Cliente = { id: number; nombre: string; telefono?: string | null };

function ok(data: unknown) {
  return Promise.resolve({ ok: true, json: async () => ({ data }) } as any);
}

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useBusquedaClientes', () => {
  test('debounce: escribir rápido dispara un solo fetch con la última query', async () => {
    const fetchMock = jest.fn().mockImplementation(() => ok([{ id: 1, nombre: 'Ana' }]));
    global.fetch = fetchMock as any;

    const { rerender } = renderHook(
      ({ q }: { q: string }) => useBusquedaClientes<Cliente>(q, { trim: true }),
      { initialProps: { q: 'a' } }
    );
    rerender({ q: 'ab' });
    rerender({ q: 'abc' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await esperar(250);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/clientes?q=abc', expect.anything());
  });

  test('aborta la búsqueda anterior: la respuesta tardía no pisa la nueva', async () => {
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      const vieja = url.endsWith('q=ab');
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(ok(vieja ? [{ id: 1, nombre: 'VIEJO' }] : [{ id: 2, nombre: 'NUEVO' }])),
          vieja ? 400 : 20
        );
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    });
    global.fetch = fetchMock as any;

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useBusquedaClientes<Cliente>(q),
      { initialProps: { q: 'ab' } }
    );

    await esperar(230); // la primera ya salió; respuesta "lenta" aún pendiente
    rerender({ q: 'abc' });

    await waitFor(() => expect(result.current.resultados).toEqual([{ id: 2, nombre: 'NUEVO' }]));
    await esperar(300); // si la vieja llegara tarde, pisaría el resultado
    expect(result.current.resultados).toEqual([{ id: 2, nombre: 'NUEVO' }]);
  });

  test('query corta: no hay fetch y los resultados quedan vacíos', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    const { result } = renderHook(() => useBusquedaClientes<Cliente>('a'));

    await esperar(250);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.resultados).toEqual([]);
    expect(result.current.cargando).toBe(false);
  });

  test('trim: true consulta la query recortada; trim: false la deja cruda', async () => {
    const fetchMock = jest.fn().mockImplementation(() => ok([]));
    global.fetch = fetchMock as any;

    renderHook(() => useBusquedaClientes<Cliente>('  ab ', { trim: true }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/clientes?q=ab', expect.anything()));

    fetchMock.mockClear();
    renderHook(() => useBusquedaClientes<Cliente>('  ab '));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/clientes?q=%20%20ab%20', expect.anything())
    );
  });

  test('activo: false no consulta', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    renderHook(() => useBusquedaClientes<Cliente>('ab', { activo: false }));

    await esperar(250);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('error de red: resultados vacíos, cargando false y no rompe', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('network')) as any;

    const { result } = renderHook(() => useBusquedaClientes<Cliente>('ab'));

    await waitFor(() => expect(result.current.cargando).toBe(false));
    await esperar(50);
    expect(result.current.resultados).toEqual([]);
  });
});
