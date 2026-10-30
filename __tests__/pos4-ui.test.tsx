/**
 * @jest-environment jsdom
 *
 * Fase B — pos4: ajustes de UI del QA (1366x800) y móvil (375x812).
 * COBRAR con scroll interno y CONFIRMAR sticky; pantalla "Cobro registrado"
 * sin desborde; barra fija móvil sin tapar el último producto.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PosCobrarDialog } from '@/components/PosCobrarDialog';
import { PosPage } from '@/app/(app)/pos/client_page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/components/ImageWithFallback', () => ({ ImageWithFallback: () => null }));

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const CUENTAS = [{ id: 1, nombre: 'Caja', activa: true, orden: 1 }];

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

describe('pos4 — móvil', () => {
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

  beforeEach(() => {
    global.fetch = jest.fn(async (url: string) => {
      if (url === '/api/productos?search=') return json({ data: productos });
      if (url === '/api/categorias') return json([{ nombre: 'Juguete' }]);
      return json({ error: 'no mockeado' }, 500);
    }) as any;
  });

  it('la grilla deja padding inferior para la barra fija', async () => {
    render(<PosPage session={{ user: { id: '7', rol: 'vendedor' } }} />);
    await waitFor(() => expect(screen.getByTestId('pos-producto-P1')).toBeTruthy());
    expect(screen.getByTestId('pos-barra-movil').textContent).toContain('COBRAR');

    const grilla = screen.getByTestId('pos-producto-P1').parentElement!;
    expect(grilla.parentElement?.className).toContain('pb-40');
  });

  it('el Sheet de la nota abre con botones de al menos 48px', async () => {
    render(<PosPage session={{ user: { id: '7', rol: 'vendedor' } }} />);
    await waitFor(() => expect(screen.getByTestId('pos-barra-movil')).toBeTruthy());
    fireEvent.click(screen.getByTestId('pos-barra-movil'));

    const sheet = await screen.findByText('Venta en curso');
    const panel = sheet.closest('[data-slot="sheet-content"]') as HTMLElement;
    expect(panel).toBeTruthy();
    const botones = Array.from(panel.querySelectorAll('button'))
      .filter(b => !b.className.includes('absolute'));
    expect(botones.length).toBeGreaterThan(0);
    for (const b of botones) {
      expect(b.className).toMatch(/\bh-(1[2-9]|[2-9]\d)\b/);
    }
    // El botón COBRAR del panel es grande y sigue presente dentro del Sheet.
    expect(within(panel).getByText('COBRAR')).toBeTruthy();
  });
});
