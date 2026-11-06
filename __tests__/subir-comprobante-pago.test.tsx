/**
 * @jest-environment jsdom
 *
 * Fase B — N12d3: SubirComprobantePago({ pagoId }) selecciona una imagen,
 * la envía como File crudo al endpoint privado y recarga al éxito.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { SubirComprobantePago } from '@/components/pagos-app/SubirComprobantePago';

const png = () => new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], 'pago.png', { type: 'image/png' });

function elegir(file: File) {
  fireEvent.change(screen.getByLabelText(/^comprobante$/i), { target: { files: [file] } });
  return screen.getByRole('button', { name: /adjuntar comprobante/i });
}

beforeEach(() => {
  refresh.mockClear();
  global.fetch = jest.fn();
});

it('envía el File crudo al endpoint del pago y refresca al éxito', async () => {
  const file = png();
  (fetch as jest.Mock).mockResolvedValue({ ok: true });

  render(<SubirComprobantePago pagoId="pago-1" />);
  fireEvent.click(elegir(file));

  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  const [url, init] = (fetch as jest.Mock).mock.calls[0];
  expect(url).toBe('/api/admin/pagos-app/pago-1/comprobante');
  expect(init.method).toBe('POST');
  expect(init.body).toBe(file);
});

it('muestra el error y no refresca si la subida falla', async () => {
  (fetch as jest.Mock).mockResolvedValue({ ok: false });

  render(<SubirComprobantePago pagoId="pago-2" />);
  fireEvent.click(elegir(png()));

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});

it('no envía dos veces ante doble click', async () => {
  let resolver!: (valor: unknown) => void;
  (fetch as jest.Mock).mockReturnValue(new Promise((r) => { resolver = r; }));

  render(<SubirComprobantePago pagoId="pago-3" />);
  const boton = elegir(png());
  fireEvent.click(boton);
  fireEvent.click(boton);

  expect(fetch).toHaveBeenCalledTimes(1);
  resolver({ ok: true });
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});
