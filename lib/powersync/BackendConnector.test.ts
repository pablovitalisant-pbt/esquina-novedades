/**
 * @jest-environment node
 */
import { BackendConnector } from './BackendConnector';

const toastError = jest.fn();
jest.mock('sonner', () => ({ toast: { error: (...args: any[]) => toastError(...args) } }));

// Flag mutable para el reporte de conflictos (Slice 9b). El getter lee
// globalThis.__reporteConflicto en tiempo de ejecución de uploadData.
jest.mock('@/config/feature-flags.json', () => ({
  get 'sync-conflictos-reporte'() {
    return (globalThis as any).__reporteConflicto === true;
  },
}));

const fetchMock = jest.fn();
global.fetch = fetchMock as any;

function makeTransaction(opData: Record<string, any>, codigo: string | undefined) {
  return {
    crud: [{ id: 'row-1', op: 'PATCH', table: 'ubicaciones_bodega', opData }],
    complete: jest.fn().mockResolvedValue(undefined),
  };
}

function makePrenotaTx(opData: Record<string, any>) {
  return {
    crud: [{ id: 'uuid-item-1', op: 'PUT', table: 'prenota_items', opData }],
    complete: jest.fn().mockResolvedValue(undefined),
  };
}

const PRENOTA_OP_DATA = {
  prenota_id: 40, codigo: 'A-001', descripcion: 'Producto A', imagen_url: null,
  empresa_id: 1, cajas: 1, unidades: 2, precio: 10, stock_referencia: 5,
};

const CAJA_OP_DATA = {
  fecha: '2026-08-01', tipo: 'cobro', kcodcli2: 5, nombre_cliente: 'X', cuenta_id: 1,
  moneda: 'ARS', monto: 1000, tipo_cambio: 980, forma_pago: 'efectivo', observaciones: null,
  empresa: 'bazar-naty', es_credito: false, usuario_id: 1, usuario_nombre: 'Admin',
};

function makeCajaTx(opData: Record<string, any>) {
  return {
    crud: [{ id: 'mov-uuid', op: 'PUT', table: 'caja_movimientos', opData }],
    complete: jest.fn().mockResolvedValue(undefined),
  };
}

function makeTx(op: string, table: string, opData: Record<string, any>, id: string = 'id-1') {
  return {
    crud: [{ id, op, table, opData }],
    complete: jest.fn().mockResolvedValue(undefined),
  };
}

function makeDb(tx: any, codigo: string | undefined) {
  return {
    getNextCrudTransaction: jest.fn().mockResolvedValue(tx),
    get: jest.fn().mockResolvedValue(codigo !== undefined ? { codigo } : { codigo: undefined }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).__reporteConflicto = false;
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
});

