/**
 * @jest-environment jsdom
 *
 * Fase B — pos3a: selector de cliente del POS.
 * Riesgos: Enter/flechas, Esc, recientes en localStorage, búsqueda reutilizando
 * /api/clientes.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PosClienteDialog } from '@/components/PosClienteDialog';

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

const ANA = { id: 'c-ana', nombre: 'Ana Pérez' };
const LUIS = { id: 'c-luis', nombre: 'Luis Soto' };

function servidor(resultados = [ANA, LUIS]) {
  const fetchMock = jest.fn(async () => json({ data: resultados }));
  global.fetch = fetchMock as any;
  return fetchMock;
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('pos3 — selector de cliente', () => {
  it('sin búsqueda muestra los recientes como botones grandes', async () => {
    localStorage.setItem('pos-clientes-recientes', JSON.stringify([ANA, LUIS]));
    servidor();
    render(<PosClienteDialog open onOpenChange={jest.fn()} onSelect={jest.fn()} />);

    expect(await screen.findByTestId('pos-cliente-opcion-c-ana')).toBeTruthy();
    expect(screen.getByTestId('pos-cliente-opcion-c-luis')).toBeTruthy();
    expect(screen.getByText('Últimos usados')).toBeTruthy();
  });

  it('máximo 5 recientes', async () => {
    const siete = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, nombre: `Cliente ${i}` }));
    localStorage.setItem('pos-clientes-recientes', JSON.stringify(siete));
    servidor();
    render(<PosClienteDialog open onOpenChange={jest.fn()} onSelect={jest.fn()} />);

    await screen.findByTestId('pos-cliente-opcion-c0');
    expect(screen.getAllByText(/^Cliente \d$/)).toHaveLength(5);
  });

  it('Elegir guarda el reciente, llama onSelect y cierra', async () => {
    localStorage.setItem('pos-clientes-recientes', JSON.stringify([ANA]));
    servidor();
    const onSelect = jest.fn();
    const onOpenChange = jest.fn();
    render(<PosClienteDialog open onOpenChange={onOpenChange} onSelect={onSelect} />);

    fireEvent.click(await screen.findByTestId('pos-cliente-opcion-c-ana'));
    expect(onSelect).toHaveBeenCalledWith(ANA);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(JSON.parse(localStorage.getItem('pos-clientes-recientes')!)[0]).toEqual(ANA);
  });

  it('búsqueda: Enter elige el primero; flechas mueven el resaltado', async () => {
    const fetchMock = servidor();
    const onSelect = jest.fn();
    render(<PosClienteDialog open onOpenChange={jest.fn()} onSelect={onSelect} />);

    fireEvent.change(screen.getByPlaceholderText('Buscar cliente por nombre…'), { target: { value: 'an' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/clientes?q=an', expect.anything()));
    await screen.findByTestId('pos-cliente-opcion-c-ana');

    const input = screen.getByPlaceholderText('Buscar cliente por nombre…');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(LUIS);
  });

  it('Esc cierra el diálogo', async () => {
    servidor();
    const onOpenChange = jest.fn();
    render(<PosClienteDialog open onOpenChange={onOpenChange} onSelect={jest.fn()} />);
    fireEvent.keyDown(screen.getByPlaceholderText('Buscar cliente por nombre…'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
