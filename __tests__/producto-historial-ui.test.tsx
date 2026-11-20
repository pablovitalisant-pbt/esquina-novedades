/**
 * @jest-environment jsdom
 *
 * Fase B — S2b: pantalla /bodega/historial (UI).
 *
 * Riesgos: R14 el buscador espera 2 letras y no dispara por tecla; R15 el
 * saldo acumulado de la lista cierra en el stock real y las filas con efecto
 * 0 no lo alteran. Además: flag y rol, resumen en palabras simples, caso
 * JS-1640, enlace de nota, zona horaria, truncado, error de API sin romper
 * y botón Historial en BodegaCard.
 */
import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { HistorialClient } from '@/app/(app)/bodega/historial/client_page';
import Page from '@/app/(app)/bodega/historial/page';
import { BodegaClient } from '@/app/(app)/bodega/client_page';
import { BodegaCard } from '@/components/BodegaCard';

const mockReplace = jest.fn();
const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockReplace }),
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error('NEXT_REDIRECT');
  },
}));

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next/image', () => ({ __esModule: true, default: (p: any) => <img {...p} /> }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: any) => <div>{children}</div>,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
  SheetDescription: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({ 'producto-historial': true }),
);

const flags = jest.requireMock('@/config/feature-flags.json') as Record<string, boolean>;
const { getServerSession } = jest.requireMock('next-auth') as { getServerSession: jest.Mock };

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fallo = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) });

const m = (over: Record<string, unknown>) => ({
  fecha: '2026-11-03T15:00:00.000Z',
  tipo: 'venta',
  cantidad: -1,
  efecto: -1,
  detalle: 'Nota de Venta',
  usuario: 'Paola',
  referencia: null,
  estado: 'activa',
  inferido: false,
  queda: 0,
  ...over,
});

// La API devuelve del más reciente al más antiguo. `queda` viene calculado en
// el servidor anclado en el saldo actual (0).
const API_JS1640 = {
  producto: { codigo: 'JS-1640', detalle: 'Set de prueba', saldo: 0, cantcaja: 12, fecha_ingreso: '2026-10-30T14:22:05.000Z' },
  movimientos: [
    m({ fecha: '2026-11-18T18:00:00.000Z', tipo: 'conciliacion', cantidad: -11, efecto: -11, detalle: 'Conteo físico', referencia: { tipo: 'conciliacion', id: 7, href: null }, estado: null, queda: 0 }),
    m({ fecha: '2026-11-08T09:40:00.000Z', tipo: 'reserva', cantidad: -2, efecto: 0, detalle: 'Pedido online', usuario: null, estado: 'expirado', referencia: { tipo: 'pedido', id: 'uuid-1', href: null }, queda: 11 }),
    m({ fecha: '2026-11-06T18:00:00.000Z', cantidad: -4, efecto: 0, estado: 'anulada', referencia: { tipo: 'nota', id: 16, href: '/notas-venta/16' }, queda: 11 }),
    m({ fecha: '2026-11-05T17:00:00.000Z', cantidad: -10, efecto: -10, referencia: { tipo: 'nota', id: 15, href: '/notas-venta/15' }, queda: 11 }),
    m({ fecha: '2026-11-04T16:00:00.000Z', cantidad: -10, efecto: -10, referencia: { tipo: 'nota', id: 14, href: '/notas-venta/14' }, queda: 21 }),
    m({ fecha: '2026-11-03T15:00:00.000Z', referencia: { tipo: 'nota', id: 13, href: '/notas-venta/13' }, queda: 31 }),
    m({ fecha: '2026-11-02T16:10:00.000Z', cantidad: -8, efecto: -8, referencia: { tipo: 'nota', id: 12, href: '/notas-venta/12' }, queda: 32 }),
    m({ fecha: '2026-10-30T14:22:05.000Z', tipo: 'stock_inicial', cantidad: 40, efecto: 40, detalle: 'Stock al crear el producto (sin registro de ingreso): 40', usuario: null, estado: 'inferido', inferido: true, queda: 40 }),
  ],
  resumen: { ingresado: 0, ajustes: -11, vendido: 29, reservado: 0, stock_inicial_inferido: 40, stock_esperado: 0, saldo_actual: 0, diferencia: 0, truncado: false },
};

