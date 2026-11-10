/**
 * @jest-environment jsdom
 *
 * Fase B — 2026-11-10: POS compacto.
 * Las dos acciones del panel (COBRAR y Guardar/Imprimir) usan Button normal
 * (h-8 = 32 px) en escritorio y en la venta móvil; el resto de controles
 * conserva su tamaño táctil y la barra inferior se compacta sin perder
 * cantidad ni total. El diálogo de pago conserva sus acciones y tamaños.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PosCobrarDialog } from '@/components/PosCobrarDialog';
import { PosPage } from '@/app/(app)/pos/client_page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/components/ImageWithFallback', () => ({ ImageWithFallback: () => null }));
// Comportamiento previo a pos-stock: estas pruebas fijan el POS tal como era.
jest.mock('@/config/feature-flags.json', () => require('@/__tests__/helpers/mockFlags').mockFlags({
  'registro_notas_bodega_ui': false,
  'precio-mayorista-ui': true,
  'notas-venta-modalidad': true,
  'clientes-etiqueta': true,
  'tienda-pago-online': true,
  'mp-webhook-ignorar-ipn-legacy': true,
  'pedido-confetti': true,
  'env-validacion-arranque': true,
  'tienda-mayor-online': true,
  'tienda-portada-v2': true,
  'pos-v1': true,
}));

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const CUENTAS = [{ id: 1, nombre: 'Caja', activa: true, orden: 1 }];
// Los tamaños (32 px de acciones, barra compacta) los mide el smoke de
// Playwright con geometría real; aquí solo se fija el contrato semántico.

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('pos4 — diálogo COBRAR', () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (url: string) => {
      if (url === '/api/caja/cuentas?activas=true') return json({ data: CUENTAS });
      if (url.endsWith('/pagar')) return json({ monto_aplicado: 10000, saldo_pendiente_restante: 0 });
      return json({ error: 'no mockeado' }, 500);
    }) as any;
  });

  const montar = () => render(
    <PosCobrarDialog
      open
      onOpenChange={jest.fn()}
      notaId="9"
      saldoPendiente={10000}
      usuarioId="7"
      onNuevaVenta={jest.fn()}
    />
  );

  it('limita la altura al viewport y deja CONFIRMAR en footer sticky', async () => {
    montar();
    const panel = screen.getByTestId('pos-cobrar');
    expect(panel.className).toContain('max-h-[calc(100dvh-2rem)]');
    expect(panel.className).toContain('overflow-y-auto');

    const confirmar = screen.getByTestId('pos-confirmar');
    expect(confirmar.parentElement?.className).toContain('sticky');
    expect(confirmar.className).toContain('h-16');

    // Todos los botones del panel miden al menos 48px (h-12); la X de cierre
    // del diálogo (overlay, absolute) no cuenta.
    const botones = Array.from(panel.querySelectorAll('button'))
      .filter(b => !b.className.includes('absolute'));
    expect(botones.length).toBeGreaterThan(10);
    for (const b of botones) {
      expect(b.className).toMatch(/\bh-(1[2-9]|[2-9]\d)\b/);
    }
  });

  it('"Cobro registrado": PDF y WhatsApp en 2 columnas, Nueva venta a ancho completo', async () => {
    montar();
    await waitFor(() => expect((screen.getByTestId('pos-cuenta') as HTMLSelectElement).value).toBe('1'));
    fireEvent.click(screen.getByTestId('pos-confirmar'));

    await screen.findByText('Cobro registrado');
    const pdf = screen.getByRole('button', { name: /Imprimir PDF/ });
    const wa = screen.getByRole('button', { name: /WhatsApp/ });
    const nueva = screen.getByRole('button', { name: /Nueva venta/ });

    expect(pdf.className).toContain('whitespace-nowrap');
    expect(wa.className).toContain('whitespace-nowrap');
    expect(nueva.className).toContain('col-span-2');
    expect(pdf.parentElement?.className).toContain('grid-cols-2');
    expect(pdf.parentElement).toBe(nueva.parentElement);
  });
});

describe('2026-11-10 — panel POS compacto', () => {
  const productos = Array.from({ length: 4 }, (_, i) => ({
    codigo: `P${i + 1}`,
    detalle: `Producto ${i + 1}`,
    imagen_url: null,
    empresa_id: 1,
    prcventa: 1000,
    precio_mayor: null,
    saldo: 10,
    categoria: 'Juguete',
  }));
  const NOTA = {
    id: 42,
    items: [
      { id: 'it-1', codigo: 'P1', descripcion: 'Cubo Rubik 3x3', modalidad: 'detalle', unidades: 2, precio: 1000, subtotal: 2000 },
      { id: 'it-2', codigo: 'P2', descripcion: 'Muñeca articulada', modalidad: 'mayor', unidades: 1, precio: 3000, subtotal: 3000 },
    ],
    saldo_pendiente: 5000,
  };

  beforeEach(() => {
    localStorage.setItem('pos-nota-id:7', '42');
    global.fetch = jest.fn(async (url: string) => {
      if (url.startsWith('/api/productos?search=')) return json({ data: productos });
      if (url === '/api/categorias') return json([]);
      if (url === '/api/notas-venta/42') return json(NOTA);
      return json({ error: 'no mockeado' }, 500);
    }) as any;
  });

  const montar = () => render(<PosPage session={{ user: { id: '7', rol: 'vendedor' } }} />);

  it('escritorio: acciones presentes y línea con nombre, código, precio, cantidad, subtotal y modalidad', async () => {
    montar();
    await screen.findByTestId('pos-linea-P1');
    const aside = document.querySelector('aside') as HTMLElement;
    expect(aside).toBeTruthy();

    expect(within(aside).getByRole('button', { name: /COBRAR/ })).toBeTruthy();
    expect(within(aside).getByRole('button', { name: /Guardar \/ Imprimir/ })).toBeTruthy();

    const linea = within(aside).getByTestId('pos-linea-P1');
    expect(within(linea).getByText('Cubo Rubik 3x3')).toBeTruthy();
    expect(within(linea).getByText(/P1 · \$1\.000 \/ unidad/)).toBeTruthy();
    expect(within(linea).getByTestId('pos-cantidad-P1').textContent).toBe('2');
    expect(within(linea).getByText('$2.000')).toBeTruthy();
    expect(within(linea).getByRole('button', { name: 'Alternar precio por menor o por mayor' })).toBeTruthy();
  });

  it('móvil: la barra inferior conserva cantidad y total, y la venta mantiene sus controles', async () => {
    montar();
    await screen.findByTestId('pos-linea-P1');
    const barra = screen.getByTestId('pos-barra-movil');
    expect(barra.textContent).toContain('3 ítems');
    expect(barra.textContent).toContain('$5.000');
    expect(barra).toHaveTextContent('COBRAR');

    fireEvent.click(barra);
    const titulo = await screen.findByText('Venta en curso');
    const panel = titulo.closest('[data-slot="sheet-content"]') as HTMLElement;
    expect(panel).toBeTruthy();

    expect(within(panel).getByRole('button', { name: /COBRAR/ })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: /Guardar \/ Imprimir/ })).toBeTruthy();
    const linea = within(panel).getByTestId('pos-linea-P1');
    expect(within(linea).getByText('Cubo Rubik 3x3')).toBeTruthy();
    expect(within(linea).getByTestId('pos-cantidad-P1').textContent).toBe('2');
    expect(within(linea).getByRole('button', { name: 'Quitar una unidad de Cubo Rubik 3x3' })).toBeTruthy();
    expect(within(linea).getByRole('button', { name: 'Agregar una unidad de Cubo Rubik 3x3' })).toBeTruthy();
    expect(within(linea).getByRole('button', { name: 'Quitar Cubo Rubik 3x3' })).toBeTruthy();
  });

  it('la grilla reserva espacio inferior para la barra fija', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('pos-producto-P1')).toBeTruthy());
    const grilla = screen.getByTestId('pos-producto-P1').parentElement!;
    expect(grilla.parentElement?.className).toMatch(/\bpb-\d/);
  });
});
