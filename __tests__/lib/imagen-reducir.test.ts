/**
 * Fase B — fotos-1: reduccion de imagenes en el cliente.
 */
import {
  reducirImagen,
  dimensionesReducidas,
  tamanoBase64,
  MAX_ENTRADA_BYTES,
  LADO_MAX,
} from '@/lib/imagen-reducir';

function mockCanvas(dataUrl: string) {
  let canvas: any = null;
  const original = document.createElement.bind(document);
  jest.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return original(tag);
    canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ fillStyle: '', fillRect: jest.fn(), drawImage: jest.fn() }),
      toDataURL: () => dataUrl,
    };
    return canvas;
  }) as any);
  return () => canvas;
}

function mockImagen(ancho: number, alto: number) {
  class FakeImage {
    width = ancho;
    height = alto;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_valor: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  (global as any).Image = FakeImage;
}

afterEach(() => jest.restoreAllMocks());

describe('dimensionesReducidas', () => {
  it('escala el lado mayor a 1600 conservando proporcion', () => {
    expect(dimensionesReducidas(4000, 3000)).toEqual({ ancho: 1600, alto: 1200, cambio: true });
  });

  it('deja intacta una imagen que ya es menor', () => {
    expect(dimensionesReducidas(800, 600)).toEqual({ ancho: 800, alto: 600, cambio: false });
  });
});

describe('reducirImagen', () => {
  it('reduce una imagen grande a <= 1600 px y deja el base64 bajo 3 MB', async () => {
    mockImagen(4000, 3000);
    const leerCanvas = mockCanvas('data:image/jpeg;base64,' + 'A'.repeat(1000));

    const file = new File(['foto'], 'grande.jpg', { type: 'image/jpeg' });
    const dataUrl = await reducirImagen(file);

    const canvas = leerCanvas();
    expect(canvas.width).toBe(LADO_MAX);
    expect(canvas.height).toBe(1200);
    expect(dataUrl.startsWith('data:image/jpeg')).toBe(true);
    expect(tamanoBase64(dataUrl)).toBeLessThan(3 * 1024 * 1024);
  });

  it('rechaza un archivo de entrada mayor a 20 MB', async () => {
    const file = { type: 'image/jpeg', size: MAX_ENTRADA_BYTES + 1 } as File;
    await expect(reducirImagen(file)).rejects.toThrow(/20 MB/);
  });

  it('pinta el canvas de blanco antes de dibujar (PNG/WEBP con transparencia)', async () => {
    mockImagen(4000, 3000);
    const orden: string[] = [];
    let ctx: any = null;
    const original = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'canvas') return original(tag);
      ctx = {
        fillStyle: '',
        fillRect: jest.fn(() => orden.push('fillRect')),
        drawImage: jest.fn(() => orden.push('drawImage')),
      };
      return {
        width: 0,
        height: 0,
        getContext: () => ctx,
        toDataURL: () => 'data:image/jpeg;base64,AAAA',
      };
    }) as any);

    const file = new File(['foto'], 'transparente.png', { type: 'image/png' });
    await reducirImagen(file);

    expect(ctx.fillStyle).toBe('#ffffff');
    expect(orden).toEqual(['fillRect', 'drawImage']);
  });

  it('rechaza la foto si aun reducida el base64 supera 3 MB', async () => {
    mockImagen(4000, 3000);
    mockCanvas('data:image/jpeg;base64,' + 'A'.repeat(4.1 * 1024 * 1024));

    const file = new File(['foto'], 'pesada.jpg', { type: 'image/jpeg' });
    await expect(reducirImagen(file)).rejects.toThrow('La foto es muy pesada');
  });
});
