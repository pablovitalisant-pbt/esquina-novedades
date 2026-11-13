/**
 * @jest-environment jsdom
 *
 * Fase B — sub-slice pedidos-pdf-lib: PDF del pedido en módulo puro.
 * Cubre casos 5-14 y 19-21 del contrato Fase A:
 * carga diferida, sin items, tabla, fecha de creación, N°, modalidad,
 * subtotal nulo, imagen caída, BUG-062, filename sanitizado, pago,
 * y compartir por WhatsApp (fallback / Web Share / AbortError / error).
 */

import {
  construirPdfPedido,
  nombreArchivoPedido,
  compartirPdfWhatsApp,
  type PedidoPdf,
} from '@/lib/pdf-pedido';
import { toast } from 'sonner';

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

// Contadores de evaluación de módulo para la carga diferida (N13).
var mockJsPdfCargas: number | undefined;
var mockAutoTableCargas: number | undefined;
let mockLastAutoTable: any = null;
let mockFinalY = 100;
let mockPageHeight = 280;

const mockText = jest.fn();
const mockSave = jest.fn();
const mockAddImage = jest.fn();
const mockAddPage = jest.fn();
const mockSetFont = jest.fn();
const mockSetFontSize = jest.fn();
const mockSetTextColor = jest.fn();
const mockSetFillColor = jest.fn();
const mockRect = jest.fn();
const mockRoundedRect = jest.fn();

jest.mock('jspdf-autotable', () => {
  mockAutoTableCargas = (mockAutoTableCargas ?? 0) + 1;
  return (_doc: any, options: any) => {
    mockLastAutoTable = options;
  };
});

jest.mock('jspdf', () => {
  mockJsPdfCargas = (mockJsPdfCargas ?? 0) + 1;
  class MockJsPDF {
    internal = { pageSize: { getWidth: () => 200, getHeight: () => mockPageHeight } };
    text = mockText;
    save = mockSave;
    addImage = mockAddImage;
    addPage = mockAddPage;
    setFont = mockSetFont;
    setFontSize = mockSetFontSize;
    setTextColor = mockSetTextColor;
    setFillColor = mockSetFillColor;
    rect = mockRect;
    roundedRect = mockRoundedRect;
    setDrawColor = jest.fn();
    setLineWidth = jest.fn();
    line = jest.fn();
    lastAutoTable = { get finalY() { return mockFinalY; } };
    splitTextToSize = (t: string) => [t];
  }
  return MockJsPDF;
});

const PEDIDO: PedidoPdf = {
  id: '67181656-22d3-4a80-8f63-6efc18d3d45d',
  cliente: { nombre: 'Juana Pérez', telefono: '+56 9 1111 2222' },
  email_contacto: 'juana@example.com',
  estado: 'pagado',
  entrega_codigo: 'delivery_iquique',
  entrega_costo: 3000,
  direccion_entrega: 'Av. Prat 123',
  total: 12990,
  created_at: '2026-11-10T14:05:00Z',
  mp_payment_id: '185751063980',
  items: [
    {
      codigo: '1055',
      detalle: 'Gallinita',
      cantidad: 2,
      modalidad: 'mayor',
      precio: 4995,
      subtotal: 9990,
      imagen_url: null,
    },
  ],
};

const textos = () => mockText.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  jest.clearAllMocks();
  mockLastAutoTable = null;
  mockFinalY = 100;
  mockPageHeight = 280;
  // Logo y share-image fallan por defecto: el PDF cae al wordmark y celdas vacías.
  (global.fetch as jest.Mock) = jest.fn(async () => ({ ok: false }));
  Object.defineProperty(window.navigator, 'canShare', { value: undefined, configurable: true });
  Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true });
});

