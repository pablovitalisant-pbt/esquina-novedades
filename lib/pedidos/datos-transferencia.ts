/** N03b2 — datos bancarios desde el entorno y regla de efectivo para delivery local. */

export interface DatosTransferencia {
  banco: string;
  titular: string;
  rut: string;
  tipo_cuenta: string;
  numero_cuenta: string;
}

const CLAVES = [
  'TRANSFERENCIA_BANCO', 'TRANSFERENCIA_TITULAR', 'TRANSFERENCIA_RUT',
  'TRANSFERENCIA_TIPO_CUENTA', 'TRANSFERENCIA_NUMERO_CUENTA',
] as const;

/** null si falta cualquiera de los cinco valores. */
export function leerDatosTransferencia(): DatosTransferencia | null {
  const [banco, titular, rut, tipoCuenta, numeroCuenta] =
    CLAVES.map((clave) => process.env[clave]?.trim());
  if (!banco || !titular || !rut || !tipoCuenta || !numeroCuenta) return null;
  return { banco, titular, rut, tipo_cuenta: tipoCuenta, numero_cuenta: numeroCuenta };
}

/** UI: efectivo solo si la opción de entrega es delivery local y está activa. */
export function esEfectivoDelivery(codigo: string | null, activa: boolean): boolean {
  return activa && (codigo === 'delivery_iquique' || codigo === 'delivery_alto_hospicio');
}
