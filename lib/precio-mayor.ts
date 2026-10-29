// precio_mayor: entero > 0 o null (null = no se vende por mayor). Estricto: solo number.
export const esPrecioMayorValido = (v: unknown): boolean =>
  v === null || (typeof v === "number" && Number.isInteger(v) && v > 0);

// minimo_mayor: entero >= 1 o null (null = sin descuento por cantidad online).
export const esMinimoMayorValido = (v: unknown): boolean =>
  v === null || (typeof v === "number" && Number.isInteger(v) && v >= 1);
