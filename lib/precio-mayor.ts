// precio_mayor: entero > 0 o null (null = no se vende por mayor). Estricto: solo number.
export const esPrecioMayorValido = (v: unknown): boolean =>
  v === null || (typeof v === "number" && Number.isInteger(v) && v > 0);
