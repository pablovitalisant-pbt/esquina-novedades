/**
 * @jest-environment jsdom
 *
 * FASE B — Mejoras UI del Informe de Inversión (contrato Dirección Técnica).
 * Wiring del client_page:
 *  - toggle "solo con stock" default ON, UN solo control que afecta tabla Y gráfico
 *    (mismo universo).
 *  - Top 10 entre gráfico y tabla, default métrica ganancia, re-ranking al cambiar.
 *  - montos con etiqueta USD en cards, tabla y Top 10.
 *
 * recharts se mockea a stubs que capturan la prop `data` del LineChart para
 * verificar que tabla y gráfico comparten el mismo universo filtrado.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { InversionMercaderiaClient, ChartTooltip } from '@/app/(app)/admin/inversion-mercaderia/client_page';

let chartData: any[] = [];

jest.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: (props: any) => { chartData = props.data; return <div data-testid="chart" />; },
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
}));

const RESPUESTA = {
  resumen: { costoTotal: 800, ventaPotencialTotal: 1320, gananciaProyectada: 520, productosSinCosto: 0 },
  detalle: [
    { codigo: 'A-1', detalle: 'Producto A', saldo: 40, costo: 12.5, prcventa: 18, costoTotal: 500, ventaPotencial: 720, ganancia: 220, imagen_url: 'https://img/a1.jpg' },
    { codigo: 'B-1', detalle: 'Producto B', saldo: 0, costo: 10, prcventa: 15, costoTotal: 0, ventaPotencial: 0, ganancia: 0, imagen_url: null },
    { codigo: 'C-1', detalle: 'Producto C', saldo: 25, costo: 12, prcventa: 24, costoTotal: 300, ventaPotencial: 600, ganancia: 300, imagen_url: null },
  ],
};

async function renderPage() {
  (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => RESPUESTA });
  const utils = render(<InversionMercaderiaClient />);
  await screen.findByText('USD 800.00'); // resumen cargado
  return utils;
}

// Los códigos aparecen en la tabla Y en el Top 10 → escopar a la tabla evita
// falsos positivos por múltiples coincidencias de getByText.
function tabla(container: HTMLElement) {
  return within(container.querySelector('table')!);
}

describe('InversionMercaderiaClient — toggle "solo con stock"', () => {
  test('1 — default ON: un solo universo filtra tabla Y gráfico (excluye saldo 0)', async () => {
    const { container } = await renderPage();
    const t = tabla(container);
    // B-1 (saldo 0) NO aparece en la tabla
    expect(t.queryByText('B-1')).toBeNull();
    // A-1 y C-1 sí
    expect(t.getByText('A-1')).toBeInTheDocument();
    expect(t.getByText('C-1')).toBeInTheDocument();
    // El gráfico recibe el mismo universo filtrado (2 productos)
    expect(chartData.map((r) => r.codigo)).toEqual(['A-1', 'C-1']);
  });

  test('2 — al desmarcar el toggle, tabla y gráfico amplían al mismo universo (incluye B-1)', async () => {
    const { container } = await renderPage();
    const t = tabla(container);
    const toggle = screen.getByRole('checkbox', { name: /solo con stock/i });
    expect(toggle).toBeChecked(); // default ON
    fireEvent.click(toggle);
    await waitFor(() => expect(t.getByText('B-1')).toBeInTheDocument());
    // Un solo control afecta a ambos: el gráfico ahora tiene los 3 productos
    expect(chartData).toHaveLength(3);
    expect(chartData.map((r) => r.codigo)).toEqual(['A-1', 'B-1', 'C-1']);
  });
});

describe('InversionMercaderiaClient — Top 10', () => {
  test('3 — default métrica ganancia: primero el de mayor ganancia (C-1=300)', async () => {
    const { container } = await renderPage();
    const ol = container.querySelector('ol')!;
    expect(ol.textContent).toContain('C-1');
    expect(ol.firstElementChild!.textContent).toContain('C-1');
  });

  test('4 — cambiar a costoTotal re-ordena: primero el de mayor capital (A-1=500)', async () => {
    const { container } = await renderPage();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'costoTotal' } });
    await waitFor(() =>
      expect(container.querySelector('ol')!.firstElementChild!.textContent).toContain('A-1')
    );
  });
});

describe('InversionMercaderiaClient — montos en USD', () => {
  test('5 — USD en las 3 cards de resumen', async () => {
    await renderPage();
    expect(screen.getByText('USD 800.00')).toBeInTheDocument();
    expect(screen.getByText('USD 1,320.00')).toBeInTheDocument();
    expect(screen.getByText('USD 520.00')).toBeInTheDocument();
  });

  test('6 — USD en la tabla de detalle (valores únicos: costo total y venta potencial de A-1)', async () => {
    await renderPage();
    expect(screen.getByText('USD 500.00')).toBeInTheDocument(); // A-1 costoTotal
    expect(screen.getByText('USD 720.00')).toBeInTheDocument(); // A-1 ventaPotencial
  });

  test('7 — USD en el Top 10 (valor de la métrica default ganancia)', async () => {
    const { container } = await renderPage();
    const ol = container.querySelector('ol')!;
    expect(ol.textContent).toContain('USD 300.00'); // C-1 ganancia
  });
});

describe('InversionMercaderiaClient — imágenes de producto', () => {
  test('8 — producto con imagen_url muestra <img> con src; sin imagen → placeholder, nunca <img> roto', async () => {
    const { container } = await renderPage();
    // A-1 tiene imagen (img presente en la tabla); C-1 (null) NO.
    const imgsTabla = container.querySelector('table')!.querySelectorAll('img');
    expect(imgsTabla.length).toBe(1);
    expect(imgsTabla[0].getAttribute('src')).toBe('https://img/a1.jpg');
    // Ningún <img> con src vacío en todo el documento (placeholder = icono, no img).
    const todos = container.querySelectorAll('img');
    expect(todos.length).toBeGreaterThan(0);
    todos.forEach((img) => expect(img.getAttribute('src')).toBeTruthy());
  });

  test('9 — ChartTooltip: activo muestra imagen, codigo y montos USD; inactivo renderiza vacío', () => {
    const activo = render(
      <ChartTooltip active payload={[{ payload: { codigo: 'A-1', costoTotal: 500, ventaPotencial: 720, imagen_url: 'https://img/a1.jpg' } }]} />
    );
    expect(activo.container.querySelector('img')?.getAttribute('src')).toBe('https://img/a1.jpg');
    expect(activo.container.textContent).toContain('A-1');
    expect(activo.container.textContent).toContain('USD 500.00');
    expect(activo.container.textContent).toContain('USD 720.00');

    const inactivo = render(<ChartTooltip active={false} payload={[]} />);
    expect(inactivo.container.firstChild).toBeNull();
  });
});

describe('InversionMercaderiaClient — loading skeleton (cold start percibido)', () => {
  test('11 — mientras el GET no responde, muestra el skeleton (no queda en blanco)', () => {
    // fetch pendiente para forzar el estado de carga inicial.
    (global as any).fetch = jest.fn(() => new Promise(() => {}));
    render(<InversionMercaderiaClient />);
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('loading-skeleton')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('InversionMercaderiaClient — descripción dinámica del Top 10', () => {
  test('10 — el texto cambia con cada métrica', async () => {
    await renderPage();
    // default ganancia
    expect(screen.getByText(/esta es la ganancia que te dejaría cada uno/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'costoTotal' } });
    expect(screen.getByText(/tenés más plata invertida/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ventaPotencial' } });
    expect(screen.getByText(/más generarían en dólares/)).toBeInTheDocument();
  });
});
