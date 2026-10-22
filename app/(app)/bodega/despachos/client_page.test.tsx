import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { DespachosClient } from './client_page';

jest.mock('./client_page', () => {
  const actual = jest.requireActual('./client_page');
  return {
    ...actual,
    __esModule: true,
  };
});

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

global.fetch = jest.fn();
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  drawImage: jest.fn(),
}));
HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/jpeg;base64,mockdata');

const mockImage = {
  onload: null as any,
  onerror: null as any,
  src: '',
};
jest.spyOn(window, 'Image' as any).mockImplementation(() => {
  setTimeout(() => mockImage.onload?.(), 0);
  return mockImage;
});

const mockSession = {
  user: { name: 'Test User', rol: 'bodeguero', empresas: [1] }
};

describe('DespachosClient', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  it('muestra input de búsqueda al cargar', () => {
    render(<DespachosClient session={mockSession} empresaId={1} />);
    expect(screen.getByPlaceholderText(/número de nota/i)).toBeInTheDocument();
  });

  it('busca despacho al enviar el formulario', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    render(<DespachosClient session={mockSession} empresaId={1} />);
    fireEvent.change(screen.getByPlaceholderText(/número de nota/i), {
      target: { value: '12345' },
    });
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('folio=12345')
      );
    });
  });

  it('muestra mensaje cuando no se encuentra despacho', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    render(<DespachosClient session={mockSession} empresaId={1} />);
    fireEvent.change(screen.getByPlaceholderText(/número de nota/i), {
      target: { value: '99999' },
    });
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(screen.getByText(/no se encontró despacho/i)).toBeInTheDocument();
    });
  });

  it('muestra resultado cuando se encuentra despacho', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{
          id: 1,
          folio: '12345',
          imagen_url: 'https://res.cloudinary.com/test/image.jpg',
          empresa_nombre: 'SANJH',
          created_at: '2026-04-10T10:00:00Z',
          subido_por: 'bodeguero1',
        }],
      }),
    });

    render(<DespachosClient session={mockSession} empresaId={1} />);
    fireEvent.change(screen.getByPlaceholderText(/número de nota/i), {
      target: { value: '12345' },
    });
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      // selector: 'p' evita el <span> oculto del overlay aria-hidden de SpellCheckedInput
      expect(screen.getByText('12345', { selector: 'p' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /whatsapp/i })).toBeInTheDocument();
    });
  });

  it('muestra botón de cámara solo para bodeguero y admin', () => {
    const { rerender } = render(
      <DespachosClient session={{ user: { rol: 'vendedor', empresas: [1] } }} empresaId={1} />
    );
    expect(screen.queryByRole('button', { name: /cámara|foto|despacho/i })).toBeNull();

    rerender(
      <DespachosClient session={{ user: { rol: 'bodeguero', empresas: [1] } }} empresaId={1} />
    );
    expect(screen.getByRole('button', { name: /cámara|foto|despacho/i })).toBeInTheDocument();
  });

  it('procesa imagen y muestra toast de éxito', async () => {
    const { toast } = require('sonner');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, folio: '99887' }),
    });

    render(<DespachosClient session={mockSession} empresaId={1} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy'], 'nota.jpg', { type: 'image/jpeg' });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('99887')
      );
    });
  });
});
