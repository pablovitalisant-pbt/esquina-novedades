/**
 * @jest-environment jsdom
 *
 * Fase B — exportarPDF de Notas de Venta (logo, dirección, imágenes).
 * R1: estado de carga en el botón evita doble clic (async).
 * R2: imagen que falla (sin imagen_url / 404 / red) → celda en blanco, no rompe.
 * R3: async — exportarPDF espera los fetch de imágenes antes de armar el PDF.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';
import { toast } from 'sonner';

// ─── Mocks ──────────────────────────────────────────────────────
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
jest.mock('xlsx', () => ({ utils: { json_to_sheet: jest.fn(), book_new: jest.fn(), book_append_sheet: jest.fn(), writeFile: jest.fn() } }));
// Captura el config de autoTable para inspeccionar head/body/columnStyles.
let lastAutoTableConfig: any = null;
jest.mock('jspdf-autotable', () => (_doc: any, options: any) => { lastAutoTableConfig = options; });
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useParams: () => ({ id: '1' }) }));

jest.mock('@/components/PagarNotaDialog', () => ({ PagarNotaDialog: () => null }));

// Mock de jsPDF ampliado: texto, guardar, fuente, tamaño, imagen, dibujo de celda.
const addImage = jest.fn();
const setFont = jest.fn();
const text = jest.fn();
const save = jest.fn();
const setTextColor = jest.fn();
const setFillColor = jest.fn();
const roundedRect = jest.fn();
const setDrawColor = jest.fn();
const setLineWidth = jest.fn();
const line = jest.fn();
const addPage = jest.fn();
// finalY configurable por test: valor bajo por defecto → el bloque de totales
// cabe en la misma página. Test de BUG-062 lo sube para forzar el addPage().
let mockFinalY = 100;
jest.mock('jspdf', () => {
  class MockJsPDF {
    internal = { pageSize: { getWidth: () => 200, getHeight: () => 280 } };
    addImage = addImage;
    setFont = setFont;
    text = text;
    save = save;
    setFontSize = jest.fn();
    setFillColor = setFillColor;
    rect = jest.fn();
    roundedRect = roundedRect;
    setTextColor = setTextColor;
    setDrawColor = setDrawColor;
    setLineWidth = setLineWidth;
    line = line;
    lastAutoTable = { get finalY() { return mockFinalY; } };
    addPage = addPage;
  }
  return MockJsPDF;
});

// Fábrica de fetch: imagen exitosa, imagen que falla, o sin imagen_url.
function mockFetchConImagenes(opcion: 'ok' | 'falla' | 'sin-imagen', dolar: string = '1200') {
  return jest.fn((url: string, opts?: any) => {
    if (url === '/api/notas-venta/1' && (!opts || opts.method === undefined)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: '1', estado: 'activa', titulo: 'Nota PDF', cliente_nombre: 'Cliente X',
          saldo_pendiente: 0, total_pagado: 0,
          items: [{
            id: 1, codigo: 'A', descripcion: 'Item A',
            imagen_url: opcion === 'sin-imagen' ? null : 'https://res.cloudinary.com/x/img.png',
            cajas: 1, unidades: 2, precio: 10, subtotal: '20.00',
          }],
        }),
      });
    }
    if (url === '/api/caja/config') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { valor: dolar } }) });
    }
    if (typeof url === 'string' && url === '/logo-nota-venta.png') {
      // Logo del header: fetch → blob (mismo patrón que share-image)
      return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['logo'])) });
    }
    if (typeof url === 'string' && url.startsWith('/api/share-image')) {
      if (opcion === 'falla') return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as any;
}

async function renderNota(fetchMock: any) {
  global.fetch = fetchMock;
  render(<PrenotaDetallePage session={{}} params={{ id: '1' }} />);
  await screen.findByText('Nota PDF');
}

describe('exportarPDF — logo, dirección e imágenes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // R1: el botón muestra estado de carga y evita doble clic mientras se descargan imágenes
  it('R1: al exportar, el botón muestra "Generando PDF..." y queda deshabilitado', async () => {
    await renderNota(mockFetchConImagenes('ok'));

    const boton = screen.getByText('Exportar PDF');
    fireEvent.click(boton);

    // Estado de carga mientras se descarga la imagen
    await waitFor(() => {
      expect(screen.getByText('Generando PDF...')).toBeInTheDocument();
    });
    // El botón original queda deshabilitado (o reemplazado por el estado de carga)
    expect(screen.getByText('Generando PDF...').closest('button')).toBeDisabled();
    // Esperar la finalización del exportPDF (save se llama al final) para que su
    // async no filtre /api/share-image al global.fetch del siguiente test.
    await waitFor(() => expect(save).toHaveBeenCalled());
  });

  // R3: es async — espera el fetch de la imagen antes de llamar addImage
  it('R3: exportarPDF hace fetch a /api/share-image y dibuja la imagen en el PDF', async () => {
    await renderNota(mockFetchConImagenes('ok'));

    fireEvent.click(screen.getByText('Exportar PDF'));

    await waitFor(() => {
      const shareCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].startsWith('/api/share-image')
      );
      expect(shareCalls.length).toBe(1);
    });
    // Esperar la finalización del exportPDF para que su async no filtre
    // /api/share-image al global.fetch del siguiente test.
    await waitFor(() => expect(save).toHaveBeenCalled());
  });

  // R2: imagen que falla (404/red) → no rompe, sigue armando el PDF
  it('R2: imagen que falla → celda en blanco, no rompe y aún así guarda el PDF', async () => {
    await renderNota(mockFetchConImagenes('falla'));

    fireEvent.click(screen.getByText('Exportar PDF'));

    // No lanza excepción; el PDF igual se guarda
    await waitFor(() => expect(save).toHaveBeenCalled());
  });

  // R2b: sin imagen_url → no fetchea imagen de producto (pero sí dibuja el logo), PDF se guarda
  it('R2b: sin imagen_url → no llama a /api/share-image, pero guarda el PDF', async () => {
    await renderNota(mockFetchConImagenes('sin-imagen'));

    fireEvent.click(screen.getByText('Exportar PDF'));

    await waitFor(() => expect(save).toHaveBeenCalled());
    const shareCalls = (global.fetch as jest.Mock).mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].startsWith('/api/share-image')
    );
    expect(shareCalls.length).toBe(0);
    // Sin logo ni imágenes de producto: no se dibuja ninguna imagen.
    expect(addImage).not.toHaveBeenCalled();
  });

  // R1b: wordmark de texto + dirección en el header (sin logo PNG)
  it('R1b: escribe nombre y dirección en el header', async () => {
    await renderNota(mockFetchConImagenes('ok'));

    fireEvent.click(screen.getByText('Exportar PDF'));

    await waitFor(() => {
      const todos = text.mock.calls.map((c: any[]) => c[0]);
      expect(todos).toContain('La Esquina de las Novedades');
      expect(todos).toContain('Avenida Aeropuerto 2860');
    });
    // Esperar la finalización del exportPDF para que su async no filtre
    // /api/share-image al global.fetch del siguiente test.
    await waitFor(() => expect(save).toHaveBeenCalled());
  });
});

describe('exportarPDF — montos en CLP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastAutoTableConfig = null;
  });

  // R1: con dolar_dia > 0, Precio y Total de cada fila llevan línea ARS secundaria.
  it('R1: filas de producto tienen Precio y Total con línea ARS debajo del USD', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    expect(lastAutoTableConfig).toBeTruthy();
    const body = lastAutoTableConfig.body as any[];
    expect(body.length).toBe(1);
    // Alineamiento con head de 7 columnas: celda 0 (Imagen) vacía, se dibuja
    // aparte vía didDrawCell. Ver BUGS.md.
    expect(body[0]).toHaveLength(8);
    expect(body[0][0]).toBe('');
    // Precio y Total en CLP entero, sin USD ni línea ARS.
    expect(body[0][5]).toBe('$10');
    expect(body[0][6]).toBe('$20');
    // 5d: columna Modalidad al final.
    expect(body[0][7]).toBe('Unidad');
  });

  // R2: Total, Pagado y Pendiente del resumen en CLP.
  it('R2: Total, Pagado y Pendiente en CLP, sin USD ni AR$', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    const todos = text.mock.calls.map((c: any[]) => c[0]).flat().filter((t: any) => typeof t === 'string');
    expect(todos).toContain('Total: $20');
    expect(todos).toContain('Pagado: $0');
    expect(todos).toContain('Pendiente: $0');
    expect(todos.some(t => /USD|AR\$|≈/.test(t))).toBe(false);
  });
});

describe('exportarPDF — rediseño visual (slice)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastAutoTableConfig = null;
  });

  const todosText = () =>
    text.mock.calls.map((c: any[]) => c[0]).flat().filter((t: any) => typeof t === 'string');

  // R1: header — banda brand-strong (#D4A96E) + título grande "NOTA DE VENTA".
  it('R1: dibuja banda brand-strong y escribe el título "NOTA DE VENTA"', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    // setFillColor se llama al menos una vez con brand-strong (#D4A96E)
    const accent = setFillColor.mock.calls.some(
      (c: any[]) => c[0] === 255 && c[1] === 182 && c[2] === 18
    );
    expect(accent).toBe(true);
    // Título grande presente
    expect(todosText().some(t => t === 'NOTA DE VENTA')).toBe(true);
  });

  // R2: bloque de info — "Nota de venta para:" + N° y Fecha como etiqueta/valor.
  it('R2: escribe "Nota de venta para:", N° (id) y Fecha', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    const todos = todosText();
    // label y valor del cliente se dibujan como elementos separados
    expect(todos.some(t => t.includes('Nota de venta para:'))).toBe(true);
    expect(todos.some(t => t === 'Cliente X')).toBe(true);
    expect(todos.some(t => t.includes('N°:') && t.includes('1'))).toBe(true);
    expect(todos.some(t => t.startsWith('Fecha:'))).toBe(true);
  });

  // R3: tabla — header dark #1F2937, texto blanco, zebra striping, columna renombrada.
  it('R3: header de tabla dark, texto blanco, zebra y columna "Cantidad de Cajas"', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    expect(lastAutoTableConfig).toBeTruthy();
    expect(lastAutoTableConfig.headStyles.fillColor).toEqual([31, 41, 55]); // dark #1F2937
    expect(lastAutoTableConfig.headStyles.textColor).toBe(255);            // texto blanco
    // Zebra striping: autoTable usa alternateRowStyles cuando se activa
    expect(lastAutoTableConfig.alternateRowStyles).toBeTruthy();

    const head = lastAutoTableConfig.head[0] as string[];
    // Columna 3 renombrada: "Cajas" → "Cantidad de Cajas"
    expect(head[3]).toBe('Cantidad de Cajas');
    // Columna Imagen (index 0) NO cambia de posición ni de nombre
    expect(head[0]).toBe('Imagen');
    expect(head[3]).toBe('Cantidad de Cajas');
    expect(head).toHaveLength(8);
    expect(head[7]).toBe('Modalidad');
  });

  // R4: BUG-039 — la columna Imagen (index 0) se mantiene sincronizada:
  //      celda vacía en body, columnStyles[0].cellWidth=16, didDrawCell la dibuja.
  it('R4 (BUG-039): columna Imagen index 0 intacta — celda vacía, ancho y didDrawCell', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    const body = lastAutoTableConfig.body as any[];
    expect(body[0][0]).toBe('');
    expect(lastAutoTableConfig.columnStyles[0].cellWidth).toBe(18);
    expect(typeof lastAutoTableConfig.didDrawCell).toBe('function');
    // La columna Imagen está en la posición 0 (no reordenada)
    expect(lastAutoTableConfig.head[0][0]).toBe('Imagen');
  });

  // R5: totales — caja "Total" resaltada con brand-strong, con línea ARS.
  it('R5: Total resaltado en brand-strong y mantiene línea ARS', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    const todos = todosText();
    expect(todos).toContain('Total: $20');
    // Pagado/Pendiente siguen presentes, reestilizados
    expect(todos.some(t => t.startsWith('Pagado:'))).toBe(true);
    expect(todos.some(t => t.startsWith('Pendiente:'))).toBe(true);
  });

  // R6: footer — "Gracias por su compra", firma autorizada, teléfonos, dirección y web.
  it('R6: escribe footer de agradecimiento, firma, teléfonos, dirección y website', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    const todos = todosText().join('\n');
    expect(todos).toContain('Gracias por su compra');
    // "Firma autorizada" fue eliminada del contrato visual (no estaba en el pedido)
    expect(todos).not.toContain('Firma autorizada');
    expect(todos).toContain('+56 9 7340 9133');
    expect(todos).toContain('La Esquina de las Novedades');
    expect(todos).toContain('Avenida Aeropuerto 2860');
    expect(todos).toContain('Iquique');
    expect(todos).toContain('11:00 a 20:00');
    expect(todos).not.toMatch(/bermejo|tarija|bolivia|bazar/i);
  });

  // R7: no se inventan secciones inexistentes — sin Tax/IVA ni Terms & Conditions.
  it('R7: no inventa Tax/IVA ni Terms & Conditions (no existen en el negocio)', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    const todos = todosText().join('\n');
    expect(todos).not.toMatch(/Tax/i);
    expect(todos).not.toMatch(/IVA/i);
    expect(todos).not.toMatch(/Terms/i);
    expect(todos).not.toMatch(/Payment/i);
  });
});

describe('exportarPDF — fila de totales (foot: Cantidad de Cajas + Unidades)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastAutoTableConfig = null;
  });

  // Fase B, intento de ruptura 1: el foot debe sumar cajas y unidades del body.
  // El item mock tiene cajas:1, unidades:2 → esperamos TOTALES | 1 | 2.
  it('F1: foot suma cajas y unidades con el color de acento', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    expect(lastAutoTableConfig).toBeTruthy();
    const foot = lastAutoTableConfig.foot as any[];
    expect(foot).toBeDefined();
    expect(foot).toHaveLength(1);                       // una sola fila de totales

    const celdas = foot[0];
    // 8 columnas en total: TOTALES(colSpan 3) + cajas + unidades + vacía(colSpan 2) + Modalidad
    const anchoTotal = celdas.reduce((acc: number, c: any) => acc + (c.colSpan || 1), 0);
    expect(anchoTotal).toBe(8);

    // Label alineado a la derecha en la primera celda fusionada
    expect(celdas[0].content).toBe('TOTALES NETOS');
    expect(celdas[0].colSpan).toBe(3);
    expect(celdas[0].styles?.halign).toBe('right');
    // Sumas del item mock: cajas=1, unidades=2 → formato con label
    expect(celdas[1].content).toBe('1 cajas');
    expect(celdas[2].content).toBe('2 unidades');
    // "unidades" absorbe la columna Precio (vacía en esa fila) → colSpan 2
    expect(celdas[2].colSpan).toBe(2);
    // Celda vacía final queda solo sobre la columna Total → colSpan 1
    expect(celdas[3].content).toBe('');
    expect(celdas[3].colSpan).toBe(1);

    // Mismo lenguaje visual que la caja "Total": --accent #FFB612 / --heading
    expect(lastAutoTableConfig.footStyles.fillColor).toEqual([255, 182, 18]);
    expect(lastAutoTableConfig.footStyles.textColor).toEqual([35, 31, 32]);
    expect(lastAutoTableConfig.footStyles.fontStyle).toBe('bold');

    // Fix de duplicación: el foot solo se pinta en la última página del autoTable.
    expect(lastAutoTableConfig.showFoot).toBe('lastPage');
  });

  // Fase B, intento de ruptura 2 (zona frágil BUG-039): el foot NO debe disparar
  // el dibujo de imagen. didDrawCell filtra data.section === 'body'.
  it('F2: didDrawCell ignora la sección foot — no dibuja imagen en la fila de totales', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    expect(typeof lastAutoTableConfig.didDrawCell).toBe('function');

    // Simular el callback con una celda de la fila foot (col 0, como una imagen).
    // addImage ya se usó para el logo del header → capturar el baseline.
    const antes = addImage.mock.calls.length;
    lastAutoTableConfig.didDrawCell({ column: { index: 0 }, row: { index: 0 }, section: 'foot', cell: {} });
    expect(addImage.mock.calls.length).toBe(antes); // el foot NO dibuja imagen

    // Y con una celda body SÍ dibuja (regresión: no se rompió el camino original).
    lastAutoTableConfig.didDrawCell({ column: { index: 0 }, row: { index: 0 }, section: 'body', cell: {} });
    expect(addImage.mock.calls.length).toBe(antes + 1);
  });

  // Fase B, intento de ruptura 3: las sumas no colisionan con el "total" en USD
  // del resumen (la caja "Total" de abajo sigue presente y con línea ARS).
  it('F3: la caja Total en USD del resumen sigue intacta', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    const todos = text.mock.calls.map((c: any[]) => c[0]).flat().filter((t: any) => typeof t === 'string');
    expect(todos).toContain('Total: $20');
  });
});

describe('exportarPDF — BUG-062: bloque de totales desbordado', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastAutoTableConfig = null;
    mockFinalY = 100; // valor bajo por defecto: el bloque cabe en la misma página
  });

  // F1: tabla larga (finalY alto) → el bloque de totales cae sobre la banda del
  // footer / fuera de página → se mueve a una hoja nueva con doc.addPage().
  it('F1: con finalY alto → addPage() antes de dibujar totales, y estos se dibujan', async () => {
    mockFinalY = 220; // fuerza el bloque de totales a desbordar (ver cálculos BUG-062)
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    expect(addPage).toHaveBeenCalled();
    // Los totales se dibujan igual (en la página nueva)
    const todos = text.mock.calls.map((c: any[]) => c[0]).flat().filter((t: any) => typeof t === 'string');
    expect(todos).toContain('Total: $20');
    expect(todos.some(t => t.startsWith('Pagado:'))).toBe(true);
    expect(todos.some(t => t.startsWith('Pendiente:'))).toBe(true);
  });

  // F2: pocos ítems (finalY bajo) → NO se llama addPage() (no regresionar el caso simple).
  it('F2: con finalY bajo → NO se llama addPage()', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(addPage).not.toHaveBeenCalled();
  });

  // F3: Total/Pagado/Pendiente siempre se escriben con doc.text, sin importar la página.
  it('F3: Total/Pagado/Pendiente siempre se escriben con doc.text', async () => {
    await renderNota(mockFetchConImagenes('ok'));
    fireEvent.click(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(save).toHaveBeenCalled());

    const todos = text.mock.calls.map((c: any[]) => c[0]).flat().filter((t: any) => typeof t === 'string');
    expect(todos.some(t => t.startsWith('Total:'))).toBe(true);
    expect(todos.some(t => t.startsWith('Pagado:'))).toBe(true);
    expect(todos.some(t => t.startsWith('Pendiente:'))).toBe(true);
  });
});
