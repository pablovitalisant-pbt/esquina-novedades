/**
 * Fase B — M03: ErrorApi compartido sin romper ErrorNota/ErrorPago.
 * Rojo hasta que exista lib/api-error (implementacion en Fase C).
 */
import { ErrorApi } from '@/lib/api-error';
import { ErrorNota } from '@/lib/api-notas';
import { ErrorPago } from '@/lib/api-pagos';

describe('ErrorApi', () => {
  it('es base de ErrorNota/ErrorPago y hereda de Error', () => {
    const nota = new ErrorNota('sin stock');
    const pago = new ErrorPago('sin saldo');

    expect(nota).toBeInstanceOf(ErrorApi);
    expect(pago).toBeInstanceOf(ErrorApi);
    expect(nota).toBeInstanceOf(Error);
    expect(pago).toBeInstanceOf(Error);
  });

  it('conserva nombres y mensajes actuales', () => {
    expect(new ErrorNota('a').name).toBe('ErrorNota');
    expect(new ErrorNota('a').message).toBe('a');
    expect(new ErrorPago('b').name).toBe('ErrorPago');
    expect(new ErrorPago('b').message).toBe('b');
  });

  it('mantiene separadas las excepciones de nota y de pago', () => {
    expect(new ErrorNota('a')).not.toBeInstanceOf(ErrorPago);
    expect(new ErrorPago('b')).not.toBeInstanceOf(ErrorNota);
  });

  it('acepta nombre parametrizable en ErrorApi', () => {
    const err = new ErrorApi('fallo', 'ErrorApi');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ErrorApi');
    expect(err.message).toBe('fallo');
  });
});
