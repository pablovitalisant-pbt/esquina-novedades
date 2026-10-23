import { render, screen } from '@testing-library/react';
import { ProductCard } from '../ProductCard';
import { Producto } from '@/types';

const mockProduct: Producto = {
  id: 1,
  empresa_id: 1,
  codigo: 'TEST-001',
  nroingreso: '101-24-001-001-GL2',
  saldo: 100,
  umed: 'UN',
  cif: 10,
  costo: 8,
  prcventa: 20,
  prcminimo: 15,
  cantcaja: 1,
  pesocaja: 5,
  cubicaja: 0.1,
  detalle: 'Test Product',
  imagen_url: null,
  es_nuevo: false,
  categoria: null,
  stock_minimo: null,
  fecha_ingreso: new Date(),
  updated_at: new Date(),
};

describe('ProductCard - Cantidad por Caja', () => {
  const setup = (overrides: Partial<Producto> = {}) => {
    const producto = { ...mockProduct, ...overrides };
    render(
      <ProductCard
        producto={producto}
        empresaSlug="test-empresa"
        empresaNombre="IMPORT EXPORT SANJH LTDA."
        onClick={() => {}}
      />
    );
  };

  test('Renderiza "10 SET/Caja" cuando cantcaja=10 y umed="SET"', () => {
    setup({ cantcaja: 10, umed: 'SET' });
    expect(screen.getByText(/10 SET\/Caja/)).toBeInTheDocument();
  });

  test('Renderiza "4 SET/Caja" cuando cantcaja=4 y umed="SET"', () => {
    setup({ cantcaja: 4, umed: 'SET' });
    expect(screen.getByText(/4 SET\/Caja/)).toBeInTheDocument();
  });

  test('Renderiza "2 UN/Caja" cuando cantcaja=2 y umed="UN"', () => {
    setup({ cantcaja: 2, umed: 'UN' });
    expect(screen.getByText(/2 UN\/Caja/)).toBeInTheDocument();
  });

  test('No renderiza el bloque "Cantidad por Caja" cuando cantcaja=1', () => {
    setup({ cantcaja: 1, umed: 'UN' });
    expect(screen.queryByText(/Caja/)).not.toBeInTheDocument();
  });

  test('No renderiza el bloque "Cantidad por Caja" cuando cantcaja es null', () => {
    // @ts-ignore
    setup({ cantcaja: null, umed: 'UN' });
    expect(screen.queryByText(/Caja/)).not.toBeInTheDocument();
  });

  test('No renderiza el bloque "Cantidad por Caja" cuando cantcaja es undefined', () => {
    // @ts-ignore
    setup({ cantcaja: undefined, umed: 'UN' });
    expect(screen.queryByText(/Caja/)).not.toBeInTheDocument();
  });
});

describe('ProductCard - Precio de venta (CLP)', () => {
  const setup = (
    overrides: Partial<Producto> = {},
    props: { ocultarPrecios?: boolean } = {}
  ) => {
    const producto = { ...mockProduct, ...overrides };
    render(
      <ProductCard
        producto={producto}
        empresaSlug="test-empresa"
        empresaNombre="IMPORT EXPORT SANJH LTDA."
        onClick={() => {}}
        ocultarPrecios={props.ocultarPrecios}
      />
    );
  };

  test('prcventa=0 → "—", sin línea ARS', () => {
    setup({ prcventa: 0 });
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/AR\$/)).not.toBeInTheDocument();
  });

  test('muestra formatCLP(prcventa), sin línea ARS', () => {
    setup({ prcventa: 20 });
    expect(screen.getByText('$20')).toBeInTheDocument();
    expect(screen.queryByText(/AR\$/)).not.toBeInTheDocument();
  });

  test('ocultarPrecios=true → "••••", sin línea ARS aunque haya precio y dólar válidos', () => {
    setup({ prcventa: 20 }, { ocultarPrecios: true });
    expect(screen.getByText('••••')).toBeInTheDocument();
    expect(screen.queryByText(/AR\$/)).not.toBeInTheDocument();
  });

  test('caso feliz: prcventa=12345 → "$12.345", sin ARS', () => {
    setup({ prcventa: 12345 });
    expect(screen.getByText('$12.345')).toBeInTheDocument();
    expect(screen.queryByText(/AR\$|≈/)).not.toBeInTheDocument();
  });
});