const BUSQUEDA = [{ codigo: 'JS-1640', detalle: 'Set de prueba', saldo: 0 }];
const UBI = { codigo: 'P001', detalle: 'Producto prueba', producto_imagen_url: null, empresa_id: 1, saldo: 100, cantcaja: 10, umed: 'u', fisico: null, fisico_cajas: null, fisico_unidades: null, diferencia: null, ubicacion: 'A1', observaciones: null };

function montar(historial: unknown = API_JS1640, codigo = 'JS-1640') {
  const fetchMock = jest.fn(async (input: any) => {
    const url = String(input);
    if (url.includes('/historial')) return historial instanceof Error ? Promise.reject(historial) : ok(historial);
    if (url.startsWith('/api/productos?search=')) return ok({ data: BUSQUEDA });
    if (url.startsWith('/api/ubicaciones?')) return ok({ data: [UBI] });
    throw new Error(`fetch inesperado: ${url}`);
  });
  (global.fetch as jest.Mock) = fetchMock;
  render(<HistorialClient codigoInicial={codigo} />);
  return fetchMock;
}

const llamadas = (mock: jest.Mock, parte: string) =>
  mock.mock.calls.filter((c) => String(c[0]).includes(parte));

beforeEach(() => {
  jest.clearAllMocks();
  flags['producto-historial'] = true;
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('/bodega/historial — guarda del servidor', () => {
  const pagina = async () => {
    try {
      return await Page({ searchParams: Promise.resolve({ codigo: 'JS-1640' }) });
    } catch (err) {
      if (String((err as Error)?.message).includes('NEXT_REDIRECT')) return undefined;
      throw err;
    }
  };

  it('flag apagado → redirect a /bodega sin montar la pantalla', async () => {
    flags['producto-historial'] = false;
    getServerSession.mockResolvedValue({ user: { rol: 'admin' } });
    expect(await pagina()).toBeUndefined();
    expect(mockRedirect).toHaveBeenCalledWith('/bodega');
  });

  it('vendedor y bodeguero → redirect a /bodega', async () => {
    for (const rol of ['vendedor', 'bodeguero']) {
      mockRedirect.mockClear();
      getServerSession.mockResolvedValue({ user: { rol } });
      await pagina();
      expect(mockRedirect).toHaveBeenCalledWith('/bodega');
    }
  });

  it('sin sesión → /login; admin con flag → monta con el código de la URL', async () => {
    getServerSession.mockResolvedValue(null);
    await pagina();
    expect(mockRedirect).toHaveBeenCalledWith('/login');

    mockRedirect.mockClear();
    getServerSession.mockResolvedValue({ user: { rol: 'admin' } });
    const el = (await pagina()) as any;
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(el.props.codigoInicial).toBe('JS-1640');
  });
});

describe('buscador (R14)', () => {
  beforeEach(() => jest.useFakeTimers());

  it('no busca con 1 letra, ni antes del debounce; con 2 letras consulta una vez', async () => {
    const fetchMock = montar(API_JS1640, '');
    const input = screen.getByPlaceholderText(/buscar código o descripción/i);

    fireEvent.change(input, { target: { value: 'J' } });
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(llamadas(fetchMock, '/api/productos?search=')).toHaveLength(0);

    fireEvent.change(input, { target: { value: 'JS' } });
    await act(async () => { jest.advanceTimersByTime(100); });
    expect(llamadas(fetchMock, '/api/productos?search=')).toHaveLength(0);
    await act(async () => { jest.advanceTimersByTime(100); });
    expect(llamadas(fetchMock, '/api/productos?search=')).toHaveLength(1);
    expect(String(llamadas(fetchMock, '/api/productos?search=')[0][0])).toContain('search=JS');
  });

  it('al elegir un resultado pone ?codigo= en la URL y carga el historial', async () => {
    const fetchMock = montar(API_JS1640, '');
    fireEvent.change(screen.getByPlaceholderText(/buscar código o descripción/i), { target: { value: 'JS' } });
    await act(async () => { jest.advanceTimersByTime(200); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /JS-1640/ })); });

    expect(mockReplace).toHaveBeenCalledWith('/bodega/historial?codigo=JS-1640');
    expect(llamadas(fetchMock, '/historial')).toHaveLength(1);
    expect(String(llamadas(fetchMock, '/historial')[0][0])).toBe('/api/productos/JS-1640/historial');
  });
});

