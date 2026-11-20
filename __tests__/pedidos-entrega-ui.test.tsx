/**
 * @jest-environment jsdom
 *
 * Fase B — S1b: entrega de pedidos en /pedidos (UI).
 * Riesgos: doble clic, flag apagado (DOM igual), vendedor sin "Quitar",
 * zona horaria America/Santiago, sin Date.now en render, filtros combinados,
 * badge contraída/expandida, confirm cancelado y error de API sin cambio local.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PedidosPage, normalizarFechaPostgres } from '@/app/(app)/pedidos/client_page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({
    'pedidos-entrega': false,
    'pedidos-pdf': false,
    'pedido-cobro-manual': false,
    'pedidos-archivar-expirados': false,
  }),
);

jest.mock('@/lib/pdf-pedido', () => ({
  construirPdfPedido: jest.fn(),
  nombreArchivoPedido: jest.fn(),
  descargarPdf: jest.fn(),
  compartirPdfWhatsApp: jest.fn(),
}));

const flags = jest.requireMock('@/config/feature-flags.json') as Record<string, boolean>;
const { toast } = jest.requireMock('sonner') as any;

const ID = '67181656-22d3-4a80-8f63-6efc18d3d45d';
// 23:30 UTC = 20:30 en America/Santiago (UTC-3 en noviembre).
const FECHA = '2026-11-19T23:30:00Z';
const TEXTO_FECHA = '19 nov 2026, 20:30';

const PEDIDO = {
  id: ID,
  cliente: { id: 'c1', nombre: 'Pablo', telefono: '+56920948874' },
  email_contacto: 'pablo@example.com',
  origen: 'productos',
  estado: 'convertido',
  entrega_codigo: 'retiro',
  entrega_costo: 0,
  direccion_entrega: null,
  total: 5000,
  created_at: '2026-11-19T20:10:00Z',
  items: [{ codigo: '1055', detalle: 'gallinita', cantidad: 1, modalidad: 'detalle', precio: 5000, subtotal: 5000 }],
  entregado_en: null,
  entregado_por_nombre: null,
};

const entregado = { ...PEDIDO, entregado_en: FECHA, entregado_por_nombre: 'Paola' };
const conNombre = (nombre: string, extra: Record<string, unknown> = {}) => ({
  ...PEDIDO, id: `p-${nombre}`, cliente: { id: `c-${nombre}`, nombre, telefono: null }, ...extra,
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fallo = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) });

function montar(
  lista: any[] = [PEDIDO],
  session: any = { user: { rol: 'admin' } },
  responder = async () => ok({ data: { id: ID, entregado_en: FECHA, entregado_por_nombre: 'Paola' } }),
) {
  let gets = 0;
  const fetchMock = jest.fn(async (_url: string, init?: any) => {
    if (init?.method === 'PATCH') return responder();
    gets += 1;
    return ok({ data: lista });
  });
  (global.fetch as jest.Mock) = fetchMock;
  render(<PedidosPage session={session} />);
  return {
    fetchMock,
    gets: () => gets,
    patches: () => fetchMock.mock.calls.filter((c: any[]) => c[1]?.method === 'PATCH'),
  };
}

async function expandir(nombre: string) {
  await screen.findByText(nombre);
  fireEvent.click(screen.getByText(nombre));
}

const botonMarcar = () => screen.queryByRole('button', { name: /Marcar entregado|Guardando/ });

beforeEach(() => {
  jest.clearAllMocks();
  flags['pedidos-entrega'] = true;
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  flags['pedidos-entrega'] = false;
  jest.restoreAllMocks();
});

describe('flag pedidos-entrega apagado', () => {
  it('DOM sin cambios: no hay botón, badge ni filtro de entrega', async () => {
    flags['pedidos-entrega'] = false;
    montar([entregado, conNombre('Ana')]);

    await screen.findByText('Pablo');
    expect(screen.queryByText('Marcar entregado')).not.toBeInTheDocument();
    expect(screen.queryByText('Entregado')).not.toBeInTheDocument();
    expect(screen.queryByText(/Por entregar/)).not.toBeInTheDocument();
    // la vista sigue funcionando como hoy
    expect(screen.getAllByText('Convertido').length).toBeGreaterThan(0);
  });
});

describe('Marcar entregado', () => {
  it('solo en convertido/pagado sin entregar', async () => {
    montar([
      conNombre('Ana', { estado: 'convertido' }),
      conNombre('Beto', { estado: 'pagado' }),
      conNombre('Carla', { estado: 'pendiente' }),
      conNombre('Dora', { estado: 'revision' }),
    ]);
    await expandir('Ana');
    expect(screen.getAllByRole('button', { name: /Marcar entregado|Guardando/ })).toHaveLength(1);
    fireEvent.click(screen.getByText('Ana'));
    await expandir('Beto');
    expect(screen.getAllByRole('button', { name: /Marcar entregado|Guardando/ })).toHaveLength(1);
    fireEvent.click(screen.getByText('Beto'));
    await expandir('Carla');
    expect(screen.queryByRole('button', { name: /Marcar entregado|Guardando/ })).toBeNull();
    await expandir('Dora');
    expect(screen.queryByRole('button', { name: /Marcar entregado|Guardando/ })).toBeNull();
  });

  it('cancelar el confirm no envía el PATCH', async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    const { patches } = montar();
    await expandir('Pablo');

    fireEvent.click(botonMarcar()!);

    expect(window.confirm).toHaveBeenCalledWith('¿Confirmas que este pedido ya fue entregado al cliente?');
    expect(patches()).toHaveLength(0);
    expect(screen.queryByText('Entregado')).not.toBeInTheDocument();
  });

  it('doble clic: un solo PATCH, "Guardando..." y botón deshabilitado', async () => {
    let resolver!: (v: unknown) => void;
    const pendiente = new Promise((r) => { resolver = r; });
    const { patches } = montar([PEDIDO], { user: { rol: 'admin' } }, () => pendiente as any);
    await expandir('Pablo');

    const boton = botonMarcar()!;
    fireEvent.click(boton);
    fireEvent.click(boton);

    expect(await screen.findByText('Guardando...')).toBeInTheDocument();
    expect(boton).toBeDisabled();
    expect(patches()).toHaveLength(1);

    resolver(ok({ data: { id: ID, entregado_en: FECHA, entregado_por_nombre: 'Paola' } }));
    await screen.findByText('Entregado');
  });

  it('éxito: actualiza el estado local con la respuesta, sin recargar la lista', async () => {
    const { gets } = montar();
    await expandir('Pablo');

    fireEvent.click(botonMarcar()!);

    await screen.findByText('Entregado');
    expect(gets()).toBe(1); // solo el GET inicial
    expect(screen.getByText(new RegExp(`Entregado el ${TEXTO_FECHA} por Paola`))).toBeInTheDocument();
  });

  it('error de API: toast con el mensaje y sin cambio local', async () => {
    const { patches } = montar([PEDIDO], { user: { rol: 'admin' } },
      async () => fallo(409, 'El pedido no está convertido ni pagado'));
    await expandir('Pablo');

    fireEvent.click(botonMarcar()!);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('El pedido no está convertido ni pagado'));
    expect(patches()).toHaveLength(1);
    expect(screen.queryByText('Entregado')).not.toBeInTheDocument();
    expect(botonMarcar()).toBeInTheDocument();
  });
});

describe('Badge de entrega', () => {
  it('visible en la tarjeta contraída y con fecha/nombre en la expandida', async () => {
    montar([entregado]);
    // contraída: badge junto al estado
    expect(await screen.findByText('Entregado')).toBeInTheDocument();
    expect(screen.getByText('Convertido')).toBeInTheDocument();

    await expandir('Pablo');
    expect(screen.getByText(`Entregado el ${TEXTO_FECHA} por Paola`)).toBeInTheDocument();
  });

  it('formatea en America/Santiago aunque el runner esté en otra zona', async () => {
    const spy = jest.spyOn(Date.prototype, 'toLocaleString');
    montar([entregado]);
    await screen.findByText('Entregado');
    await expandir('Pablo');

    const opciones = spy.mock.calls
      .map((c: any[]) => c[1])
      .filter((o: any) => o && o.timeZone);
    expect(opciones.some((o: any) => o.timeZone === 'America/Santiago')).toBe(true);
    // Texto esperado calculado de forma explícita, independiente del TZ del runner.
    expect(screen.getByText(new RegExp(`Entregado el ${TEXTO_FECHA} por Paola`))).toBeInTheDocument();
  });

  it('no depende de la fecha actual (sin Date.now en render)', async () => {
    const spy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2099-01-01T00:00:00Z').getTime());
    montar([entregado]);
    await screen.findByText('Entregado');
    await expandir('Pablo');

    expect(screen.getByText(`Entregado el ${TEXTO_FECHA} por Paola`)).toBeInTheDocument();
    expect(screen.queryByText(/2099/)).toBeNull();
    spy.mockRestore();
  });
});

describe('formatFechaHora con fecha de Postgres (S1b)', () => {
  const PG = '2026-11-20 11:32:33.928739+00';

  it('normaliza el texto de Postgres a ISO 8601 estricto', () => {
    expect(normalizarFechaPostgres(PG)).toBe('2026-11-20T11:32:33.928+00:00');
    expect(normalizarFechaPostgres('2026-11-20 11:32:33+0000')).toBe('2026-11-20T11:32:33+00:00');
    expect(normalizarFechaPostgres('2026-11-20T11:32:33Z')).toBe('2026-11-20T11:32:33Z');
  });

  it('renderiza en Santiago el string exacto de Postgres', async () => {
    montar([{ ...PEDIDO, entregado_en: PG, entregado_por_nombre: 'Paola' }]);
    await screen.findByText('Entregado');
    await expandir('Pablo');
    expect(screen.getByText('Entregado el 20 nov 2026, 08:32 por Paola')).toBeInTheDocument();
  });

  it('acepta un offset ya ISO con dos puntos', async () => {
    montar([{ ...PEDIDO, entregado_en: '2026-11-20T11:32:33.928+00:00', entregado_por_nombre: 'Paola' }]);
    await screen.findByText('Entregado');
    await expandir('Pablo');
    expect(screen.getByText('Entregado el 20 nov 2026, 08:32 por Paola')).toBeInTheDocument();
  });

  it('fecha inválida: muestra el texto original sin romper', async () => {
    montar([{ ...PEDIDO, entregado_en: 'no-es-fecha', entregado_por_nombre: 'Paola' }]);
    await screen.findByText('Entregado');
    await expandir('Pablo');
    expect(screen.getByText('Entregado el no-es-fecha por Paola')).toBeInTheDocument();
  });
});

describe('Quitar entregado', () => {
  it('admin lo ve; vendedor no', async () => {
    montar([{ ...entregado, cliente: { id: 'c1', nombre: 'AdminVe', telefono: null } }], { user: { rol: 'admin' } });
    await expandir('AdminVe');
    expect(screen.getByRole('button', { name: 'Quitar entregado' })).toBeInTheDocument();
  });

  it('vendedor ve el badge pero no el botón', async () => {
    montar([{ ...entregado, cliente: { id: 'c1', nombre: 'VendVe', telefono: null } }], { user: { rol: 'vendedor' } });
    expect(await screen.findByText('Entregado')).toBeInTheDocument();
    await expandir('VendVe');
    expect(screen.queryByRole('button', { name: 'Quitar entregado' })).not.toBeInTheDocument();
  });

  it('admin desmarca: PATCH entregado=false y el badge desaparece', async () => {
    const { patches } = montar([entregado], { user: { rol: 'admin' } },
      async () => ok({ data: { id: ID, entregado_en: null, entregado_por_nombre: null } }));
    await expandir('Pablo');

    fireEvent.click(screen.getByRole('button', { name: 'Quitar entregado' }));

    await waitFor(() => expect(screen.queryByText('Entregado')).not.toBeInTheDocument());
    expect(JSON.parse(patches()[0][1].body)).toEqual({ entregado: false });
  });
});

describe('Filtro "Por entregar"', () => {
  const ANA = conNombre('Ana', { id: 'a', estado: 'convertido' });                       // por entregar
  const BETO = conNombre('Beto', { id: 'b', estado: 'pagado', entregado_en: FECHA, entregado_por_nombre: 'Paola' }); // entregado
  const CARLA = conNombre('Carla', { id: 'c', estado: 'revision' });                     // solo revisión
  const EVA = conNombre('Eva', { id: 'e', estado: 'pagado', mp_revision_motivo: 'Monto distinto' }); // ambos

  const visibles = (nombres: string[]) => nombres.forEach((n) => expect(screen.getByText(n)).toBeInTheDocument());
  const ocultos = (nombres: string[]) => nombres.forEach((n) => expect(screen.queryByText(n)).toBeNull());
  const toggle = (nombre: RegExp) => fireEvent.click(screen.getByRole('button', { name: nombre }));

  it('muestra contador de pendientes de entrega', async () => {
    montar([ANA, BETO, CARLA, EVA]);
    await screen.findByText('Ana');
    expect(screen.getByRole('button', { name: 'Por entregar (2)' })).toBeInTheDocument();
  });

  it('solo "Por entregar": excluye entregados y no entregables', async () => {
    montar([ANA, BETO, CARLA, EVA]);
    await screen.findByText('Ana');
    toggle(/Por entregar/);
    visibles(['Ana', 'Eva']);
    ocultos(['Beto', 'Carla']);
  });

  it('solo revisión: muestra revisión y pagado con motivo', async () => {
    montar([ANA, BETO, CARLA, EVA]);
    await screen.findByText('Ana');
    toggle(/Requieren revisión/);
    visibles(['Carla', 'Eva']);
    ocultos(['Ana', 'Beto']);
  });

  it('ambos filtros: intersección', async () => {
    montar([ANA, BETO, CARLA, EVA]);
    await screen.findByText('Ana');
    toggle(/Requieren revisión/);
    toggle(/Por entregar/);
    visibles(['Eva']);
    ocultos(['Ana', 'Beto', 'Carla']);

    // apagar revisión deja solo el filtro de entrega
    toggle(/Requieren revisión/);
    visibles(['Ana', 'Eva']);
    ocultos(['Beto', 'Carla']);
  });
});
