/**
 * Fase B — Slice Usuarios single-tenant + RUT → Documento de identidad.
 * Tests contra el CONTRATO OBJETIVO (Fase A).
 * DEBEN estar en ROJO ahora y en VERDE en Fase C.
 *
 * Contrato objetivo:
 * 1. POST /api/admin/usuarios: sin validación de `empresas`, hardcodea empresa_id=1
 * 2. PUT /api/admin/usuarios/[id]: DELETE+INSERT incondicional, ignora `empresas` del body
 * 3. Sin cambios en GET ni DELETE
 *
 * Riesgos testeados:
 * - POST sin empresas → el contrato lo permite, el código actual lo rechaza (400)
 * - PUT sin empresas → el contrato hace DELETE+INSERT incondicional, el actual es condicional
 * - PUT con INSERT post-DELETE fallido → usuario huérfano (riesgo documentado, no corregido)
 *
 * @jest-environment node
 */

const getServerSession = jest.fn();
const sqlMock = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => getServerSession(...args),
}));

jest.mock('@/lib/db', () => ({
  sql: (...args: any[]) => sqlMock(...args),
}));

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

let GET: typeof import('@/app/api/admin/usuarios/route').GET;
let POST: typeof import('@/app/api/admin/usuarios/route').POST;
let PUT: typeof import('@/app/api/admin/usuarios/[id]/route').PUT;
let DELETE: typeof import('@/app/api/admin/usuarios/[id]/route').DELETE;

beforeAll(async () => {
  if (typeof (global as any).Request === 'undefined') {
    (global as any).Request = class Request {};
  }
  if (typeof (global as any).Response === 'undefined') {
    (global as any).Response = class Response {};
  }
  const routeMod = await import('@/app/api/admin/usuarios/route');
  GET = routeMod.GET;
  POST = routeMod.POST;
  const idMod = await import('@/app/api/admin/usuarios/[id]/route');
  PUT = idMod.PUT;
  DELETE = idMod.DELETE;
});

beforeEach(() => {
  sqlMock.mockClear();
  getServerSession.mockClear();
});

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function mockAdminSession() {
  getServerSession.mockResolvedValue({
    user: { id: 1, rol: 'admin', empresas: [1] },
  });
}

// ---------------------------------------------------------------------------
// GET /api/admin/usuarios
// ---------------------------------------------------------------------------

