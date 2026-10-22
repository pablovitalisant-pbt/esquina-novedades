import { render } from '@testing-library/react';
import { AlertasProvider, useAlertas } from '@/contexts/AlertasContext';

function ContextShapeSpy({ onShape }: { onShape: (shape: Record<string, unknown>) => void }) {
  const ctx = useAlertas();
  onShape(ctx);
  return null;
}

describe('AlertasContext — contrato post-slice (stockBajo solamente)', () => {
  let shape: Record<string, unknown> = {};
  beforeEach(() => { shape = {}; });
  const renderSpy = () => render(<AlertasProvider><ContextShapeSpy onShape={(s) => { shape = s; }} /></AlertasProvider>);

  test('stockBajoCount existe y es número', () => { renderSpy(); expect(shape).toHaveProperty('stockBajoCount'); expect(typeof shape.stockBajoCount).toBe('number'); });
  test('refreshStockBajo existe y es función', () => { renderSpy(); expect(typeof shape.refreshStockBajo).toBe('function'); });
  test('NO expone alertasCount (deseados eliminado)', () => { renderSpy(); expect(shape).not.toHaveProperty('alertasCount'); expect(shape).not.toHaveProperty('refreshAlertas'); });
  test('NO expone seguimientosCount (seguimientos eliminado)', () => { renderSpy(); expect(shape).not.toHaveProperty('seguimientosCount'); expect(shape).not.toHaveProperty('refreshSeguimientos'); });
});
