// PDF del pedido: módulo puro que replica el estilo de la Nota de Venta
// (app/(app)/notas-venta/[id]/client_page.tsx, construirDocPDF).
// La unificación de ambos builders queda como deuda de backlog.
import type jsPDF from 'jspdf';
import { toast } from 'sonner';
import { EMPRESA, hexToRgb } from '@/lib/empresa';
import { formatCLP } from '@/lib/utils';
import { ESTADO_LABEL, ENTREGA_LABEL, ETIQUETA_PAGO } from '@/lib/pedidos/etiquetas';

export type PedidoPdfItem = {
  codigo: string;
  detalle: string | null;
  cantidad: number;
  modalidad: string; // 'mayor' | otro
  precio: number;
  subtotal: number | null;
  imagen_url?: string | null;
};

export type PedidoPdf = {
  id: string;
  cliente: { nombre: string | null; telefono: string | null };
  email_contacto: string | null;
  estado: string;
  entrega_codigo: string | null;
  entrega_costo: number;
  direccion_entrega: string | null;
  total: number;
  created_at: string;
  metodo_pago?: string | null;
  mp_payment_id?: string | null;
  items: PedidoPdfItem[];
};

// Colores de marca para jsPDF (no lee CSS vars): hex de EMPRESA → [r, g, b].
const PRIMARIO = hexToRgb(EMPRESA.colores.primario);
const ACENTO = hexToRgb(EMPRESA.colores.acento);
const TINTA = hexToRgb(EMPRESA.colores.tinta);
const FONDO_SUAVE = hexToRgb(EMPRESA.colores.fondoSuave);
const TEXTO_CLARO = hexToRgb(EMPRESA.colores.textoClaro);
const BORDE = hexToRgb(EMPRESA.colores.borde);

type CellHookData = {
  column: { index: number };
  row?: { index: number };
  section: string;
  cell: { x: number; y: number };
};

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const numeroPedido = (id: string) => id.slice(0, 8).toUpperCase();

/** `Pedido <N°> - <cliente>.pdf`, sin em dash y sin caracteres inválidos de archivo. */
export function nombreArchivoPedido(pedido: PedidoPdf): string {
  const cliente = (pedido.cliente?.nombre || 'Sin nombre')
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Sin nombre';
  return `Pedido ${numeroPedido(pedido.id)} - ${cliente}.pdf`;
}

export function descargarPdf(doc: jsPDF, filename: string): void {
  doc.save(filename);
}

/** Igual que compartirWhatsApp de la nota: Web Share con archivos o descarga + aviso. */
export async function compartirPdfWhatsApp(doc: jsPDF, filename: string, titulo: string): Promise<void> {
  if (navigator.canShare && navigator.share) {
    const blob = doc.output('blob');
    const pdfFile = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({ files: [pdfFile], title: titulo });
        return; // éxito — no cae al fallback
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return; // usuario cerró el selector
        toast.error('No se pudo compartir el PDF por WhatsApp');
        return;
      }
    }
  }
  doc.save(filename);
  toast.warning('Tu navegador no soporta compartir el PDF directo. Adjúntalo manualmente en WhatsApp.');
}