describe('GET /api/admin/usuarios', () => {
  test('devuelve lista de usuarios con sus empresas', async () => {
    mockAdminSession();
    sqlMock.mockResolvedValueOnce([
      { id: 1, rut: '12345678', nombre: 'Admin', rol: 'admin', activo: true, created_at: '2026-01-01' },
    ]);
    sqlMock.mockResolvedValueOnce([
      { usuario_id: 1, empresa_id: 1 },
    ]);

    const req = {} as Request;
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 1, nombre: 'Admin' });
    expect(body.data[0].empresas).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/usuarios
// ---------------------------------------------------------------------------

describe('POST /api/admin/usuarios', () => {

  // NOTA: las credenciales se usan para el hash con bcrypt, mockeamos el
  // resultado del INSERT en usuarios y del INSERT en usuario_empresa.
  // bcrypt NO se mockea — se usa la implementación real (el hash se descarta).

  test('TEST 1 (ROJO — debe fallar ahora): crea usuario sin enviar campo empresas', async () => {
    // Contrato objetivo: POST ya no requiere `empresas` en el body.
    // Código actual: rechaza con 400 si no hay `empresas`.
    // Este test DEBE estar ROJO ahora y VERDE en Fase C.
    mockAdminSession();
    sqlMock.mockResolvedValueOnce([
      { id: 2, rut: '87654321', nombre: 'Nuevo Vendedor', rol: 'vendedor', activo: true },
    ]);
    sqlMock.mockResolvedValueOnce(undefined); // INSERT INTO usuario_empresa

    const req = {
      json: async () => ({ rut: '87654321', nombre: 'Nuevo Vendedor', password: 'test123', rol: 'vendedor' }),
    } as Request;

    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.empresas).toEqual([1]);
  });

  test('TEST 2 (ROJO — debe fallar ahora): crea usuario con empresas: [] vacío', async () => {
    // Contrato objetivo: array vacío ya no se rechaza, backend hardcodea [1].
    // Código actual: rechaza con 400 (empresas.length === 0).
    // Este test DEBE estar ROJO ahora y VERDE en Fase C.
    mockAdminSession();
    sqlMock.mockResolvedValueOnce([
      { id: 3, rut: '11223344', nombre: 'Otro Usuario', rol: 'vendedor', activo: true },
    ]);
    sqlMock.mockResolvedValueOnce(undefined);

    const req = {
      json: async () => ({ rut: '11223344', nombre: 'Otro Usuario', password: 'test123', rol: 'vendedor', empresas: [] }),
    } as Request;

    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.empresas).toEqual([1]);
  });

  test('rechaza POST sin rut (validación de campos requeridos se mantiene)', async () => {
    // Solo se elimina la validación de empresas — los demás campos siguen siendo requeridos.
    mockAdminSession();

    const req = {
      json: async () => ({ nombre: 'Sin RUT', password: 'test123', rol: 'vendedor' }),
    } as Request;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/admin/usuarios/[id]
// ---------------------------------------------------------------------------

describe('PUT /api/admin/usuarios/[id]', () => {

  // -----------------------------------------------------------------------
  // Helper: verifica que sqlMock recibió llamadas en el orden esperado.
  // El PUT actual del contrato (Fase C) genera esta secuencia para un body
  // con { rut, nombre } (sin password ni activo):
  //   [0] UPDATE rut
  //   [1] UPDATE nombre
  //   [2] UPDATE updated_at
  //   [3] DELETE FROM usuario_empresa
  //   [4] INSERT INTO usuario_empresa (uid, 1)
  // -----------------------------------------------------------------------

  test('TEST 3 (ROJO — debe fallar ahora): PUT sin empresas mantiene asociación via hardcodeo', async () => {
    // Contrato objetivo: el PUT SIEMPRE hace DELETE + INSERT con empresa_id=1,
    // independientemente de si `empresas` está en el body.
    // Código actual: solo hace DELETE+INSERT si `empresas` viene en el body.
    // Sin `empresas` en el body actual, solo se ejecutan 3 UPDATEs.
    mockAdminSession();
    // mockResolvedValueOnce encola en secuencia — sin "Once" sobreescribiría el default
    sqlMock.mockResolvedValueOnce(undefined); // [0] UPDATE rut
    sqlMock.mockResolvedValueOnce(undefined); // [1] UPDATE nombre
    sqlMock.mockResolvedValueOnce(undefined); // [2] UPDATE updated_at
    // Las siguientes llamadas (DELETE + INSERT) solo ocurrirán en Fase C.
    // Con el código actual, no se ejecutan → el test falla en las aserciones de abajo.
    sqlMock.mockResolvedValueOnce(undefined); // [3] DELETE FROM usuario_empresa
    sqlMock.mockResolvedValueOnce(undefined); // [4] INSERT INTO usuario_empresa

    const req = {
      json: async () => ({ rut: '99999999', nombre: 'Nombre Actualizado' }),
    } as Request;

    const res = await PUT(req, { params: Promise.resolve({ id: '2' }) });

    // Con código actual: 200 (sin DELETE+INSERT). Con contrato: 200 (con DELETE+INSERT).
    expect(res.status).toBe(200);

    // Verifica que se llamó a DELETE + INSERT en usuario_empresa
    const calls = sqlMock.mock.calls;
    const callStrings = calls.map(c => String(c[0]).replace(/\n/g, ' '));

    const hasDelete = callStrings.some(s => s.includes('DELETE FROM usuario_empresa'));
    const hasInsert = callStrings.some(s => s.includes('INSERT INTO usuario_empresa'));

    // ROJO ahora: código actual no ejecuta DELETE+INSERT sin `empresas` en el body
    expect(hasDelete).toBe(true);
    expect(hasInsert).toBe(true);
  });

  test('TEST 4 (ROJO — debe fallar ahora): PUT ignora empresas del body, hardcodea empresa_id=1', async () => {
    // Contrato objetivo: aunque el cliente envíe empresas: [99], el backend
    // ignora el valor y hardcodea empresa_id=1 en un solo INSERT.
    // Código actual: itera sobre `empresas` del body y las inserta tal cual
    // → 2 INSERTs con empresa_id=99 y 100, no 1 INSERT con empresa_id=1.
    mockAdminSession();
    sqlMock.mockResolvedValueOnce(undefined); // [0] UPDATE rut
    sqlMock.mockResolvedValueOnce(undefined); // [1] UPDATE nombre
    sqlMock.mockResolvedValueOnce(undefined); // [2] UPDATE updated_at
    sqlMock.mockResolvedValueOnce(undefined); // [3] DELETE FROM usuario_empresa
    sqlMock.mockResolvedValueOnce(undefined); // [4] INSERT INTO usuario_empresa (uid, 1)

    const req = {
      json: async () => ({ rut: '88888888', nombre: 'Con Empresas Falsas', empresas: [99, 100] }),
    } as Request;

    const res = await PUT(req, { params: Promise.resolve({ id: '3' }) });

    expect(res.status).toBe(200);

    // Busca TODOS los INSERTs a usuario_empresa (código actual genera 2, contrato 1)
    const calls = sqlMock.mock.calls;
    const insertCalls = calls.filter(c => String(c[0]).includes('INSERT INTO usuario_empresa'));

    // Contrato: exactamente 1 INSERT
    expect(insertCalls.length).toBe(1);

    // Ese único INSERT debe usar empresa_id=1 hardcodeado en el SQL (literal, no interpolado)
    const insertCall = insertCalls[0];
    // insertCall[1] = uid (interpolado con ${uid}); empresa_id=1 es literal en el string SQL
    expect(insertCall[1]).toBe(3);    // uid = 3 (params.id)
    const sqlString = String(insertCall[0]);
    expect(sqlString).toContain(', 1)');  // empresa_id=1 hardcodeado, no interpolado

    // VERDE ahora: contrato implementado — 1 INSERT con empresa_id=1 literal
  });

  test('TEST 5 (RIESGO DOCUMENTADO): INSERT post-DELETE falla → usuario queda huérfano', async () => {
    // Este test documenta el riesgo identificado en Fase B §1.1:
    // Si el DELETE tiene éxito pero el INSERT falla, el usuario queda sin
    // ninguna fila en usuario_empresa → empresas: [] → no puede acceder a nada.
    //
    // El handler NO tiene transacción ni rollback. Este test verifica que el
    // error se propaga (el caller recibe 500), pero NO corrige la orfandad —
    // el DELETE ya ocurrió y no se revierte.
    //
    // Si en el futuro se agrega BEGIN/COMMIT, este test debe actualizarse
    // para verificar que el DELETE también se revierte.
    //
    // Secuencia mockeada (post-Fase C, body sin `empresas`):
    //   [0] UPDATE rut           → OK
    //   [1] UPDATE nombre        → OK
    //   [2] UPDATE updated_at    → OK
    //   [3] DELETE usuario_empresa → OK
    //   [4] INSERT usuario_empresa → RECHAZA (DB connection lost)
    mockAdminSession();
    sqlMock.mockResolvedValueOnce(undefined);                              // [0] UPDATE rut
    sqlMock.mockResolvedValueOnce(undefined);                              // [1] UPDATE nombre
    sqlMock.mockResolvedValueOnce(undefined);                              // [2] UPDATE updated_at
    sqlMock.mockResolvedValueOnce(undefined);                              // [3] DELETE — ÉXITO
    sqlMock.mockRejectedValueOnce(new Error('DB connection lost'));        // [4] INSERT — FALLA

    const req = {
      json: async () => ({ rut: '77777777', nombre: 'Usuario Huérfano' }),
    } as Request;

    const res = await PUT(req, { params: Promise.resolve({ id: '4' }) });

    // ROJO ahora (motivo correcto): código actual no ejecuta DELETE+INSERT
    // sin `empresas` en el body → retorna 200, no 500. Tras Fase C, el
    // DELETE+INSERT incondicional sí se ejecuta → INSERT rechaza → 500.
    expect(res.status).toBe(500);

    // Verifica que el DELETE sí se ejecutó antes del fallo
    const calls = sqlMock.mock.calls;
    const deleteCall = calls.find(c => String(c[0]).includes('DELETE FROM usuario_empresa'));
    expect(deleteCall).toBeDefined();

    // Verifica el orden: DELETE (índice 3) ocurrió, INSERT (índice 4) también fue llamado
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(String(calls[3][0])).toContain('DELETE FROM usuario_empresa');
    expect(String(calls[4][0])).toContain('INSERT INTO usuario_empresa');

    // El usuario 4 ya no tiene usuario_empresa en la DB real.
    // Riesgo aceptado — documentado en docs/slices/usuarios-single-tenant-fase-b.md §1.1.
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/usuarios/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/usuarios/[id]', () => {
  test('admin puede eliminar otro usuario', async () => {
    mockAdminSession();
    sqlMock.mockResolvedValueOnce(undefined); // DELETE FROM usuario_empresa
    sqlMock.mockResolvedValueOnce(undefined); // DELETE FROM usuarios

    const req = {} as Request;
    const res = await DELETE(req, { params: Promise.resolve({ id: '5' }) });

    expect(res.status).toBe(200);
  });

  test('no puede eliminarse a sí mismo', async () => {
    mockAdminSession();

    const req = {} as Request;
    const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) }); // mismo id que session.user.id

    expect(res.status).toBe(400);
  });
});
