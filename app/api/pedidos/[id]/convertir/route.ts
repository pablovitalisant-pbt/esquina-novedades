import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sql } from '@/lib/db';
import { authOptions } from '@/lib/auth';

// POST /api/pedidos/[id]/convertir — convierte un pedido en Nota de Venta.
//
// Secuencial, NO atómico entre ítems (mismo comportamiento que cargar la nota
// a mano): cada ítem descuenta stock por separado; si falla por stock, se omite
// y sigue. El pedido queda 'convertido' aunque la conversión sea parcial (una
// sola vía — no hay reconvertir). El ítem faltante lo agrega el vendedor luego
// a mano desde /notas-venta/[id], donde ya puede editar precios.
// El pedido se bloquea con FOR UPDATE dentro del CTE (rama `reservado`) para que
// dos conversiones concurrentes (p. ej. reintentos del webhook MP) serialicen:
// la segunda espera el lock, reevalúa el WHERE y encuentra la fila ya cambiada.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const rol = (session?.user as any)?.rol;
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const empresaId = 1; // single-tenant, Bazar Naty

    // 1. Pedido convertible? `pendiente` legacy descuenta stock al convertir.
    // `pagado` con stock_reservado=true ya descontó al reservar: solo crea la
    // nota. Cualquier otro estado (pendiente_pago, expirado, rechazado…) → 409.
    const pedidoRows = await sql`
      SELECT id, estado, cliente_id, stock_reservado FROM public.pedidos WHERE id = ${id}
    `;
    if (pedidoRows.length === 0) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }
    const estado = pedidoRows[0].estado;
    const reservado = pedidoRows[0].stock_reservado === true;
    const convertible = estado === 'pendiente' || (estado === 'pagado' && reservado);
    if (!convertible) {
      return NextResponse.json({ error: 'El pedido no está pendiente' }, { status: 409 });
    }
    const clienteId = pedidoRows[0].cliente_id;

    // 2. Crear la prenota (misma numeración que POST /api/notas-venta)
    const usuarioId = Number((session.user as any).id);
    const usuarioNombre = (session.user as any).nombre;
    const count = await sql`SELECT COUNT(*) FROM public.prenotas WHERE usuario_id = ${usuarioId}`;
    const n = Number((count as any)[0].count) + 1;
    const fecha = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
    const titulo = `Nota de Venta #${n} de ${usuarioNombre} — ${fecha}`;

    // 2a. Pedido con stock ya reservado: una sola sentencia atómica crea la
    // nota + ítems (modalidad/precio/unidades del pedido) y marca el pedido,
    // sin tocar saldo. Si otro request lo convirtió antes, no inserta nada.
    if (reservado) {
      const itemsReservados = await sql`
        SELECT codigo, cantidad, modalidad FROM public.pedido_items WHERE pedido_id = ${id}
      `;
      const rows = await sql`
        WITH target AS (
          SELECT id FROM public.pedidos
          WHERE id = ${id} AND estado = 'pagado' AND stock_reservado = true
          FOR UPDATE
        ), nueva AS (
          INSERT INTO public.prenotas (titulo, titulo_base, usuario_id, cliente_id)
          SELECT ${titulo}, ${titulo}, ${usuarioId}, ${clienteId} FROM target
          RETURNING id
        ), upd AS (
          UPDATE public.pedidos
          SET estado = 'convertido', stock_reservado = false,
              prenota_id = (SELECT id FROM nueva)
          WHERE id IN (SELECT id FROM target)
            AND estado = 'pagado' AND stock_reservado = true
          RETURNING id
        ), ins AS (
          INSERT INTO public.prenota_items
            (prenota_id, codigo, descripcion, imagen_url, empresa_id, cajas, unidades, precio, modalidad)
          SELECT (SELECT id FROM nueva), pi.codigo, pi.detalle, p.imagen_url, ${empresaId},
                 CASE WHEN pi.modalidad = 'caja' THEN pi.cantidad ELSE 0 END,
                 COALESCE(pi.unidades, pi.cantidad),
                 COALESCE(NULLIF(pi.precio, 0), pi.precio_referencia), pi.modalidad
          FROM public.pedido_items pi
          JOIN public.productos p ON p.id = pi.producto_id AND p.empresa_id = ${empresaId}
          WHERE pi.pedido_id = ${id} AND EXISTS (SELECT 1 FROM upd)
          RETURNING codigo
        )
        SELECT (SELECT id FROM nueva) AS prenota_id
      `;
      const prenotaReservada = rows[0]?.prenota_id;
      if (!prenotaReservada) {
        return NextResponse.json({ error: 'El pedido ya no es convertible' }, { status: 409 });
      }
      return NextResponse.json(
        {
          data: {
            prenota_id: Number(prenotaReservada),
            convertidos: itemsReservados.map((it: any) => ({
              codigo: it.codigo,
              cajas: it.modalidad === 'caja' ? Number(it.cantidad) : 0,
            })),
            fallidos: [],
          },
        },
        { status: 201 }
      );
    }
    const prenotaRows = await sql`
      INSERT INTO public.prenotas (titulo, titulo_base, usuario_id, cliente_id)
      VALUES (${titulo}, ${titulo}, ${usuarioId}, ${clienteId})
      RETURNING id
    `;
    const prenotaId = Number(prenotaRows[0].id);

    // 3. Ítems del pedido → descuento de stock + prenota_items por ítem
    const items = await sql`
      SELECT codigo, detalle, cantidad, precio_referencia
      FROM public.pedido_items
      WHERE pedido_id = ${id}
    `;

    const convertidos: { codigo: string; cajas: number }[] = [];
    const fallidos: { codigo: string; motivo: string; disponible: number; solicitado: number }[] = [];

    for (const item of items) {
      const codigo = item.codigo;
      const cajas = Number(item.cantidad);

      // cantcaja fresco de productos al momento de convertir (no se duplica en pedido_items)
      const prod = await sql`
        SELECT cantcaja, imagen_url FROM public.productos WHERE codigo = ${codigo} AND empresa_id = ${empresaId}
      `;
      if (prod.length === 0) {
        fallidos.push({ codigo, motivo: 'Producto no encontrado', disponible: 0, solicitado: cajas });
        continue;
      }
      const cantcaja = Number(prod[0].cantcaja) || 1;
      const unidades = cajas * cantcaja;

      const updateRows = await sql`
        UPDATE public.productos SET saldo = saldo - ${unidades}
        WHERE codigo = ${codigo} AND empresa_id = ${empresaId} AND saldo >= ${unidades}
        RETURNING saldo
      `;
      if (updateRows.length === 0) {
        const current = await sql`
          SELECT saldo FROM public.productos WHERE codigo = ${codigo} AND empresa_id = ${empresaId}
        `;
        fallidos.push({
          codigo,
          motivo: 'Stock insuficiente',
          disponible: current.length > 0 ? Number(current[0].saldo) : 0,
          solicitado: unidades,
        });
        continue;
      }

      await sql`
        UPDATE public.ubicaciones_bodega SET saldo = saldo - ${unidades}, updated_at = NOW()
        WHERE codigo = ${codigo} AND empresa_id = ${empresaId}
      `;

      await sql`
        INSERT INTO public.prenota_items (prenota_id, codigo, descripcion, imagen_url, empresa_id, cajas, unidades, precio)
        VALUES (${prenotaId}, ${codigo}, ${item.detalle ?? null}, ${prod[0].imagen_url ?? null}, ${empresaId}, ${cajas}, ${unidades}, ${item.precio_referencia ?? null})
      `;

      convertidos.push({ codigo, cajas });
    }

    // 4. Marcar pedido convertido (una sola vía), incluso con conversión parcial
    await sql`
      UPDATE public.pedidos SET estado = 'convertido', prenota_id = ${prenotaId}
      WHERE id = ${id}
    `;

    return NextResponse.json(
      { data: { prenota_id: prenotaId, convertidos, fallidos } },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
