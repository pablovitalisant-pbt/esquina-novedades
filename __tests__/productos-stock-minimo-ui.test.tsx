/**
 * @jest-environment jsdom
 *
 * Fase B — stock_minimo: wiring de formularios (R12).
 * T7-A: ProductDrawer — sincroniza stock_minimo al abrir, lo envia al guardar.
 * T7-B: PreciosClient "Nuevo producto" Dialog — render real, interaccion real,
 *       captura del body real del fetch.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProductDrawer } from '@/components/ProductDrawer';
import { PreciosClient } from '@/app/(app)/precios/client_page';
import { Producto, UserSession } from '@/types';

// ─── Mocks globales ──────────────────────────────────────────────
global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });
global.URL.createObjectURL = jest.fn(() => 'blob:mock');

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('next/link', () => ({ children, href }: any) =>
  require('react').createElement('a', { href }, children)
);

// ─── Test data ───────────────────────────────────────────────────
const mockProducto: Producto = {
  id: 1, empresa_id: 1, codigo: 'SM-UI', detalle: 'Test stock_minimo',
  prcventa: 100, prcminimo: 80, costo: 50, margen_pct: 25, cif: 40,
  saldo: 10, umed: 'UND', cantcaja: 1, pesocaja: 1, cubicaja: 1,
  nroingreso: '2024-001', es_nuevo: true, categoria: null,
  imagen_url: null, fecha_ingreso: new Date(), updated_at: new Date(),
  stock_minimo: null as any,
};

const mockAdmin: UserSession = {
  id: '1', rut: '1-1', nombre: 'Admin', rol: 'admin', empresas: [1],
};

// ═══════════════════════════════════════════════════════════════════
// T7-A: ProductDrawer — stock_minimo sync on open + save body
// ═══════════════════════════════════════════════════════════════════
describe('T7-A — ProductDrawer stock_minimo sync', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  it('abre drawer con stock_minimo=10 → label "Stock minimo" visible en edicion', () => {
    const productoConMinimo = { ...mockProducto, stock_minimo: 10 };
    render(
      <ProductDrawer
        producto={productoConMinimo}
        empresaNombre=""
        session={mockAdmin}
        open={true}
        onOpenChange={() => {}}
        onUpdated={() => {}}
      />
    );

    fireEvent.click(screen.getByTitle('Editar producto'));
    expect(screen.getByText('Stock minimo')).toBeInTheDocument();
  });

  it('abre drawer con stock_minimo=null → no muestra label Stock minimo en vista', () => {
    render(
      <ProductDrawer
        producto={{ ...mockProducto, stock_minimo: null }}
        empresaNombre=""
        session={mockAdmin}
        open={true}
        onOpenChange={() => {}}
        onUpdated={() => {}}
      />
    );

    expect(screen.queryByText('Stock minimo')).not.toBeInTheDocument();
  });

  it('guarda con stock_minimo=15 → PUT body incluye stock_minimo: 15', () => {
    let capturedBody: any = null;
    (global.fetch as jest.Mock).mockImplementation((url: string, opts: any) => {
      if (opts?.body) {
        try { capturedBody = JSON.parse(opts.body); } catch {}
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { ...mockProducto, stock_minimo: 15 } }),
      });
    });

    render(
      <ProductDrawer
        producto={{ ...mockProducto, stock_minimo: 15 }}
        empresaNombre=""
        session={mockAdmin}
        open={true}
        onOpenChange={() => {}}
        onUpdated={() => {}}
      />
    );

    fireEvent.click(screen.getByTitle('Editar producto'));
    fireEvent.click(screen.getByText(/guardar/i));

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.stock_minimo).toBe(15);
  });

  it('guarda sin stock_minimo (null) → PUT body no incluye stock_minimo', () => {
    let capturedBody: any = null;
    (global.fetch as jest.Mock).mockImplementation((url: string, opts: any) => {
      if (opts?.body) {
        try { capturedBody = JSON.parse(opts.body); } catch {}
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { ...mockProducto, stock_minimo: null } }),
      });
    });

    render(
      <ProductDrawer
        producto={mockProducto}
        empresaNombre=""
        session={mockAdmin}
        open={true}
        onOpenChange={() => {}}
        onUpdated={() => {}}
      />
    );

    fireEvent.click(screen.getByTitle('Editar producto'));
    fireEvent.click(screen.getByText(/guardar/i));

    expect(capturedBody).not.toBeNull();
    expect(capturedBody).not.toHaveProperty('stock_minimo');
  });
});

// ═══════════════════════════════════════════════════════════════════
// T7-B: PreciosClient "Nuevo producto" — render real, interaccion real
// ═══════════════════════════════════════════════════════════════════
describe('T7-B — PreciosClient Dialog "Nuevo producto" envia stock_minimo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    localStorage.clear();
  });

  it('completar stock_minimo en Dialog → POST body incluye stock_minimo', async () => {
    let capturedBody: any = null;
    (global.fetch as jest.Mock).mockImplementation((url: string, opts: any) => {
      if (opts?.body && url.includes('/api/productos') && opts.method === 'POST') {
        try { capturedBody = JSON.parse(opts.body); } catch {}
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { id: 1, codigo: 'BZ-001', stock_minimo: 5 } }),
      });
    });

    render(<PreciosClient session={mockAdmin} />);

    // Abrir Dialog "Nuevo producto"
    const openButton = screen.getByText(/agregar producto/i);
    fireEvent.click(openButton);

    // Llenar formulario
    fireEvent.change(screen.getByPlaceholderText('Ej: BZ-001'), { target: { value: 'BZ-001' } });
    fireEvent.change(screen.getByPlaceholderText('Nombre del producto'), { target: { value: 'Producto test' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '15' } }); // costo
    fireEvent.change(screen.getByPlaceholderText('30'), { target: { value: '20' } }); // margen

    // Stock minimo — placeholder no fijo, buscar por label
    const stockMinimoInput = screen.getByLabelText(/Stock m[ií]nimo/i);
    fireEvent.change(stockMinimoInput, { target: { value: '5' } });

    // Click "Crear producto"
    fireEvent.click(screen.getByText('Crear producto'));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });
    expect(capturedBody.stock_minimo).toBe(5);
  });

  it('dejar stock_minimo vacio → POST body no incluye stock_minimo', async () => {
    let capturedBody: any = null;
    (global.fetch as jest.Mock).mockImplementation((url: string, opts: any) => {
      if (opts?.body && url.includes('/api/productos') && opts.method === 'POST') {
        try { capturedBody = JSON.parse(opts.body); } catch {}
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { id: 2, codigo: 'BZ-002', stock_minimo: null } }),
      });
    });

    render(<PreciosClient session={mockAdmin} />);

    // Abrir Dialog
    fireEvent.click(screen.getByText(/agregar producto/i));

    // Llenar solo campos obligatorios, no tocar stock minimo
    fireEvent.change(screen.getByPlaceholderText('Ej: BZ-001'), { target: { value: 'BZ-002' } });
    fireEvent.change(screen.getByPlaceholderText('Nombre del producto'), { target: { value: 'Producto sin minimo' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } }); // costo
    fireEvent.change(screen.getByPlaceholderText('30'), { target: { value: '25' } }); // margen

    // Click "Crear producto"
    fireEvent.click(screen.getByText('Crear producto'));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });
    expect(capturedBody).not.toHaveProperty('stock_minimo');
  });
});