describe('resumen en palabras simples', () => {
  it('muestra entradas, ventas, ajustes, reservas y stock del sistema', async () => {
    montar();
    await screen.findAllByTestId('movimiento');
    expect(screen.getByTestId('resumen-entraron')).toHaveTextContent('40');
    expect(screen.getByTestId('resumen-vendido')).toHaveTextContent('29');
    expect(screen.getByTestId('resumen-ajustes')).toHaveTextContent('-11');
    expect(screen.getByTestId('resumen-reservado')).toHaveTextContent('0');
    expect(screen.getByTestId('resumen-stock')).toHaveTextContent('0');
  });

  it('con diferencia distinta de 0 muestra un aviso visible con el número', async () => {
    montar({ ...API_JS1640, resumen: { ...API_JS1640.resumen, diferencia: -8 } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/diferencia de -8 unidades/i);
  });

  it('con diferencia 0 no muestra el aviso', async () => {
    montar();
    await screen.findAllByTestId('movimiento');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('lista descendente con saldo hacia atrás (R15)', () => {
  it('caso JS-1640: la fila más reciente deja el saldo actual y la lista cierra en 40', async () => {
    montar();
    const filas = await screen.findAllByTestId('movimiento');
    expect(filas).toHaveLength(8);
    expect(within(filas[0]).getByText(/Ajuste de conteo/)).toBeInTheDocument();
    expect(within(filas[filas.length - 1]).getByText(/Stock inicial \(sin registro\)/)).toBeInTheDocument();

    // "queda" viene del servidor (hacia atrás desde el saldo actual), no se
    // recalcula en la UI.
    const quedas = filas.map((f) => f.textContent?.match(/queda (-?\d+)/)?.[1]);
    expect(quedas).toEqual(['0', '11', '11', '11', '21', '31', '32', '40']);
  });

  it('con truncado, la primera fila (la más reciente) muestra el saldo actual', async () => {
    montar({ ...API_JS1640, resumen: { ...API_JS1640.resumen, stock_inicial_inferido: null, stock_esperado: null, diferencia: null, truncado: true } });
    const filas = await screen.findAllByTestId('movimiento');
    expect(filas[0]).toHaveTextContent('queda 0');
    expect(screen.getByTestId('resumen-stock')).toHaveTextContent('0');
  });

  it('fila anulada atenuada, con motivo y sin alterar el saldo', async () => {
    montar();
    const filas = await screen.findAllByTestId('movimiento');
    const anulada = filas[2];
    expect(within(anulada).getByText('Venta anulada')).toBeInTheDocument();
    expect(anulada.className).toMatch(/opacity-\d+/);
    expect(within(anulada).getByText(/no cuenta/i)).toBeInTheDocument();
    expect(anulada).toHaveTextContent('queda 11');
    expect(filas[3]).toHaveTextContent('queda 11');
  });

  it('"Ver nota" apunta a /notas-venta/:id; un pedido no tiene enlace', async () => {
    montar();
    const filas = await screen.findAllByTestId('movimiento');
    expect(within(filas[6]).getByRole('link', { name: 'Ver nota' })).toHaveAttribute('href', '/notas-venta/12');
    expect(within(filas[1]).queryByRole('link')).toBeNull();
  });

  it('fecha y hora en America/Santiago', async () => {
    const spy = jest.spyOn(Date.prototype, 'toLocaleString');
    montar();
    await screen.findAllByTestId('movimiento');
    const opciones = spy.mock.calls.map((c: any[]) => c[1]).filter((o: any) => o?.timeZone);
    expect(opciones.some((o: any) => o.timeZone === 'America/Santiago')).toBe(true);
    expect(screen.getByText('02 nov 2026, 13:10')).toBeInTheDocument();
  });

  it('truncado: aviso de los 500 más recientes sin inventar stock inicial', async () => {
    montar({ ...API_JS1640, resumen: { ...API_JS1640.resumen, stock_inicial_inferido: null, stock_esperado: null, diferencia: null, truncado: true } });
    expect(await screen.findByText('Mostrando los 500 movimientos más recientes')).toBeInTheDocument();
    expect(screen.getByTestId('resumen-entraron')).toHaveTextContent('0');
    expect(screen.getByTestId('resumen-stock')).toHaveTextContent('0');
  });

  it('truncado: subtítulo sobre los parciales y Stock en el sistema es el total real', async () => {
    montar({
      ...API_JS1640,
      resumen: {
        ingresado: 120, ajustes: -3, vendido: 60, reservado: 2,
        stock_inicial_inferido: null, stock_esperado: null, saldo_actual: 57,
        diferencia: null, truncado: true,
      },
    });
    expect(await screen.findByTestId('resumen-subtitulo')).toHaveTextContent('En los 500 movimientos más recientes');
    expect(screen.getByTestId('resumen-entraron')).toHaveTextContent('120');
    expect(screen.getByTestId('resumen-stock')).toHaveTextContent('57');
  });

  it('sin truncado no muestra el subtítulo de parciales', async () => {
    montar();
    await screen.findAllByTestId('movimiento');
    expect(screen.queryByTestId('resumen-subtitulo')).toBeNull();
  });

  it('error de API: mensaje claro y la pantalla sigue en pie', async () => {
    (global.fetch as jest.Mock) = jest.fn(async () => fallo(500, 'Error al leer el historial'));
    render(<HistorialClient codigoInicial="JS-1640" />);
    expect(await screen.findByText(/No se pudo cargar el historial/)).toBeInTheDocument();
    expect(screen.getByText(/Error al leer el historial/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /historial de movimientos/i })).toBeInTheDocument();
  });
});

describe('línea de usuario en cada movimiento', () => {
  it('reserva sin usuario → "Tienda online"', async () => {
    montar();
    const filas = await screen.findAllByTestId('movimiento');
    expect(within(filas[1]).getByText('Tienda online')).toBeInTheDocument();
  });

  it('stock inicial sin usuario → sin línea de usuario', async () => {
    montar();
    const filas = await screen.findAllByTestId('movimiento');
    expect(filas[7]).not.toHaveTextContent(/Sin registro|Tienda online/);
  });

  it('otros tipos con usuario null → sin línea de usuario', async () => {
    montar({
      ...API_JS1640,
      movimientos: [m({ tipo: 'conciliacion', cantidad: -1, efecto: -1, usuario: null, detalle: 'Conteo físico' })],
    });
    const fila = (await screen.findAllByTestId('movimiento'))[0];
    expect(fila).toHaveTextContent('Ajuste de conteo');
    expect(fila).not.toHaveTextContent(/Sin registro|Tienda online/);
  });

  it('con usuario registrado muestra el nombre y nunca "Sin registro"', async () => {
    montar();
    const filas = await screen.findAllByTestId('movimiento');
    expect(within(filas[6]).getByText('Paola')).toBeInTheDocument();
    expect(screen.queryByText('Sin registro')).toBeNull();
  });
});

describe('BodegaClient — enlace de cabecera a /bodega/historial', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock) = jest.fn(async () => ok({ data: [] }));
  });

  it('visible para admin con el flag encendido', () => {
    render(<BodegaClient session={{ user: { rol: 'admin' } }} />);
    expect(screen.getByRole('link', { name: /historial de un producto/i })).toHaveAttribute('href', '/bodega/historial');
  });

  it('oculto para vendedor', () => {
    render(<BodegaClient session={{ user: { rol: 'vendedor' } }} />);
    expect(screen.queryByRole('link', { name: /historial de un producto/i })).toBeNull();
  });

  it('oculto con el flag apagado', () => {
    flags['producto-historial'] = false;
    render(<BodegaClient session={{ user: { rol: 'admin' } }} />);
    expect(screen.queryByRole('link', { name: /historial de un producto/i })).toBeNull();
  });
});

