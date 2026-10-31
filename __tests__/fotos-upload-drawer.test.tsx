/**
 * Fase B — fotos-1: smoke de subida en ProductDrawer y guard de doble clic.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('@/lib/imagen-reducir', () => ({
  reducirImagen: jest.fn().mockResolvedValue('data:image/jpeg;base64,REDUCIDA'),
  MAX_ENTRADA_BYTES: 20 * 1024 * 1024,
  TIPOS_ACEPTADOS: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
}));
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

import { ProductDrawer } from '@/components/ProductDrawer';
import { reducirImagen } from '@/lib/imagen-reducir';
import type { Producto, UserSession } from '@/types';

const producto = {
  id: 1,
  empresa_id: 1,
  codigo: 'TEST-P',
  detalle: 'Test',
  prcventa: 100,
  prcminimo: 80,
  costo: 50,
  margen_pct: 25,
  cif: 40,
  saldo: 10,
  umed: 'U',
  cantcaja: 1,
  pesocaja: 1,
  cubicaja: 1,
  nroingreso: '2024-001',
  es_nuevo: true,
  categoria: null,
  stock_minimo: null,
  imagen_url: null,
  fecha_ingreso: new Date(),
  updated_at: new Date(),
} as unknown as Producto;

const admin = {
  id: '1',
  rut: '1-1',
  nombre: 'Admin',
  rol: 'admin',
  empresas: [1],
} as UserSession;

function renderDrawer() {
  return render(
    <ProductDrawer
      producto={producto}
      session={admin}
      open
      onOpenChange={() => {}}
      onUpdated={() => {}}
    />
  );
}

function seleccionarArchivo() {
  const file = new File(['foto'], 'test.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByTestId('upload-input'), { target: { files: [file] } });
}

beforeEach(() => {
  jest.clearAllMocks();
  (reducirImagen as jest.Mock).mockResolvedValue('data:image/jpeg;base64,REDUCIDA');
  (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ imagen_url: 'https://res.cloudinary.com/demo/a.jpg' }),
  });
});

describe('ProductDrawer — subida de foto', () => {
  it('el selector acepta exactamente los tipos soportados', () => {
    renderDrawer();
    expect(screen.getByTestId('upload-input')).toHaveAttribute(
      'accept',
      'image/jpeg,image/jpg,image/png,image/webp',
    );
  });

  const llamadasUpload = () =>
    (global.fetch as jest.Mock).mock.calls.filter(([url]) => url === '/api/productos/upload');

  it('sube la version reducida al endpoint', async () => {
    renderDrawer();
    seleccionarArchivo();

    fireEvent.click(screen.getByRole('button', { name: /subir imagen/i }));

    await waitFor(() => expect(llamadasUpload()).toHaveLength(1));
    const [url, opciones] = llamadasUpload()[0];
    expect(url).toBe('/api/productos/upload');
    expect(JSON.parse((opciones as RequestInit).body as string).imageBase64).toBe(
      'data:image/jpeg;base64,REDUCIDA'
    );
  });

  it('doble clic en SUBIR no dispara dos uploads', async () => {
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}));
    renderDrawer();
    seleccionarArchivo();

    const boton = screen.getByRole('button', { name: /subir imagen/i });
    fireEvent.click(boton);
    fireEvent.click(boton);

    await waitFor(() => expect(llamadasUpload()).toHaveLength(1));
  });
});
