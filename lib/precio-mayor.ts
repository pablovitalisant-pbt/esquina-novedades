// precio_mayor: entero > 0 o null (null = no se vende por mayor). Estricto: solo number.
export const esPrecioMayorValido = (v: unknown): boolean =>
  v === null || (typeof v === "number" && Number.isInteger(v) && v > 0);

// ¿El producto se puede vender por mayor? precio_mayor no nulo y entero > 0.
export const puedeVenderMayor = (p: { precio_mayor?: number | null }): boolean =>
  p.precio_mayor != null && esPrecioMayorValido(p.precio_mayor);

// minimo_mayor: entero >= 1 o null (null = sin descuento por cantidad online).
export const esMinimoMayorValido = (v: unknown): boolean =>
  v === null || (typeof v === "number" && Number.isInteger(v) && v >= 1);
