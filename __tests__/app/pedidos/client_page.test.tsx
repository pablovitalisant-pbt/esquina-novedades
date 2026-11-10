/**
 * @jest-environment jsdom
 *
 * Fase B — Slice 7f: vista staff de pedidos muestra estado, modalidad,
 * subtotal, entrega, dirección, email y el total calculado en el servidor.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PedidosPage } from '@/app/(app)/pedidos/client_page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('@/config/feature-flags.json', () =>
  require('@/__tests__/helpers/mockFlags').mockFlags({
    'pedido-cobro-manual': true,
    'pedidos-archivar-expirados': true,
  }),
);
// ponytail: virtual — el componente real llega en Fase C.
jest.mock('@/components/ConfirmarCobroPedido', () => ({
  ConfirmarCobroPedido: () => <button type="button">Confirmar cobro</button>,
}), { virtual: true });

const PEDIDO = {
  id: 'p1',
  cliente: { id: 'c1', nombre: 'Pablo', telefono: '+56920948874' },
  email_contacto: 'pablo@example.com',
  origen: 'productos',
  estado: 'pendiente_pago',
  created_at: '2026-08-17T20:10:00Z',
  entrega_codigo: 'delivery_iquique',
  entrega_costo: 3000,
  direccion_entrega: 'Av. Prat 123',
  total: 5000,
  items: [
    { codigo: '1055', detalle: 'gallinita', cantidad: 2, modalidad: 'mayor', precio: 4, subtotal: 8, cantcaja: 30 },
    { codigo: '2000', detalle: 'pelota', cantidad: 1, modalidad: 'detalle', precio: 1992, subtotal: 1992, cantcaja: 6 },
  ],
};

function renderPage(data: any[] = [PEDIDO], session: any = {}) {
  (global.fetch as jest.Mock) = jest.fn(async () => ({
    ok: true,
    json: async () => ({ data }),
  }));
  render(<PedidosPage session={session} />);
}

describe('PedidosPage — detalle del pedido (7f)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('muestra estado, email, entrega, dirección y total del servidor', async () => {
    renderPage();
    await screen.findByText('Pablo');
    fireEvent.click(screen.getByText('Pablo'));

    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument();
    expect(screen.getByText(/pablo@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/Delivery Iquique/)).toBeInTheDocument();
    expect(screen.getByText(/Av\. Prat 123/)).toBeInTheDocument();
    // total viene del servidor (5000), no se recalcula de los ítems
    await screen.findByText('Total: $5.000');
  });

  it('revisión: label, pago MP y motivo; filtro "Requieren revisión" (10e)', async () => {
    const mp = { mp_payment_id: '999', mp_fecha_pago: '2026-08-17T21:00:00Z' };
    renderPage([
      { ...PEDIDO, id: 'r1', estado: 'revision', ...mp, mp_revision_motivo: 'Monto distinto', cliente: { id: 'c', nombre: 'Rev', telefono: null } },
      { ...PEDIDO, id: 'r2', estado: 'pagado_tardio', ...mp, mp_revision_motivo: null, cliente: { id: 'c', nombre: 'Tarde', telefono: null } },
      { ...PEDIDO, id: 'r3', estado: 'pagado', ...mp, mp_revision_motivo: null, cliente: { id: 'c', nombre: 'Ok', telefono: null } },
    ]);
    await screen.findByText('Rev');
    expect(screen.getByText('En revisión')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Rev'));
    expect(screen.getByText(/Monto distinto/)).toBeInTheDocument();
    expect(screen.getByText(/999/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Requieren revisión/ }));
    expect(screen.getByText('Rev')).toBeInTheDocument();
    expect(screen.getByText('Tarde')).toBeInTheDocument();
    expect(screen.queryByText('Ok')).not.toBeInTheDocument();
  });

  it('muestra modalidad y subtotal por ítem', async () => {
    renderPage();
    await screen.findByText('Pablo');
    fireEvent.click(screen.getByText('Pablo'));

    expect(screen.getByText('2 unidades (por mayor)')).toBeInTheDocument();
    expect(screen.getByText('1 unidad')).toBeInTheDocument();
    expect(screen.getByText('$8')).toBeInTheDocument();
    expect(screen.getByText('$1.992')).toBeInTheDocument();
    expect(screen.getByText('Entrega: $3.000')).toBeInTheDocument();
  });
});

describe('PedidosPage — cobro manual (N04d2b)', () => {
  const manual = { ...PEDIDO, metodo_pago: 'transferencia', caja_movimiento_id: null };
  const admin = { user: { rol: 'admin' } };
  const verAccion = async (pedido: any, session: any) => {
    renderPage([pedido], session);
    await screen.findByText(pedido.cliente.nombre);
    fireEvent.click(screen.getByText(pedido.cliente.nombre));
    return screen.queryAllByText(/Confirmar cobro/);
  };

  it('admin con flag ve la acción en pendiente y convertido sin caja', async () => {
    expect((await verAccion(manual, admin)).length).toBeGreaterThan(0);
    const conv = { ...manual, id: 'm2', estado: 'convertido', cliente: { id: 'c2', nombre: 'PedConv', telefono: null } };
    expect((await verAccion(conv, admin)).length).toBeGreaterThan(0);
  });

  it('vendedor o caja ya registrada no muestran la acción', async () => {
    expect(await verAccion({ ...manual, cliente: { id: 'c3', nombre: 'Vend', telefono: null } }, { user: { rol: 'vendedor' } })).toHaveLength(0);
    const caja = { ...manual, caja_movimiento_id: 55, cliente: { id: 'c4', nombre: 'Caj', telefono: null } };
    expect(await verAccion(caja, admin)).toHaveLength(0);
  });
});

describe('PedidosPage — archivar expirados (2026-11-10)', () => {
  const { toast } = jest.requireMock('sonner') as any;
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const EXPIRADO = {
    ...PEDIDO, id: 'e1', estado: 'expirado', items: [], mp_revision_motivo: null,
    cliente: { id: 'c1', nombre: 'Exp Uno', telefono: null },
  };
  const CON_REVISION = {
    ...EXPIRADO, id: 'e2', cliente: { id: 'c2', nombre: 'Exp Rev', telefono: null },
    mp_revision_motivo: 'Monto distinto',
  };

  function montar(inicial: any[], responderPatch: () => any) {
    let lista = [...inicial];
    let gets = 0;
    const fetchMock = jest.fn(async (_url: string, init?: any) => {
      if (init?.method === 'PATCH') {
        const res = responderPatch();
        if (res.ok) lista = lista.filter((p) => p.id !== EXPIRADO.id);
        return res;
      }
      gets += 1;
      return ok({ data: lista });
    });
    (global.fetch as jest.Mock) = fetchMock;
    render(<PedidosPage session={{}} />);
    return { fetchMock, gets: () => gets };
  }

  const expandir = async (nombre: string) => {
    await screen.findByText(nombre);
    fireEvent.click(screen.getByText(nombre));
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ofrece Archivar solo en expirados elegibles', async () => {
    const CON_STOCK = { ...EXPIRADO, id: 'e3', stock_reservado: true, cliente: { id: 'c3', nombre: 'Exp Stock', telefono: null } };
    renderPage([EXPIRADO, CON_REVISION, CON_STOCK]);
    await expandir('Exp Uno');
    expect(screen.getAllByRole('button', { name: 'Archivar' })).toHaveLength(1);
    fireEvent.click(screen.getByText('Exp Rev'));
    // El expirado con revisión pendiente no se ofrece.
    expect(screen.getAllByRole('button', { name: 'Archivar' })).toHaveLength(1);
    fireEvent.click(screen.getByText('Exp Stock'));
    // Con stock aún reservado tampoco se ofrece.
    expect(screen.getAllByRole('button', { name: 'Archivar' })).toHaveLength(1);
  });

  it('tras confirmar y recibir éxito desaparece de la tabla y recarga', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { fetchMock, gets } = montar([EXPIRADO], () => ok({ data: { id: 'e1' } }));
    await expandir('Exp Uno');

    fireEvent.click(screen.getByRole('button', { name: 'Archivar' }));
    await waitFor(() => expect(screen.queryByText('Exp Uno')).toBeNull());

    const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH');
    expect(JSON.parse(patch![1].body)).toEqual({ accion: 'archivar' });
    expect(gets()).toBeGreaterThanOrEqual(2); // recarga desde el servidor
    expect(toast.success).toHaveBeenCalled();
  });

  it('si la petición falla, conserva la fila e informa el error', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    montar([EXPIRADO], () => ({ ok: false, status: 409, json: async () => ({ error: 'Pedido no elegible' }) }));
    await expandir('Exp Uno');

    fireEvent.click(screen.getByRole('button', { name: 'Archivar' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/no elegible/i)));
    expect(screen.getByText('Exp Uno')).toBeInTheDocument();
  });

  it('cancelar la confirmación no envía el PATCH', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { fetchMock } = montar([EXPIRADO], () => ok({ data: {} }));
    await expandir('Exp Uno');

    fireEvent.click(screen.getByRole('button', { name: 'Archivar' }));
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(false);
    expect(screen.getByText('Exp Uno')).toBeInTheDocument();
  });
});