describe('sin ?codigo — buscador listo', () => {
  it('enfoca el buscador y muestra el texto guía', () => {
    (global.fetch as jest.Mock) = jest.fn();
    render(<HistorialClient codigoInicial="" />);
    expect(screen.getByPlaceholderText(/buscar código o descripción/i)).toHaveFocus();
    expect(screen.getByText(/Busca un producto por código o descripción para ver todo lo que entró y salió/i)).toBeInTheDocument();
  });
});

describe('B2 — ingreso de stock inicial', () => {
  const conMovimientos = (movs: unknown[]) => ({
    producto: { ...API_JS1640.producto, saldo: 40 },
    movimientos: movs,
    resumen: {
      ingresado: 40, ajustes: 0, vendido: 0, reservado: 0,
      stock_inicial_inferido: 0, stock_esperado: 40, saldo_actual: 40,
      diferencia: 0, truncado: false,
    },
  });

  it('la fila real "Stock inicial al crear el producto" se etiqueta "Stock inicial"', async () => {
    montar(conMovimientos([
      m({ tipo: 'ingreso', cantidad: 40, efecto: 40, detalle: 'Stock inicial al crear el producto', usuario: 'Paola', estado: null, referencia: { tipo: 'ingreso', id: 9, href: null } }),
    ]));
    const filas = await screen.findAllByTestId('movimiento');
    expect(within(filas[0]).getByText(/^Stock inicial$/)).toBeInTheDocument();
    expect(within(filas[0]).queryByText(/^Ingreso$/)).toBeNull();
  });

  it('un ingreso normal sigue mostrando "Ingreso"', async () => {
    montar(conMovimientos([
      m({ tipo: 'ingreso', cantidad: 10, efecto: 10, detalle: 'Partida agosto', usuario: 'Paola', estado: null, referencia: { tipo: 'ingreso', id: 10, href: null } }),
    ]));
    const filas = await screen.findAllByTestId('movimiento');
    expect(within(filas[0]).getByText(/^Ingreso$/)).toBeInTheDocument();
  });
});

