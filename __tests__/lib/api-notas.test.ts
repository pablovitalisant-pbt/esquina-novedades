/**
 * Fase B — A18: helpers compartidos para armar notas de venta (lib/api-notas).
 * Red de seguridad del POS y del modal: mismo payload, mismos errores.
 */
import { agregarItem, crearNota, ErrorNota } from '@/lib/api-notas';

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const originalFetch = global.fetch;

/** Asigna un fetch mockeado para el test en curso. */
function setFetch(impl: (url: string, init?: { body?: string }) => Promise<unknown>) {
  const fn = jest.fn(impl);
  global.fetch = fn as any;
  return fn;
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe('crearNota', () => {
  it('sin cliente envia {} al endpoint y devuelve el id como string', async () => {
    const fetchMock = setFetch(async () => json({ id: 55 }));

    await expect(crearNota()).resolves.toBe('55');
    expect(fetchMock).toHaveBeenCalledWith('/api/notas-venta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  });

  it('con cliente envia solo cliente_id (mismo orden de claves)', async () => {
    const fetchMock = setFetch(async () => json({ id: 9 }));

    await crearNota('u-meson');

    expect((fetchMock.mock.calls[0][1] as { body: string }).body).toBe('{"cliente_id":"u-meson"}');
  });

  it('con verificarOk: lanza ErrorNota en respuesta no-ok (POS)', async () => {
    setFetch(async () => json({ error: 'No autorizado' }, 401));

    const err = await crearNota(7, { verificarOk: true }).catch(e => e);
    expect(err).toBeInstanceOf(ErrorNota);
  });

  it('sin verificarOk no corta en no-ok (comportamiento heredado del modal)', async () => {
    setFetch(async () => json({}, 500));

    await expect(crearNota()).resolves.toBe('undefined');
  });

  it('propaga el error de red', async () => {
    setFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(crearNota()).rejects.toThrow('Failed to fetch');
  });
});

describe('agregarItem', () => {
  it('envia el payload exacto (incluido precio) al endpoint indicado', async () => {
    const fetchMock = setFetch(async () => json({ id: 'it-1' }));
    const payload = {
      codigo: 'ABC123',
      descripcion: 'Producto Test',
      imagen_url: null,
      empresa_id: 2,
      unidades: 3,
      precio: 150,
      modalidad: 'mayor',
      stock_referencia: 10,
    };

    await expect(agregarItem(7, payload)).resolves.toEqual({ id: 'it-1' });

    expect(fetchMock).toHaveBeenCalledWith('/api/notas-venta/7/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect((fetchMock.mock.calls[0][1] as { body: string }).body).toBe(
      '{"codigo":"ABC123","descripcion":"Producto Test","imagen_url":null,"empresa_id":2,' +
        '"unidades":3,"precio":150,"modalidad":"mayor","stock_referencia":10}'
    );
  });

  it('sin precio en el payload no agrega la clave (POS)', async () => {
    const fetchMock = setFetch(async () => json({ id: 'x' }));
    const payload = {
      codigo: 'ABC123',
      descripcion: 'Producto Test',
      imagen_url: null,
      empresa_id: 2,
      unidades: 1,
      modalidad: 'detalle',
      stock_referencia: 10,
    };

    await agregarItem(7, payload);

    expect((fetchMock.mock.calls[0][1] as { body: string }).body).not.toContain('precio');
  });

  it('error HTTP: lanza ErrorNota con el mensaje del servidor', async () => {
    setFetch(async () => json({ error: 'Stock insuficiente' }, 400));

    const err = await agregarItem(7, { codigo: 'X' }).catch(e => e);
    expect(err).toBeInstanceOf(ErrorNota);
    expect(err.message).toBe('Stock insuficiente');
  });

  it('error HTTP sin mensaje: ErrorNota con message vacio', async () => {
    setFetch(async () => json({}, 500));

    const err = await agregarItem(7, { codigo: 'X' }).catch(e => e);
    expect(err).toBeInstanceOf(ErrorNota);
    expect(err.message).toBe('');
  });

  it('error de red: propaga el error original (no ErrorNota)', async () => {
    setFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    const err = await agregarItem(7, { codigo: 'X' }).catch(e => e);
    expect(err).not.toBeInstanceOf(ErrorNota);
    expect(err).toBeInstanceOf(TypeError);
  });
});
