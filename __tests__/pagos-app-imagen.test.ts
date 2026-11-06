/**
 * @jest-environment node
 *
 * Fase B — N12d1: lectura del comprobante crudo de transferencia.
 * El helper recibe el Request tal cual llega (bytes, no base64) y
 * responde { mime, bytes } cuando la firma real coincide con el MIME
 * declarado, o null en cualquier otro caso.
 */

import { leerImagenComprobante } from '@/lib/pagos-app/imagen';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

const pedido = (bytes: Uint8Array, tipo: string) =>
  new Request('http://local/comprobante', {
    method: 'POST',
    headers: { 'content-type': tipo },
    body: bytes,
  });

const leer = async (bytes: Uint8Array, tipo: string) => {
  const res = await leerImagenComprobante(pedido(bytes, tipo));
  return res && { mime: res.mime, bytes: Array.from(res.bytes) };
};

describe('leerImagenComprobante', () => {
  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPEG],
    ['image/webp', WEBP],
  ])('acepta %s si los bytes son coherentes', async (tipo, bytes) => {
    await expect(leer(bytes, tipo)).resolves.toEqual({ mime: tipo, bytes: Array.from(bytes) });
  });

  it('rechaza bytes que no corresponden al MIME declarado', async () => {
    await expect(leer(PNG, 'image/jpeg')).resolves.toBeNull();
  });

  it('rechaza SVG', async () => {
    await expect(leer(SVG, 'image/svg+xml')).resolves.toBeNull();
    await expect(leer(SVG, 'image/png')).resolves.toBeNull();
  });

  it('rechaza más de 2 MiB aunque no venga content-length', async () => {
    const grande = new Uint8Array(2 * 1024 * 1024 + 1);
    grande.set(PNG);
    await expect(leer(grande, 'image/png')).resolves.toBeNull();
  });
});
