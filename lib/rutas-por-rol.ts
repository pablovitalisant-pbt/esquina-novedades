/** Rutas permitidas por rol — extraído de middleware.ts para testabilidad */
export const RUTAS_POR_ROL: Record<string, string[]> = {
  admin: [
    '/precios', '/ventas', '/bodega', '/catalogo', '/admin',
    '/clientes', '/notas-venta', '/caja-mayor', '/deudores', '/alertas-stock',
    '/pedidos', '/pos',
  ],
  vendedor: [
    '/precios', '/ventas', '/catalogo', '/bodega',
    '/clientes', '/notas-venta', '/deudores',
    '/alertas-stock', '/pedidos', '/pos',
  ],
  bodeguero: ['/bodega', '/alertas-stock'],
};
