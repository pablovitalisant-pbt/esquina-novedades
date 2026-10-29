/**
 * Tests PBT-IA — Slice 1: Mejoras UI CrearCatalogoDialog
 * Estado inicial: ROJO (cambios aún no implementados)
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CrearCatalogoDialog } from './CrearCatalogoDialog';

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: jest.fn(),
  empresaId: 1,
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  });
});

describe('CrearCatalogoDialog — Slice 1 labels y defaults', () => {
  it('muestra "Nombre de Cliente" en lugar de "Título Comercial"', () => {
    render(<CrearCatalogoDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText('Nombre de Cliente')).toBeInTheDocument();
    expect(screen.queryByText('Título Comercial')).not.toBeInTheDocument();
  });

  it('no muestra campo Descripcion (eliminado — PRD §9.20)', () => {
    render(<CrearCatalogoDialog {...DEFAULT_PROPS} />);
    expect(screen.queryByPlaceholderText('Breve mensaje para el cliente')).toBeNull();
  });

  it('label incluir muestra "Productos a incluir"', () => {
    render(<CrearCatalogoDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText('Productos a incluir', { selector: 'label' })).toBeInTheDocument();
  });

  it('label excluir muestra "Productos a excluir"', () => {
    render(<CrearCatalogoDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText('Productos a excluir', { selector: 'label' })).toBeInTheDocument();
  });

  it('checkbox "Solo productos con stock" inicia marcado por defecto', () => {
    render(<CrearCatalogoDialog {...DEFAULT_PROPS} />);
    const checkbox = screen.getByRole('checkbox', { name: /solo productos con stock/i });
    expect(checkbox).toBeChecked();
  });

  it('muestra "Mostrar inventario disponible" en lugar de "Mostrar stock disponible"', () => {
    render(<CrearCatalogoDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText(/mostrar inventario disponible/i)).toBeInTheDocument();
    expect(screen.queryByText(/mostrar stock disponible/i)).not.toBeInTheDocument();
  });
});

describe('CrearCatalogoDialog — Slice 4a: sin % de ganancia', () => {
  it('no muestra input de margen ni textos de porcentaje', () => {
    render(<CrearCatalogoDialog {...DEFAULT_PROPS} />);
    expect(screen.queryByText(/margen/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/costo ×/i)).not.toBeInTheDocument();
    // El único spinbutton posible sería el "top n" (oculto por defecto)
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
  });

  it('el POST de creación no envía margen_precio', async () => {
    let postBody: any = null;
    (global as any).fetch = jest.fn((url: string, init?: any) => {
      if (init?.method === 'POST') {
        postBody = JSON.parse(init.body);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<CrearCatalogoDialog {...DEFAULT_PROPS} />);
    fireEvent.change(screen.getByPlaceholderText('Ej: Ofertas Mayo 2026'), {
      target: { value: 'Ofertas Mayo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /crear/i }));

    await waitFor(() => expect(postBody).not.toBeNull());
    expect(postBody).not.toHaveProperty('margen_precio');
    expect(postBody.titulo).toBe('Ofertas Mayo');
  });
});

describe('CrearCatalogoDialog — Slice 1 smoke', () => {
  it('renderiza el modal sin crash con todos los cambios aplicados', () => {
    render(<CrearCatalogoDialog {...DEFAULT_PROPS} />);
    expect(screen.getByRole('button', { name: /crear/i })).toBeInTheDocument();
  });
});

describe('CrearCatalogoDialog — Slice 3: solo últimos N ingresos', () => {
  it('NO muestra "Solo productos nuevos ✨"', () => {
    render(<CrearCatalogoDialog {...DEFAULT_PROPS} />);
    expect(screen.queryByText(/solo productos nuevos/i)).not.toBeInTheDocument();
  });

  it('muestra checkbox "Solo últimos ... ingresos llegados a Zofri"', () => {
    render(<CrearCatalogoDialog {...DEFAULT_PROPS} />);
    expect(screen.getByRole('checkbox', { name: /ingresos llegados a zofri/i })).toBeInTheDocument();
  });

  it('input numérico NO visible cuando el checkbox está desmarcado', () => {
    render(<CrearCatalogoDialog {...DEFAULT_PROPS} />);
    const checkbox = screen.getByRole('checkbox', { name: /ingresos llegados a zofri/i });
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByRole('spinbutton', { name: /top n/i })).not.toBeInTheDocument();
  });

  it('input numérico visible con valor 1 cuando el checkbox se marca', () => {
    render(<CrearCatalogoDialog {...DEFAULT_PROPS} />);
    const checkbox = screen.getByRole('checkbox', { name: /ingresos llegados a zofri/i });
    fireEvent.click(checkbox);
    const input = screen.getByRole('spinbutton', { name: /top n/i });
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('1');
  });
});