describe('construirPdfPedido', () => {
  it('5. sin items → null y no evalúa jspdf', async () => {
    const doc = await construirPdfPedido({ ...PEDIDO, items: [] });
    expect(doc).toBeNull();
    expect(mockJsPdfCargas).toBeUndefined();
    expect(mockAutoTableCargas).toBeUndefined();
  });

  it('6. con items → tabla con columna Imagen primero y sin addPage si cabe', async () => {
    const doc = await construirPdfPedido(PEDIDO);
    expect(doc).not.toBeNull();
    expect(mockLastAutoTable.head[0]).toEqual([
      'Imagen', 'Código', 'Descripción', 'Unidades', 'Precio', 'Total', 'Modalidad',
    ]);
    expect(mockLastAutoTable.body[0]).toEqual([
      '', '1055', 'Gallinita', 2, '$4.995', '$9.990', 'POR MAYOR',
    ]);
    expect(Object.keys(mockLastAutoTable.columnStyles)).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    expect(mockAddPage).not.toHaveBeenCalled();
  });

  it('7. la fecha del PDF es created_at, no la de hoy', async () => {
    await construirPdfPedido(PEDIDO);
    expect(textos()).toContain('Fecha: 10 de noviembre de 2026');
    expect(textos()).not.toContain(`Fecha: ${new Date().toLocaleDateString('es-CL', {
      day: '2-digit', month: 'long', year: 'numeric',
    })}`);
  });

  it('8. N° = primeros 8 caracteres del UUID en mayúscula', async () => {
    await construirPdfPedido(PEDIDO);
    expect(textos()).toContain('N°: 67181656');
    expect(textos().some((t) => t.includes(PEDIDO.id))).toBe(false);
  });

  it('9. modalidad mayor → POR MAYOR; detalle u otro → POR MENOR', async () => {
    await construirPdfPedido(PEDIDO);
    expect(mockLastAutoTable.body[0][6]).toBe('POR MAYOR');

    mockLastAutoTable = null;
    await construirPdfPedido({
      ...PEDIDO,
      items: [{ ...PEDIDO.items[0], modalidad: 'detalle' }],
    });
    expect(mockLastAutoTable.body[0][6]).toBe('POR MENOR');
  });

  it('10. subtotal null → precio * cantidad', async () => {
    await construirPdfPedido({
      ...PEDIDO,
      items: [{ ...PEDIDO.items[0], cantidad: 3, precio: 1500, subtotal: null }],
    });
    expect(mockLastAutoTable.body[0][4]).toBe('$1.500');
    expect(mockLastAutoTable.body[0][5]).toBe('$4.500');
  });

  it('11. imagen que falla (403/500/red) → no rompe ni llama addImage', async () => {
    (global.fetch as jest.Mock) = jest.fn(async () => ({ ok: false }));
    const doc = await construirPdfPedido({
      ...PEDIDO,
      items: [{ ...PEDIDO.items[0], imagen_url: 'https://res.cloudinary.com/x/img.png' }],
    });
    expect(doc).not.toBeNull();
    expect(mockAddImage).not.toHaveBeenCalled();
  });

  it('12. BUG-062: si los totales caen en la banda del footer, salta de página', async () => {
    mockFinalY = 270; // pageHeight 280 → footerBandY 264
    await construirPdfPedido(PEDIDO);
    expect(mockAddPage).toHaveBeenCalled();
  });

  it('13. nombreArchivoPedido sanitiza / \\ : * ? " < > | y colapsa espacios', () => {
    expect(nombreArchivoPedido(PEDIDO)).toBe('Pedido 67181656 - Juana Pérez.pdf');
    const raro = {
      ...PEDIDO,
      cliente: { ...PEDIDO.cliente, nombre: 'Juana/Pérez: "Test" <x>|y\\z*?' },
    };
    const filename = nombreArchivoPedido(raro);
    expect(filename).toBe('Pedido 67181656 - Juana Pérez Test x y z.pdf');
    expect(filename).not.toMatch(/[\/\\:*?"<>|]/);
    expect(nombreArchivoPedido({ ...PEDIDO, cliente: { nombre: null, telefono: null } }))
      .toBe('Pedido 67181656 - Sin nombre.pdf');
  });

  it('14. Pago: metodo_pago conocido; si no, mp_payment_id; si no, se omite', async () => {
    await construirPdfPedido({ ...PEDIDO, metodo_pago: 'transferencia' });
    expect(textos()).toContain('Estado: Pagado');
    expect(textos()).toContain('Pago: Transferencia');

    mockText.mockClear();
    await construirPdfPedido({ ...PEDIDO, metodo_pago: null, mp_payment_id: '999' });
    expect(textos()).toContain('Pago: Mercado Pago');

    mockText.mockClear();
    await construirPdfPedido({ ...PEDIDO, metodo_pago: null, mp_payment_id: null });
    expect(textos().some((t) => t.startsWith('Pago:'))).toBe(false);
  });

  it('15. bajo la tabla dibuja Subtotal productos y Entrega con su etiqueta', async () => {
    await construirPdfPedido(PEDIDO);
    expect(textos()).toContain('Subtotal productos: $9.990');
    expect(textos()).toContain('Entrega (Delivery Iquique): $3.000');
  });

  it('16. subtotal productos + entrega cuadran con el Total', async () => {
    // PEDIDO: 9.990 de productos + 3.000 de delivery = 12.990.
    await construirPdfPedido(PEDIDO);
    expect(textos()).toContain('Total: $12.990');
    expect(PEDIDO.total).toBe(9990 + 3000);
  });

  it('17. BUG-062 con Pago: el alto real del bloque nuevo fuerza addPage', async () => {
    // finalY 212: el cálculo viejo (Estado + Gracias) cabía; el nuevo (+Pago) no.
    mockFinalY = 212;
    await construirPdfPedido({ ...PEDIDO, mp_payment_id: '999' });
    expect(mockAddPage).toHaveBeenCalled();
  });

  it('18. BUG-062 sin Pago: Gracias en +52 (no +46) fuerza addPage', async () => {
    // pageHeight 297 → footerBandY 281. f=218: gracias = 228+52 = 280 → 284 > 281.
    // Con la fórmula corta (228+46 = 274 → 278) NO saltaría: este test la delata.
    mockPageHeight = 297;
    mockFinalY = 218;
    await construirPdfPedido({ ...PEDIDO, mp_payment_id: null, metodo_pago: null });
    expect(mockAddPage).toHaveBeenCalled();
  });

  it('19. el baseline de "Gracias" nunca queda bajo la banda del footer', async () => {
    const casos = [
      { page: 280, finalY: 270, pedido: PEDIDO },                                        // test 12
      { page: 280, finalY: 212, pedido: { ...PEDIDO, mp_payment_id: '999' } },           // test 17
      { page: 297, finalY: 218, pedido: { ...PEDIDO, mp_payment_id: null, metodo_pago: null } }, // test 18
    ];
    for (const caso of casos) {
      mockText.mockClear();
      mockAddPage.mockClear();
      mockPageHeight = caso.page;
      mockFinalY = caso.finalY;
      await construirPdfPedido(caso.pedido);
      const gracias = mockText.mock.calls.find((c) => c[0] === 'Gracias por su compra');
      expect(gracias).toBeDefined();
      expect(Number(gracias![2])).toBeLessThan(caso.page - 16);
    }
  });
});

describe('compartirPdfWhatsApp', () => {
  const docFake = () => ({
    save: mockSave,
    output: jest.fn(() => new Blob(['pdf'], { type: 'application/pdf' })),
  }) as any;

  it('19. sin canShare → descarga y aviso, no llama share', async () => {
    const save = jest.fn();
    const doc = { save, output: jest.fn() } as any;
    await compartirPdfWhatsApp(doc, 'Pedido 67181656 - Juana.pdf', 'Pedido 67181656');
    expect(save).toHaveBeenCalledWith('Pedido 67181656 - Juana.pdf');
    expect(toast.warning).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('20. con canShare → share con un File application/pdf, sin descargar', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(window.navigator, 'share', { value: share, configurable: true });
    const save = jest.fn();
    const doc = { save, output: jest.fn(() => new Blob(['pdf'], { type: 'application/pdf' })) } as any;

    await compartirPdfWhatsApp(doc, 'Pedido 67181656 - Juana.pdf', 'Pedido 67181656');

    expect(share).toHaveBeenCalledTimes(1);
    const { files } = share.mock.calls[0][0];
    expect(files[0].name).toBe('Pedido 67181656 - Juana.pdf');
    expect(files[0].type).toBe('application/pdf');
    expect(save).not.toHaveBeenCalled();
  });

  it('21a. AbortError (usuario cierra el selector) → sin toast.error', async () => {
    const abort = Object.assign(new Error('abort'), { name: 'AbortError' });
    Object.defineProperty(window.navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(window.navigator, 'share', { value: jest.fn().mockRejectedValue(abort), configurable: true });

    await compartirPdfWhatsApp(docFake(), 'x.pdf', 'x');
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('21b. share falla por otro motivo → toast.error', async () => {
    Object.defineProperty(window.navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(window.navigator, 'share', {
      value: jest.fn().mockRejectedValue(new Error('boom')),
      configurable: true,
    });

    await compartirPdfWhatsApp(docFake(), 'x.pdf', 'x');
    expect(toast.error).toHaveBeenCalled();
  });
});