describe('BodegaCard — botón Historial', () => {
  it('solo aparece con historialHref y no abre la tarjeta al pulsarlo', () => {
    const onClick = jest.fn();
    const { rerender } = render(<BodegaCard ubicacion={UBI as any} onClick={onClick} />);
    expect(screen.queryByRole('link', { name: 'Historial' })).toBeNull();

    rerender(<BodegaCard ubicacion={UBI as any} onClick={onClick} historialHref="/bodega/historial?codigo=P001" />);
    const link = screen.getByRole('link', { name: 'Historial' });
    expect(link).toHaveAttribute('href', '/bodega/historial?codigo=P001');
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('BodegaClient lo pasa solo al admin y con el flag encendido', async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock) = jest.fn(async () => ok({ data: [UBI] }));
    const { unmount } = render(<BodegaClient session={{ user: { rol: 'admin' } }} />);
    fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: 'P0' } });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('href', '/bodega/historial?codigo=P001');
    unmount();

    for (const escenario of [
      { rol: 'admin', flag: false },
      { rol: 'vendedor', flag: true },
      { rol: 'bodeguero', flag: true },
    ]) {
      flags['producto-historial'] = escenario.flag;
      const vista = render(<BodegaClient session={{ user: { rol: escenario.rol } }} />);
      fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: 'P0' } });
      await act(async () => { jest.advanceTimersByTime(300); });
      expect(screen.queryByRole('link', { name: 'Historial' })).toBeNull();
      vista.unmount();
    }
  });
});

describe('B5 — código anterior en el historial', () => {
  const API_CON_CAMBIOS = {
    ...API_JS1640,
    producto: { ...API_JS1640.producto, codigos_anteriores: ['JS-VIEJO', 'JS-MAS-VIEJO'] },
    movimientos: [
      m({ fecha: '2026-11-03T15:00:00.000Z', codigo: null }),
      m({ fecha: '2026-11-02T16:10:00.000Z', codigo: 'JS-1640' }),
      m({ fecha: '2026-10-20T12:00:00.000Z', cantidad: 40, efecto: 40, tipo: 'ingreso', codigo: 'JS-VIEJO', detalle: 'Partida antigua', estado: null }),
    ],
  };

  it('la cabecera muestra "Antes: X, Y" cuando hubo cambios', async () => {
    montar(API_CON_CAMBIOS);
    expect(await screen.findByTestId('codigos-anteriores')).toHaveTextContent('Antes: JS-VIEJO, JS-MAS-VIEJO');
  });

  it('sin cambios no muestra la línea "Antes"', async () => {
    montar(API_JS1640);
    await screen.findAllByTestId('movimiento');
    expect(screen.queryByTestId('codigos-anteriores')).toBeNull();
  });

  it('el movimiento con código viejo se etiqueta; el actual y el nulo no', async () => {
    montar(API_CON_CAMBIOS);
    const filas = await screen.findAllByTestId('movimiento');
    expect(within(filas[2]).getByTestId('movimiento-codigo-anterior')).toHaveTextContent('JS-VIEJO');
    expect(within(filas[0]).queryByTestId('movimiento-codigo-anterior')).toBeNull();
    expect(within(filas[1]).queryByTestId('movimiento-codigo-anterior')).toBeNull();
  });
});