export async function construirPdfPedido(pedido: PedidoPdf): Promise<jsPDF | null> {
  if (!pedido?.items?.length) return null;
  // Carga diferida: jsPDF + autotable solo pesan cuando se genera un PDF.
  // `default` explícito para compatibilidad con Jest (CJS interop).
  let jsPDF: typeof import('jspdf').default;
  let autoTable: typeof import('jspdf-autotable').default;
  try {
    [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
  } catch {
    toast.error('No se pudo cargar el generador de PDF');
    return null;
  }
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const fecha = new Date(pedido.created_at).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  // ─── Header: banda oro + logo/marca + razón social; título "PEDIDO" ───
  doc.setFillColor(...ACENTO);
  doc.rect(0, 0, pageWidth, 4, 'F');

  let logoDibujado = false;
  if (EMPRESA.logoNota) {
    try {
      const res = await fetch(EMPRESA.logoNota);
      if (res.ok) {
        doc.addImage(await blobToDataURL(await res.blob()), 'PNG', 14, 12, 30, 14);
        logoDibujado = true;
      }
    } catch {
      // Fallback silencioso al wordmark.
    }
  }
  if (!logoDibujado) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...TINTA);
    doc.text(EMPRESA.nombre, 14, 20);
  }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TINTA);
  doc.text(EMPRESA.razonSocial, 14, 31);
  doc.text(EMPRESA.direccion, 14, 36);
  doc.text(EMPRESA.ciudad, 14, 41);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(...TINTA);
  doc.text('PEDIDO', pageWidth - 14, 20, { align: 'right' });

  // ─── Caja "Pedido para:" (alto dinámico, N07b) + caja N°/Fecha ───
  const clienteNombre = pedido.cliente?.nombre || 'Sin nombre';
  const clienteDireccion = (pedido.direccion_entrega || '').trim();
  const clienteTelefono = (pedido.cliente?.telefono || '').trim();
  const clienteEmail = (pedido.email_contacto || '').trim();
  const infoY = 46;
  const rightBoxH = 22;
  const leftBoxW = 96;
  const rightBoxW = 62;
  const rightBoxX = pageWidth - 14 - rightBoxW;
  const contactoX = 20;
  const contactoW = leftBoxW - 12;
  const nombreTexto = { fuente: 'helvetica', estilo: 'bold', tamano: 11 } as const;
  const contactoTexto = { fuente: 'helvetica', estilo: 'normal', tamano: 8 } as const;
  doc.setFont(nombreTexto.fuente, nombreTexto.estilo);
  doc.setFontSize(nombreTexto.tamano);
  const lineasNombre: string[] = doc.splitTextToSize(clienteNombre, contactoW);
  doc.setFont(contactoTexto.fuente, contactoTexto.estilo);
  doc.setFontSize(contactoTexto.tamano);
  const lineasContacto: string[] = [];
  if (clienteDireccion) lineasContacto.push(...doc.splitTextToSize(`Dirección: ${clienteDireccion}`, contactoW));
  if (clienteTelefono) lineasContacto.push(...doc.splitTextToSize(`Teléfono: ${clienteTelefono}`, contactoW));
  if (clienteEmail) lineasContacto.push(...doc.splitTextToSize(`Email: ${clienteEmail}`, contactoW));
  const leftBoxH = Math.max(rightBoxH, 14 + lineasNombre.length * 6 + lineasContacto.length * 5);
  doc.setFillColor(...FONDO_SUAVE);
  doc.roundedRect(14, infoY, leftBoxW, leftBoxH, 2, 2, 'F');
  doc.roundedRect(rightBoxX, infoY, rightBoxW, rightBoxH, 2, 2, 'F');
  doc.setTextColor(...TINTA);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Pedido para:', contactoX, infoY + 8);
  doc.setFont(nombreTexto.fuente, nombreTexto.estilo);
  doc.setFontSize(nombreTexto.tamano);
  let yContacto = infoY + 15;
  for (const linea of lineasNombre) {
    doc.text(linea, contactoX, yContacto);
    yContacto += 6;
  }
  doc.setFont(contactoTexto.fuente, contactoTexto.estilo);
  doc.setFontSize(contactoTexto.tamano);
  for (const linea of lineasContacto) {
    doc.text(linea, contactoX, yContacto + 1);
    yContacto += 5;
  }
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`N°: ${numeroPedido(pedido.id)}`, rightBoxX + 5, infoY + 10);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha: ${fecha}`, rightBoxX + 5, infoY + 18);

  // Imágenes vía proxy /api/share-image, cacheadas por índice (POST/GET no
  // exponen pedido_items.id). Un fallo → celda en blanco, nunca rompe el PDF.
  const imageCache = new Map<number, string | null>();
  await Promise.all(
    pedido.items.map(async (item, index) => {
      if (!item.imagen_url) { imageCache.set(index, null); return; }
      try {
        const res = await fetch(`/api/share-image?url=${encodeURIComponent(item.imagen_url)}`);
        if (!res.ok) { imageCache.set(index, null); return; }
        imageCache.set(index, await blobToDataURL(await res.blob()));
      } catch {
        imageCache.set(index, null);
      }
    })
  );

  const startY = infoY + leftBoxH + 10;
  const rows = pedido.items.map((i) => [
    '', // columna Imagen — se dibuja aparte vía didDrawCell (index 0)
    i.codigo,
    i.detalle || '',
    Number(i.cantidad),
    formatCLP(Number(i.precio)),
    formatCLP(Number(i.subtotal ?? i.precio * i.cantidad)),
    i.modalidad === 'mayor' ? 'POR MAYOR' : 'POR MENOR',
  ]);
  const totalUnidades = pedido.items.reduce((sum, i) => sum + Number(i.cantidad), 0);

  autoTable(doc, {
    startY,
    head: [['Imagen', 'Código', 'Descripción', 'Unidades', 'Precio', 'Total', 'Modalidad']],
    body: rows,
    foot: [[
      { content: 'TOTALES NETOS', colSpan: 3, styles: { halign: 'right' } },
      { content: `${totalUnidades} unidades`, colSpan: 2, styles: { halign: 'right' } },
      { content: '', colSpan: 1 },
      { content: '', colSpan: 1 },
    ]],
    showFoot: 'lastPage',
    footStyles: {
      fillColor: ACENTO,
      textColor: TINTA,
      fontStyle: 'bold',
      fontSize: 10,
    },
    styles: { fontSize: 9, cellPadding: 3, fontStyle: 'bold', textColor: TINTA, lineColor: BORDE, lineWidth: 0.1 },
    headStyles: { fillColor: PRIMARIO, textColor: TEXTO_CLARO, fontSize: 9, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: FONDO_SUAVE },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 24, halign: 'left' },
      2: { cellWidth: 40, halign: 'left' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
    },
    didDrawCell: (data: CellHookData) => {
      if (data.column.index === 0 && data.row?.index !== undefined && data.section === 'body') {
        const b64 = imageCache.get(data.row.index);
        if (b64) {
          try {
            doc.addImage(b64, 'PNG', data.cell.x + 1, data.cell.y + 1, 14, 14);
          } catch {
            // imagen inválida → celda en blanco
          }
        }
      }
    },
  });

  // ─── Totales: Subtotal productos + Entrega, caja Total oro y Estado/Pago ───
  const subtotalProductos = pedido.items.reduce(
    (sum, i) => sum + Number(i.subtotal ?? i.precio * i.cantidad), 0
  );
  const entregaTexto = pedido.entrega_codigo
    ? `Entrega (${ENTREGA_LABEL[pedido.entrega_codigo] ?? pedido.entrega_codigo}): ${formatCLP(Number(pedido.entrega_costo))}`
    : `Entrega: ${formatCLP(Number(pedido.entrega_costo))}`;
  const pago = pedido.metodo_pago
    ? ETIQUETA_PAGO[pedido.metodo_pago] ?? pedido.metodo_pago
    : pedido.mp_payment_id ? 'Mercado Pago' : null;

  const totalBoxW = 60;
  const totalBoxX = pageWidth - 14 - totalBoxW;
  const footerBandH = 16;
  const footerBandY = pageHeight - footerBandH;
  let finalY = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // BUG-062: una sola fuente de verdad para el layout del bloque. Medición y
  // dibujo usan `posiciones`, así no pueden desincronizarse (alturas en mm).
  const OFFSET_SUBTOTAL = 6;
  const OFFSET_ENTREGA = 12;
  const OFFSET_CAJA = 16;
  const OFFSET_ESTADO = 20; // desde el borde superior de la caja Total
  const LINEA_RESUMEN = 6;
  const OFFSET_GRACIAS = 10;
  const posiciones = (fy: number, conPago: boolean) => {
    const subtotalY = fy + OFFSET_SUBTOTAL;
    const entregaY = fy + OFFSET_ENTREGA;
    const totalBoxY = fy + OFFSET_CAJA;
    const estadoY = totalBoxY + OFFSET_ESTADO;
    const pagoY = estadoY + LINEA_RESUMEN;
    const graciasY = (conPago ? pagoY : estadoY) + LINEA_RESUMEN + OFFSET_GRACIAS;
    return { subtotalY, entregaY, totalBoxY, estadoY, pagoY, graciasY };
  };
  const conPago = Boolean(pago);
  if (posiciones(finalY, conPago).graciasY + 4 > footerBandY) {
    doc.addPage();
    finalY = 20;
  }
  const pos = posiciones(finalY, conPago);

  doc.setTextColor(...TINTA);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Subtotal productos: ${formatCLP(subtotalProductos)}`, pageWidth - 14, pos.subtotalY, { align: 'right' });
  doc.text(entregaTexto, pageWidth - 14, pos.entregaY, { align: 'right' });

  doc.setFillColor(...ACENTO);
  doc.rect(totalBoxX, pos.totalBoxY, totalBoxW, 14, 'F');
  doc.setTextColor(...TINTA);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Total: ${formatCLP(Number(pedido.total))}`, totalBoxX + 4, pos.totalBoxY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TINTA);
  doc.text(`Estado: ${ESTADO_LABEL[pedido.estado] ?? pedido.estado}`, pageWidth - 14, pos.estadoY, { align: 'right' });
  if (pago) {
    doc.text(`Pago: ${pago}`, pageWidth - 14, pos.pagoY, { align: 'right' });
  }

  // ─── Footer: agradecimiento + banda de contacto ───
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...TINTA);
  doc.text('Gracias por su compra', 14, pos.graciasY);

  doc.setFillColor(...ACENTO);
  doc.rect(0, footerBandY, pageWidth, footerBandH, 'F');
  doc.setTextColor(...TINTA);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`WhatsApp ${EMPRESA.whatsapp}`, 14, footerBandY + 6);
  doc.text(`${EMPRESA.direccion} | ${EMPRESA.ciudad}`, 14, footerBandY + 10);
  doc.text(`Horario: ${EMPRESA.horario}`, 14, footerBandY + 14);

  return doc;
}