describe('BackendConnector.uploadData', () => {
  it('hace PUT a /api/ubicaciones/codigo/{codigo} con el payload de opData y completa la tx', async () => {
    const opData = { ubicacion: 'B2', fisico_cajas: 3, fisico_unidades: 2, observaciones: 'x' };
    const tx = makeTransaction(opData, 'GL81203-4');
    const db = makeDb(tx, 'GL81203-4');
    const connector = new BackendConnector();

    await connector.uploadData(db as any);

    expect(db.get).toHaveBeenCalledWith(
      'SELECT codigo FROM ubicaciones_bodega WHERE id = ?',
      ['row-1']
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ubicaciones/codigo/GL81203-4',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ubicacion: 'B2',
          fisico_cajas: 3,
          fisico_unidades: 2,
          observaciones: 'x',
        }),
      })
    );
    expect(tx.complete).toHaveBeenCalled();
  });

  it('defensa: fila sin codigo se salta sin romper y completa la transacción', async () => {
    const tx = makeTransaction({ ubicacion: 'B2' }, undefined);
    const db = makeDb(tx, undefined);
    const connector = new BackendConnector();

    await connector.uploadData(db as any);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(tx.complete).toHaveBeenCalled();
  });

  it('no hace nada si no hay transacción pendiente', async () => {
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(null) };
    const connector = new BackendConnector();

    await connector.uploadData(db as any);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('NO completa la transacción cuando fetch lanza excepción de red (reintento automático)', async () => {
    const tx = makeTransaction({ ubicacion: 'B2' }, 'GL81203-4');
    const db = makeDb(tx, 'GL81203-4');
    const connector = new BackendConnector();
    fetchMock.mockRejectedValue(new TypeError('ERR_INTERNET_DISCONNECTED'));

    await expect(connector.uploadData(db as any)).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalled();
    expect(tx.complete).not.toHaveBeenCalled();
  });

  it('NO completa la transacción ante un 500 (reintentable)', async () => {
    const tx = makeTransaction({ ubicacion: 'B2' }, 'GL81203-4');
    const db = makeDb(tx, 'GL81203-4');
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(connector.uploadData(db as any)).rejects.toThrow();

    expect(tx.complete).not.toHaveBeenCalled();
  });

  it('completa ante un 400 y NO reporta conflicto si el flag está en false (default)', async () => {
    const tx = makeTransaction({ ubicacion: 'B2' }, 'GL81203-4');
    const db = makeDb(tx, 'GL81203-4');
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'x' }) });

    await connector.uploadData(db as any);

    expect(tx.complete).toHaveBeenCalled();
    // solo la llamada PUT a /api/ubicaciones; ningún POST a /api/sync-conflictos
    const postConflicto = fetchMock.mock.calls.filter((c: any[]) => c[0] === '/api/sync-conflictos');
    expect(postConflicto.length).toBe(0);
  });

  it('flag en true: reporta el conflicto a POST /api/sync-conflictos y completa', async () => {
    (globalThis as any).__reporteConflicto = true;
    const opData = { ubicacion: 'B2', fisico_cajas: 3 };
    const tx = makeTransaction(opData, 'GL81203-4');
    const db = makeDb(tx, 'GL81203-4');
    const connector = new BackendConnector();

    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/ubicaciones/codigo/')) {
        return { ok: false, status: 400, json: async () => ({ error: 'Producto no encontrado' }) } as Response;
      }
      return { ok: true, status: 201, json: async () => ({}) } as Response;
    });

    await connector.uploadData(db as any);

    expect(tx.complete).toHaveBeenCalled();
    const postConflicto = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
    expect(postConflicto.length).toBe(1);
    const body = JSON.parse(postConflicto[0][1].body);
    expect(body.tabla).toBe('ubicaciones_bodega');
    expect(body.operacion).toBe('PATCH');
    expect(body.entidad_id).toBe('GL81203-4');
    expect(body.payload).toEqual(opData);
    expect(body.http_status).toBe(400);
    expect(body.error_mensaje).toBe('Producto no encontrado');
  });

  it('flag en true + fallo del POST del conflicto: completa igual (reporte silencioso)', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makeTransaction({ ubicacion: 'B2' }, 'GL81203-4');
    const db = makeDb(tx, 'GL81203-4');
    const connector = new BackendConnector();

    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/ubicaciones/codigo/')) {
        return { ok: false, status: 400, json: async () => ({ error: 'x' }) } as Response;
      }
      throw new TypeError('ERR_INTERNET_DISCONNECTED'); // el POST del conflicto falla
    });

    await expect(connector.uploadData(db as any)).resolves.toBeUndefined();
    expect(tx.complete).toHaveBeenCalled(); // el reporte falló pero NO rompió el flujo
  });

  // ─── Slice 10b: escritura offline de prenota_items ───
  it('prenota_items: POST a /api/notas-venta/{prenota_id}/items con id local y completa', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makePrenotaTx(PRENOTA_OP_DATA);
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await connector.uploadData(db as any);

    const post = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/notas-venta/40/items');
    expect(post).toBeDefined();
    const body = JSON.parse(post[1].body);
    expect(body.id).toBe('uuid-item-1');
    expect(body.codigo).toBe('A-001');
    expect(body.unidades).toBe(2);
    expect(tx.complete).toHaveBeenCalled();
  });

  it('prenota_items 400 (stock insuficiente): reporta conflicto y completa', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makePrenotaTx(PRENOTA_OP_DATA);
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Stock insuficiente' }) });

    await connector.uploadData(db as any);

    expect(tx.complete).toHaveBeenCalled();
    const report = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
    expect(report.length).toBe(1);
    const body = JSON.parse(report[0][1].body);
    expect(body.tabla).toBe('prenota_items');
    expect(body.http_status).toBe(400);
    expect(body.error_mensaje).toBe('Stock insuficiente');
    // BUG-umed-corrupto: el usuario debe enterarse — antes se descartaba en silencio.
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][0])).toMatch(/Producto A/);
  });

  it('prenota_items 404 (nota no encontrada) y 422 (nota anulada): reporta y completa', async () => {
    for (const status of [404, 422]) {
      (globalThis as any).__reporteConflicto = true;
      const tx = makePrenotaTx(PRENOTA_OP_DATA);
      const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
      const connector = new BackendConnector();
      fetchMock.mockClear();
      fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ error: 'x' }) });

      toastError.mockClear();
      await connector.uploadData(db as any);
      expect(tx.complete).toHaveBeenCalled();
      const report = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
      expect(report.length).toBe(1);
      expect(JSON.parse(report[0][1].body).http_status).toBe(status);
      expect(toastError).toHaveBeenCalledTimes(1);
    }
  });

  it('prenota_items 500 (reintentable): NO completa y no reporta', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makePrenotaTx(PRENOTA_OP_DATA);
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(connector.uploadData(db as any)).rejects.toThrow();
    expect(tx.complete).not.toHaveBeenCalled();
    const report = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
    expect(report.length).toBe(0);
  });

  it('prenota_items excepción de red: NO completa (reintento)', async () => {
    const tx = makePrenotaTx(PRENOTA_OP_DATA);
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockRejectedValue(new TypeError('ERR_INTERNET_DISCONNECTED'));

    await expect(connector.uploadData(db as any)).rejects.toThrow();
    expect(tx.complete).not.toHaveBeenCalled();
  });

  // ─── Slice 11b: escritura offline de Caja Mayor ───
  it('caja_movimientos: POST /api/caja/movimientos con id + tipo_cambio_capturado y completa', async () => {
    const tx = makeCajaTx(CAJA_OP_DATA);
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await connector.uploadData(db as any);

    const post = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/caja/movimientos');
    expect(post).toBeDefined();
    const body = JSON.parse(post[1].body);
    expect(body.id).toBe('mov-uuid');
    expect(body.moneda).toBe('ARS');
    expect(body.tipo_cambio_capturado).toBe(980); // Opción B: captura el tipo de cambio
    expect(tx.complete).toHaveBeenCalled();
  });

  it('caja_movimientos 422: reporta conflicto y completa', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makeCajaTx(CAJA_OP_DATA);
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: 'x' }) });

    await connector.uploadData(db as any);
    expect(tx.complete).toHaveBeenCalled();
    const report = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
    expect(report.length).toBe(1);
    expect(JSON.parse(report[0][1].body).http_status).toBe(422);
  });

  it('caja_movimientos + caja_movimiento_notas: sube mov y luego notas, completa', async () => {
    const tx = {
      crud: [
        { id: 'mov-uuid', op: 'PUT', table: 'caja_movimientos', opData: CAJA_OP_DATA },
        { id: 'cmn-1', op: 'PUT', table: 'caja_movimiento_notas', opData: { movimiento_id: 'mov-uuid', prenota_id: 40, monto_aplicado: 500 } },
      ],
      complete: jest.fn().mockResolvedValue(undefined),
    };
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await connector.uploadData(db as any);

    const movPost = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/caja/movimientos');
    const notasPost = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/caja/movimientos/mov-uuid/notas');
    expect(movPost.length).toBe(1);
    expect(notasPost.length).toBe(1);
    expect(JSON.parse(notasPost[0][1].body).notas).toEqual([{ prenota_id: 40, monto_aplicado: 500 }]);
    expect(tx.complete).toHaveBeenCalled();
  });

  it('retry-safety: mov sube pero notas falla con 500 → NO completa (reintento, no duplica por ON CONFLICT)', async () => {
    const tx = {
      crud: [
        { id: 'mov-uuid', op: 'PUT', table: 'caja_movimientos', opData: CAJA_OP_DATA },
        { id: 'cmn-1', op: 'PUT', table: 'caja_movimiento_notas', opData: { movimiento_id: 'mov-uuid', prenota_id: 40, monto_aplicado: 500 } },
      ],
      complete: jest.fn().mockResolvedValue(undefined),
    };
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url === '/api/caja/movimientos') return { ok: true, status: 201 } as Response;
      return { ok: false, status: 500 } as Response; // notas falla → reintento
    });

    await expect(connector.uploadData(db as any)).rejects.toThrow();
    expect(tx.complete).not.toHaveBeenCalled();
  });

  // ─── Slice 12: escritura offline de Categorías ───
  it('categorias PUT: POST /api/categorias con id local y completa', async () => {
    const tx = makeTx('PUT', 'categorias', { nombre: 'Nueva' }, 'cat-uuid-1');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await connector.uploadData(db as any);

    const post = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/categorias');
    expect(post).toBeDefined();
    const body = JSON.parse(post[1].body);
    expect(body.id).toBe('cat-uuid-1');
    expect(body.nombre).toBe('Nueva');
    expect(tx.complete).toHaveBeenCalled();
  });

  it('categorias PUT 400 (nombre duplicado): reporta conflicto y completa', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makeTx('PUT', 'categorias', { nombre: 'Dupe' });
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Ya existe' }) });

    await connector.uploadData(db as any);
    expect(tx.complete).toHaveBeenCalled();
    const report = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
    expect(report.length).toBe(1);
    expect(JSON.parse(report[0][1].body).http_status).toBe(400);
  });

  it('categorias DELETE: DELETE /api/categorias/{id} y completa', async () => {
    const tx = makeTx('DELETE', 'categorias', {}, 'cat-uuid-1');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await connector.uploadData(db as any);

    const del = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/categorias/cat-uuid-1' && c[1]?.method === 'DELETE');
    expect(del).toBeDefined();
    expect(tx.complete).toHaveBeenCalled();
  });

  it('categorias DELETE 404 (convergencia): descarta SIN reportar conflicto', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makeTx('DELETE', 'categorias', {}, 'cat-uuid-1');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await connector.uploadData(db as any);
    expect(tx.complete).toHaveBeenCalled();
    const report = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
    expect(report.length).toBe(0); // convergencia, no es un conflicto
  });

  it('productos PATCH: PUT /api/productos/{id} con solo {categoria} y completa', async () => {
    const tx = makeTx('PATCH', 'productos', { categoria: 'Nueva' }, '5');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await connector.uploadData(db as any);

    const put = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/productos/5' && c[1]?.method === 'PUT');
    expect(put).toBeDefined();
    expect(JSON.parse(put[1].body)).toEqual({ categoria: 'Nueva' }); // solo la columna que cambió
    expect(tx.complete).toHaveBeenCalled();
  });

  it('productos PATCH 400 (categoria no válida): reporta conflicto y completa', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makeTx('PATCH', 'productos', { categoria: 'NoExiste' }, '5');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Categoria no valida' }) });

    await connector.uploadData(db as any);
    expect(tx.complete).toHaveBeenCalled();
    const report = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
    expect(report.length).toBe(1);
    expect(JSON.parse(report[0][1].body).http_status).toBe(400);
  });

  // ─── Slice 14: anular nota offline ───
  it('prenotas PATCH: DELETE /api/notas-venta/{id} y completa', async () => {
    const tx = makeTx('PATCH', 'prenotas', { estado: 'anulada' }, '40');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await connector.uploadData(db as any);

    const del = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/notas-venta/40' && c[1]?.method === 'DELETE');
    expect(del).toBeDefined();
    expect(tx.complete).toHaveBeenCalled();
  });

  it('prenotas PATCH 409 (pago registrado): reporta conflicto y completa', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makeTx('PATCH', 'prenotas', { estado: 'anulada' }, '40');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'PAGO_REGISTRADO' }) });

    await connector.uploadData(db as any);
    expect(tx.complete).toHaveBeenCalled();
    const report = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
    expect(report.length).toBe(1);
    expect(JSON.parse(report[0][1].body).http_status).toBe(409);
  });

  it('prenotas PATCH 404 (ya anulada): descarta SIN reportar (convergencia)', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makeTx('PATCH', 'prenotas', { estado: 'anulada' }, '40');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await connector.uploadData(db as any);
    expect(tx.complete).toHaveBeenCalled();
    const report = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
    expect(report.length).toBe(0); // convergencia, no es un conflicto
  });

  it('prenotas PATCH 500: NO completa (reintento)', async () => {
    const tx = makeTx('PATCH', 'prenotas', { estado: 'anulada' }, '40');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(connector.uploadData(db as any)).rejects.toThrow();
    expect(tx.complete).not.toHaveBeenCalled();
  });

  // ─── Slice 13b: escritura offline de Clientes ───
  it('clientes PUT: POST /api/clientes con id local y completa', async () => {
    const tx = makeTx('PUT', 'clientes', { nombre: 'Juan', telefono: null, direccion: 'X', notas: null }, 'cli-uuid-1');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await connector.uploadData(db as any);

    const post = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/clientes' && c[1]?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(post[1].body);
    expect(body.id).toBe('cli-uuid-1');
    expect(body.nombre).toBe('Juan');
    expect(tx.complete).toHaveBeenCalled();
  });

  it('clientes PATCH: PATCH /api/clientes/{id} con solo columnas cambiadas', async () => {
    const tx = makeTx('PATCH', 'clientes', { telefono: '123' }, 'cli-uuid-1'); // opData parcial
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await connector.uploadData(db as any);

    const patch = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/clientes/cli-uuid-1' && c[1]?.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(JSON.parse(patch[1].body)).toEqual({ telefono: '123' }); // solo la columna que cambió
    expect(tx.complete).toHaveBeenCalled();
  });

  it('clientes DELETE: DELETE /api/clientes/{id} y completa', async () => {
    const tx = makeTx('DELETE', 'clientes', {}, 'cli-uuid-1');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await connector.uploadData(db as any);

    const del = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/clientes/cli-uuid-1' && c[1]?.method === 'DELETE');
    expect(del).toBeDefined();
    expect(tx.complete).toHaveBeenCalled();
  });

  it('clientes DELETE 404: descarta SIN reportar (convergencia)', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makeTx('DELETE', 'clientes', {}, 'cli-uuid-1');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await connector.uploadData(db as any);
    expect(tx.complete).toHaveBeenCalled();
    const report = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
    expect(report.length).toBe(0);
  });

  it('clientes DELETE 409 (carrera: se creó nota entre chequeo y sync): reporta conflicto', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makeTx('DELETE', 'clientes', {}, 'cli-uuid-1');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'notas asociadas' }) });

    await connector.uploadData(db as any);
    expect(tx.complete).toHaveBeenCalled();
    const report = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
    expect(report.length).toBe(1);
    expect(JSON.parse(report[0][1].body).http_status).toBe(409);
  });

  // ─── Slice 15: fix productos PATCH (opData completo) + alertas de stock ───
  it('productos PATCH (categoria, Slice 12): tras el fix sigue mandando {categoria} y completa', async () => {
    const tx = makeTx('PATCH', 'productos', { categoria: 'Nueva' }, '5');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await connector.uploadData(db as any);
    const put = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/productos/5' && c[1]?.method === 'PUT');
    expect(put).toBeDefined();
    expect(JSON.parse(put[1].body)).toEqual({ categoria: 'Nueva' });
    expect(tx.complete).toHaveBeenCalled();
  });

  it('productos PATCH (no_reponer, Slice 15): manda {no_reponer} (opData completo), no {categoria}', async () => {
    const tx = makeTx('PATCH', 'productos', { no_reponer: 1 }, '5');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await connector.uploadData(db as any);
    const put = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/productos/5' && c[1]?.method === 'PUT');
    expect(put).toBeDefined();
    expect(JSON.parse(put[1].body)).toEqual({ no_reponer: 1 }); // fix: ya no manda {categoria: undefined}
    expect(tx.complete).toHaveBeenCalled();
  });

  it('alertas_stock_bajo PUT: PUT /api/alertas-stock/{producto_id} con accion=ignorar y completa', async () => {
    const tx = makeTx('PUT', 'alertas_stock_bajo', { producto_id: '5' }, 'alerta-1');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await connector.uploadData(db as any);
    const put = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/alertas-stock/5' && c[1]?.method === 'PUT');
    expect(put).toBeDefined();
    expect(JSON.parse(put[1].body)).toEqual({ accion: 'ignorar' });
    expect(tx.complete).toHaveBeenCalled();
  });

  it('alertas_stock_bajo PUT 500: NO completa (reintento)', async () => {
    const tx = makeTx('PUT', 'alertas_stock_bajo', { producto_id: '5' }, 'alerta-1');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(connector.uploadData(db as any)).rejects.toThrow();
    expect(tx.complete).not.toHaveBeenCalled();
  });

  // ─── Slice 17: Config de Caja offline ───
  it('caja_config PATCH: POST /api/caja/config con dolar_dia y completa', async () => {
    const tx = makeTx('PATCH', 'caja_config', { valor: '980.5' }, 'dolar_dia');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await connector.uploadData(db as any);
    const post = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/caja/config' && c[1]?.method === 'POST');
    expect(post).toBeDefined();
    expect(JSON.parse(post[1].body)).toEqual({ dolar_dia: 980.5 });
    expect(tx.complete).toHaveBeenCalled();
  });

  it('caja_cuentas PATCH: PATCH con activa convertida a boolean y completa', async () => {
    const tx = makeTx('PATCH', 'caja_cuentas', { activa: 1, nombre: 'Caja chica' }, '3');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await connector.uploadData(db as any);
    const patch = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/caja/cuentas/3' && c[1]?.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(JSON.parse(patch[1].body)).toEqual({ activa: true, nombre: 'Caja chica' }); // activa 0/1 → boolean
    expect(tx.complete).toHaveBeenCalled();
  });

  it('caja_cuentas PATCH 409 (R4 tiene movimientos): reporta conflicto y completa', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makeTx('PATCH', 'caja_cuentas', { activa: 0 }, '3');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'tiene movimientos' }) });

    await connector.uploadData(db as any);
    expect(tx.complete).toHaveBeenCalled();
    const report = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
    expect(report.length).toBe(1);
    expect(JSON.parse(report[0][1].body).http_status).toBe(409);
  });

  it('caja_saldos_iniciales PATCH: POST con cuenta_id/fecha/saldo/observaciones y completa', async () => {
    const tx = makeTx('PATCH', 'caja_saldos_iniciales', { cuenta_id: 1, fecha: '2026-01-01', saldo: '100', observaciones: 'x' }, '9');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await connector.uploadData(db as any);
    const post = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/caja/saldos-iniciales' && c[1]?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(post[1].body);
    expect(body.cuenta_id).toBe(1); // Number() del opData
    expect(body.saldo).toBe(100);
    expect(body.observaciones).toBe('x');
    expect(tx.complete).toHaveBeenCalled();
  });

  it('caja_saldos_iniciales DELETE: DELETE /api/caja/saldos-iniciales/{id} y completa', async () => {
    const tx = makeTx('DELETE', 'caja_saldos_iniciales', {}, '9');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await connector.uploadData(db as any);
    const del = fetchMock.mock.calls.find((c: any[]) => String(c[0]) === '/api/caja/saldos-iniciales/9' && c[1]?.method === 'DELETE');
    expect(del).toBeDefined();
    expect(tx.complete).toHaveBeenCalled();
  });

  it('caja_saldos_iniciales DELETE 404: descarta SIN reportar (convergencia)', async () => {
    (globalThis as any).__reporteConflicto = true;
    const tx = makeTx('DELETE', 'caja_saldos_iniciales', {}, '9');
    const db = { getNextCrudTransaction: jest.fn().mockResolvedValue(tx) };
    const connector = new BackendConnector();
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await connector.uploadData(db as any);
    expect(tx.complete).toHaveBeenCalled();
    const report = fetchMock.mock.calls.filter((c: any[]) => String(c[0]) === '/api/sync-conflictos');
    expect(report.length).toBe(0);
  });
});
