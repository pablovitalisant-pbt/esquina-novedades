import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import flags from '@/config/feature-flags.json';
import { armarHistorial, type MovimientoCrudo } from '@/lib/historial';
import type { RouteContext } from '@/types';

const LIMITE_MOVIMIENTOS = 500;

/**
 * GET /api/productos/[id]/historial — S2a.
 *
 * `id` es el CÓDIGO del producto (D1: el segmento no puede llamarse [codigo]
 * porque ya existe app/api/productos/[id]/). Solo lectura, solo admin.
 *
 * Fuentes y signo (unidades):
 *   ingresos_mercaderia          +cantidad        (app/api/ingresos/route.ts:71-79)
 *   conciliaciones_stock          +diferencia      (app/api/bodega/conciliaciones/route.ts:74-87)
 *   prenotas activas              -SUM(unidades)   (app/api/notas-venta/[id]/items/route.ts:99-128)
 *   pedidos con reserva vigente   -SUM(unidades)   (app/api/pedidos/route.ts:324-331)
 *   reservas liberadas             efecto 0        (lib/pedidos/liberar-reservas.ts:19-34)
 *
 * Fechas: ISO UTC estricto (`to_char ... AT TIME ZONE 'UTC'`) para que el
 * navegador no dependa de leer el formato de Postgres.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if ((flags as Record<string, boolean>)['producto-historial'] !== true) {
    return NextResponse.json({ error: 'Historial no disponible' }, { status: 404 });
  }

  if (session.user?.rol !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const codigo = (await params).id?.trim();
  if (!codigo) {
    return NextResponse.json({ error: 'Código requerido' }, { status: 400 });
  }

  const empresaIds = session.user.empresas ?? [];
  if (empresaIds.length === 0) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }

  try {
    const productoRows = await sql`
      SELECT
        MAX(p.detalle) AS detalle,
        COALESCE(SUM(p.saldo), 0)::int AS saldo,
        MAX(p.cantcaja)::int AS cantcaja,
        to_char(MIN(p.fecha_ingreso) AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS fecha_ingreso
      FROM public.productos p
      WHERE p.codigo = ${codigo}
        AND p.empresa_id = ANY(${empresaIds})
        AND p.activo = true
      GROUP BY p.codigo
    `;

    if (productoRows.length === 0) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    // Q2 — códigos anteriores del producto para la cabecera ("Antes: X, Y").
    // Se deduplica en JS, se conserva el orden cronológico y se excluye el
    // código actual (en una cadena X→Y→X, X no es "anterior" hoy).
    const cambios = await sql`
      SELECT c.codigo_anterior
      FROM public.productos_codigo_cambios c
      JOIN public.productos p ON p.id = c.producto_id
      WHERE p.codigo = ${codigo}
        AND p.empresa_id = ANY(${empresaIds})
        AND p.activo = true
      ORDER BY c.created_at ASC, c.id ASC
    `;
    const codigosAnteriores: string[] = [];
    for (const fila of cambios as { codigo_anterior: string }[]) {
      if (fila.codigo_anterior !== codigo && !codigosAnteriores.includes(fila.codigo_anterior)) {
        codigosAnteriores.push(fila.codigo_anterior);
      }
    }

    // Q3 — movimientos. La cadena de códigos se resuelve por producto_id y se
    // convierte en ventanas [desde, hasta): el código anterior termina en el
    // cambio que lo dejó; el actual empieza en la última vez que se asignó a
    // ESTE producto. Así un código reutilizado por otro producto no mezcla sus
    // movimientos posteriores.
    //
    // Límite conocido (sin backfill): un código reutilizado por un producto
    // NUEVO (alta, no cambio de código) o liberado por un producto inactivo no
    // tiene fila de cambio; su ventana arranca en -∞ y podría ver bitácora
    // vieja. No se reconstruye: no hay fuente confiable.
    //
    // Pedidos usa producto_id (FK real) en vez de ventanas: es exacto incluso
    // si el código se reutiliza. Notas no tiene producto_id: usa ventanas, con
    // un rescate para las notas activas impagas que cambiar-codigo ya propagó
    // al código nuevo (su created_at queda antes de la ventana y, sin rescate,
    // el resumen dejaría de cuadrar con el saldo).
    const filas = await sql`
      WITH prod AS (
        SELECT p.id
        FROM public.productos p
        WHERE p.codigo = ${codigo}
          AND p.empresa_id = ANY(${empresaIds})
          AND p.activo = true
      ),
      cambios AS (
        SELECT
          c.codigo_anterior,
          c.created_at,
          LAG(c.codigo_nuevo) OVER (
            PARTITION BY c.producto_id ORDER BY c.created_at, c.id
          ) AS codigo_previo,
          LAG(c.created_at) OVER (
            PARTITION BY c.producto_id ORDER BY c.created_at, c.id
          ) AS fecha_previa
        FROM public.productos_codigo_cambios c
        JOIN prod ON prod.id = c.producto_id
      ),
      ventanas AS (
        SELECT
          codigo_anterior AS codigo,
          CASE WHEN codigo_previo = codigo_anterior THEN fecha_previa ELSE NULL END AS desde,
          created_at AS hasta
        FROM cambios

        UNION ALL

        SELECT
          ${codigo}::text AS codigo,
          MAX(c2.created_at) AS desde,
          NULL::timestamptz AS hasta
        FROM public.productos_codigo_cambios c2
        JOIN prod ON prod.id = c2.producto_id
        WHERE c2.codigo_nuevo = ${codigo}
      ),
      movimientos AS (
        SELECT
          im.created_at AS fecha,
          'ingreso'::text AS tipo,
          im.cantidad::int AS cantidad,
          COALESCE(im.observaciones, 'Ingreso de mercadería') AS detalle,
          im.usuario_nombre AS usuario,
          'ingreso'::text AS ref_tipo,
          im.id::text AS ref_id,
          NULL::text AS estado,
          im.codigo AS codigo
        FROM public.ingresos_mercaderia im
        WHERE im.empresa_id = ANY(${empresaIds})
          AND EXISTS (
            SELECT 1 FROM ventanas v
            WHERE v.codigo = im.codigo
              AND (v.desde IS NULL OR im.created_at >= v.desde)
              AND (v.hasta IS NULL OR im.created_at < v.hasta)
          )

        UNION ALL

        SELECT
          cs.created_at AS fecha,
          'conciliacion'::text AS tipo,
          cs.diferencia::int AS cantidad,
          'Conteo físico: ' || cs.fisico_cajas || ' cajas + ' || cs.fisico_unidades
            || ' unidades (saldo ' || cs.saldo_anterior || ' → ' || cs.saldo_nuevo || ')' AS detalle,
          cs.usuario_nombre AS usuario,
          'conciliacion'::text AS ref_tipo,
          cs.id::text AS ref_id,
          NULL::text AS estado,
          cs.codigo AS codigo
        FROM public.conciliaciones_stock cs
        WHERE cs.empresa_id = ANY(${empresaIds})
          AND EXISTS (
            SELECT 1 FROM ventanas v
            WHERE v.codigo = cs.codigo
              AND (v.desde IS NULL OR cs.created_at >= v.desde)
              AND (v.hasta IS NULL OR cs.created_at < v.hasta)
          )

        UNION ALL

        SELECT
          n.created_at AS fecha,
          'venta'::text AS tipo,
          (-SUM(pi.unidades))::int AS cantidad,
          n.titulo AS detalle,
          u.nombre AS usuario,
          'nota'::text AS ref_tipo,
          n.id::text AS ref_id,
          n.estado AS estado,
          CASE WHEN MIN(pi.codigo) = MAX(pi.codigo) THEN MIN(pi.codigo) ELSE NULL END AS codigo
        FROM public.prenota_items pi
        JOIN public.prenotas n ON n.id = pi.prenota_id
        LEFT JOIN public.usuarios u ON u.id = n.usuario_id
        WHERE (pi.empresa_id = ANY(${empresaIds}) OR pi.empresa_id IS NULL)
          AND pi.codigo <> 'DESPACHO'
          AND (
            EXISTS (
              SELECT 1 FROM ventanas v
              WHERE v.codigo = pi.codigo
                AND (v.desde IS NULL OR n.created_at >= v.desde)
                AND (v.hasta IS NULL OR n.created_at < v.hasta)
            )
            OR (
              pi.codigo = ${codigo}
              AND n.estado = 'activa'
              AND NOT EXISTS (
                SELECT 1 FROM public.caja_movimiento_notas cmn WHERE cmn.prenota_id = n.id
              )
            )
          )
        GROUP BY n.id, n.created_at, n.titulo, n.estado, u.nombre

        UNION ALL

        SELECT
          p.created_at AS fecha,
          'reserva'::text AS tipo,
          (-SUM(pi.unidades))::int AS cantidad,
          'Pedido online' AS detalle,
          NULL::text AS usuario,
          'pedido'::text AS ref_tipo,
          p.id::text AS ref_id,
          CASE WHEN p.stock_reservado THEN 'vigente' ELSE p.estado END AS estado,
          CASE WHEN MIN(pi.codigo) = MAX(pi.codigo) THEN MIN(pi.codigo) ELSE NULL END AS codigo
        FROM public.pedido_items pi
        JOIN public.pedidos p ON p.id = pi.pedido_id
        WHERE pi.unidades IS NOT NULL
          AND pi.producto_id IN (SELECT id FROM prod)
          AND (
            p.stock_reservado = true
            OR (p.stock_reservado = false
                AND p.estado IN ('expirado', 'descartado', 'rechazado'))
          )
        GROUP BY p.id, p.created_at, p.stock_reservado, p.estado
      )
      SELECT
        to_char(fecha AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS fecha,
        tipo, cantidad, detalle, usuario, ref_tipo, ref_id, estado, codigo
      FROM movimientos
      ORDER BY fecha ASC, ref_id ASC
      LIMIT ${LIMITE_MOVIMIENTOS + 1}
    `;

    const truncado = filas.length > LIMITE_MOVIMIENTOS;
    const visibles = (truncado ? filas.slice(0, LIMITE_MOVIMIENTOS) : filas) as MovimientoCrudo[];

    const producto = productoRows[0];
    const { movimientos, resumen } = armarHistorial(
      {
        codigo,
        detalle: producto.detalle ?? null,
        saldo: Number(producto.saldo) || 0,
        cantcaja: Number(producto.cantcaja) || 1,
        fecha_ingreso: producto.fecha_ingreso,
      },
      visibles,
      truncado,
    );

    return NextResponse.json({
      producto: {
        codigo,
        detalle: producto.detalle ?? null,
        saldo: Number(producto.saldo) || 0,
        cantcaja: Number(producto.cantcaja) || 1,
        fecha_ingreso: producto.fecha_ingreso,
        codigos_anteriores: codigosAnteriores,
      },
      movimientos,
      resumen,
    });
  } catch (error) {
    console.error('GET /api/productos/[id]/historial error:', error);
    return NextResponse.json({ error: 'Error al leer el historial' }, { status: 500 });
  }
}
