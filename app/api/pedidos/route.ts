import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { calcularPedido, ErrorPrecio, type OpcionEntrega, type Origen, type ProductoPrecio } from '@/lib/pedidos/precios';
import { liberarReservasVencidas } from '@/lib/pedidos/liberar-reservas';
import { precioCatalogoBase } from '@/lib/precio-catalogo';
import { seleccionarProductosCatalogo } from '@/app/api/catalogos/public/[slug]/seleccion';
import flags from '@/config/feature-flags.json';

const ORIGENES = ['productos', 'catalogo'] as const;

// Slice unicidad: match por teléfono normalizado a dígitos. El INSERT de
// cliente se hace standalone con captura de 23505: si dos requests concurrentes
// crean el mismo teléfono, el segundo reutiliza el existente (índice único de
// la migración 036). El pedido NUNCA falla por duplicado de cliente.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ─── Validaciones (400, sin insertar nada) ─────────────────────
    const nombre = typeof body?.nombre_contacto === 'string' ? body.nombre_contacto.trim() : '';
    if (!nombre) {
      return NextResponse.json({ error: 'nombre_contacto es requerido' }, { status: 400 });
    }

    const telefono = typeof body?.telefono_contacto === 'string' ? body.telefono_contacto.trim() : '';
    if (!telefono) {
      return NextResponse.json({ error: 'telefono_contacto es requerido' }, { status: 400 });
    }

    const email = typeof body?.email_contacto === 'string' ? body.email_contacto.trim() : '';
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'email_contacto válido es requerido' }, { status: 400 });
    }

    const entregaCodigo = typeof body?.entrega_codigo === 'string' ? body.entrega_codigo.trim() : '';
    if (!entregaCodigo) {
      return NextResponse.json({ error: 'entrega_codigo es requerido' }, { status: 400 });
    }

    const items = Array.isArray(body?.items) ? body.items : null;
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'items debe ser un array con al menos 1 elemento' }, { status: 400 });
    }
    for (const it of items) {
      if (!Number.isInteger(it?.producto_id)) {
        return NextResponse.json({ error: 'cada item.producto_id debe ser un entero' }, { status: 400 });
      }
      if (!Number.isInteger(it?.cantidad) || (it.cantidad as number) <= 0) {
        return NextResponse.json({ error: 'cada item.cantidad debe ser un entero > 0' }, { status: 400 });
      }
      if (it?.modalidad !== 'unidad' && it?.modalidad !== 'caja') {
        return NextResponse.json({ error: "cada item.modalidad debe ser 'unidad' o 'caja'" }, { status: 400 });
      }
    }

    const origen: Origen = body?.origen;
    if (!ORIGENES.includes(origen)) {
      return NextResponse.json({ error: "origen debe ser 'productos' o 'catalogo'" }, { status: 400 });
    }
    const origenSlug = origen === 'catalogo'
      ? (typeof body?.origen_slug === 'string' ? body.origen_slug.trim() : '')
      : null;
    if (origen === 'catalogo' && !origenSlug) {
      return NextResponse.json({ error: 'origen_slug es obligatorio cuando origen es catalogo' }, { status: 400 });
    }

    // ─── Reserva online (flag) + idempotencia ───────────────────────
    const pagoOnline = flags['tienda-pago-online'] === true;
    if (pagoOnline) {
      // Llamada perezosa antes de descontar: nunca reservar sobre stock sucio.
      await liberarReservasVencidas();
    }

    const idempotencyKey = (
      request.headers.get('idempotency-key')
      ?? (typeof body?.idempotency_key === 'string' ? body.idempotency_key : '')
    ).trim() || null;
    if (idempotencyKey) {
      const existentes = await sql`
        SELECT id, cliente_id, estado, created_at::text, total
        FROM public.pedidos
        WHERE idempotency_key = ${idempotencyKey}
        LIMIT 1
      `;
      if (existentes[0]) {
        return NextResponse.json({ data: existentes[0] }, { status: 200 });
      }
    }

    // ─── Lectura de productos, entrega y precio de catálogo ─────────
    const productoIds = items.map((it: any) => it.producto_id);
    const productos = await sql`
      SELECT id, codigo, detalle, prcventa, precio_mayor, cantcaja, activo, costo, saldo
      FROM public.productos
      WHERE id = ANY(${productoIds})
    `;

    const opciones = await sql`
      SELECT codigo, costo, requiere_direccion, activa
      FROM public.opciones_entrega
      WHERE codigo = ${entregaCodigo}
    `;
    const entrega = opciones[0] as OpcionEntrega | undefined;

    let preciosCatalogo: Record<number, number> | undefined;
    if (origen === 'catalogo') {
      const cats = await sql`
        SELECT * FROM public.catalogos
        WHERE slug = ${origenSlug} AND activo = true
      `;
      if (!cats[0]) {
        return NextResponse.json({ error: 'catálogo inexistente' }, { status: 400 });
      }
      // Misma selección que muestra el catálogo público: un producto que no
      // está en esa lista no puede comprarse con el precio del catálogo.
      const seleccion = await seleccionarProductosCatalogo(sql, cats[0]);
      const codigosCatalogo = new Set(
        seleccion.map((p: any) => String(p.codigo).trim().toUpperCase()),
      );
      for (const p of productos as any[]) {
        if (!codigosCatalogo.has(String(p.codigo).trim().toUpperCase())) {
          return NextResponse.json({ error: 'producto no pertenece al catalogo' }, { status: 400 });
        }
      }
      const codigos = (productos as any[]).map((p) => String(p.codigo).toUpperCase());
      const overrides = await sql`
        SELECT codigo, precio FROM public.catalogo_precio_override
        WHERE catalogo_id = ${cats[0].id} AND UPPER(codigo) = ANY(${codigos})
      `;
      const porCodigo = new Map(overrides.map((o: any) => [String(o.codigo).toUpperCase(), parseFloat(o.precio)]));
      const margen = parseFloat(cats[0].margen_precio) || 0;
      preciosCatalogo = {};
      for (const p of productos as any[]) {
        preciosCatalogo[p.id] = porCodigo.get(String(p.codigo).toUpperCase())
          ?? precioCatalogoBase(parseFloat(p.costo), margen);
      }
    }

    let calculado;
    try {
      calculado = calcularPedido(items, productos as ProductoPrecio[], {
        origen,
        preciosCatalogo,
        entrega: entrega as OpcionEntrega,
        direccion_entrega: body?.direccion_entrega,
      });
    } catch (error) {
      if (error instanceof ErrorPrecio) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    // ─── Match / creación de cliente (normalizado a dígitos) ───────
    const normalizado = telefono.replace(/\D/g, '');
    const match = await sql`
      SELECT id, email FROM public.clientes
      WHERE regexp_replace(telefono, '[^0-9]', '', 'g') = ${normalizado}
      LIMIT 1
    `;

    // Resolución del cliente fuera de la transacción del pedido, para poder
    // capturar 23505 sin tirar abajo el pedido. Si un request concurrente creó
    // el cliente entre el match y el INSERT, reutilizamos el existente.
    let clienteId: string;
    if (match[0]) {
      clienteId = match[0].id;
    } else {
      const nuevoId = randomUUID();
      try {
        await sql`
          INSERT INTO public.clientes (id, nombre, telefono, email)
          VALUES (${nuevoId}, ${nombre}, ${telefono}, ${email})
        `;
        clienteId = nuevoId;
      } catch (err: any) {
        if (err?.code === '23505') {
          const re = await sql`
            SELECT id FROM public.clientes
            WHERE regexp_replace(telefono, '[^0-9]', '', 'g') = ${normalizado}
            LIMIT 1
          `;
          if (re[0]) {
            clienteId = re[0].id; // otro request lo creó primero → reutilizarlo
          } else {
            throw err; // 23505 pero sin cliente visible: inesperado
          }
        } else {
          throw err;
        }
      }
    }
    // El email existente no se sobrescribe; solo se completa si faltaba.
    if (match[0] && !match[0].email) {
      await sql`
        UPDATE public.clientes SET email = ${email}
        WHERE id = ${clienteId} AND (email IS NULL OR email = '')
      `;
    }
    const pedidoId = randomUUID();

    // ─── Transacción atómica: pedido + items (precios ya calculados) ─
    const queries: any[] = [];
    queries.push(sql`
      INSERT INTO public.pedidos
        (id, cliente_id, nombre_contacto, telefono_contacto, email_contacto,
         origen, origen_slug, entrega_codigo, entrega_costo, direccion_entrega,
         idempotency_key, estado, stock_reservado, expira_en, total)
      VALUES (${pedidoId}, ${clienteId}, ${nombre}, ${telefono}, ${email},
              ${origen}, ${origenSlug}, ${calculado.entrega_codigo},
              ${calculado.entrega_costo}, ${calculado.direccion_entrega},
              ${idempotencyKey}, ${pagoOnline ? 'pendiente_pago' : 'pendiente'}, ${pagoOnline},
              CASE WHEN ${pagoOnline} THEN NOW() + INTERVAL '36 hours' ELSE NULL END,
              ${calculado.total})
      RETURNING id, cliente_id, estado, created_at::text, total
    `);
    for (const linea of calculado.lineas) {
      queries.push(sql`
        INSERT INTO public.pedido_items
          (pedido_id, producto_id, codigo, detalle, cantidad, modalidad, precio, unidades)
        VALUES (${pedidoId}, ${linea.producto_id}, ${linea.codigo}, ${linea.detalle},
                ${linea.cantidad}, ${linea.modalidad}, ${linea.precio},
                ${pagoOnline ? linea.unidades : null})
      `);
    }
    if (pagoOnline) {
      for (const linea of calculado.lineas) {
        // UPDATE condicionado + guard 1/0: si falta stock la transacción entera
        // aborta con 22012, sin pedido ni descuento parcial.
        queries.push(sql`
          WITH upd AS (
            UPDATE public.productos
            SET saldo = saldo - ${linea.unidades}, updated_at = NOW()
            WHERE id = ${linea.producto_id} AND saldo >= ${linea.unidades}
            RETURNING id, codigo, empresa_id
          ), ub AS (
            UPDATE public.ubicaciones_bodega u
            SET saldo = u.saldo - ${linea.unidades}, updated_at = NOW()
            FROM upd
            WHERE u.codigo = upd.codigo AND u.empresa_id = upd.empresa_id
            RETURNING u.id
          )
          SELECT CASE WHEN EXISTS (SELECT 1 FROM upd) THEN 1 ELSE 1 / 0 END AS ok
        `);
      }
    }

    let results;
    try {
      results = await sql.transaction(queries);
    } catch (error: any) {
      // Doble clic concurrente: el índice único aborta el INSERT; devolvemos
      // el pedido que ganó la carrera sin reservar de nuevo.
      if (idempotencyKey && String(error?.code) === '23505') {
        const [existente] = await sql`
          SELECT id, cliente_id, estado, created_at::text, total
          FROM public.pedidos
          WHERE idempotency_key = ${idempotencyKey}
          LIMIT 1
        `;
        if (existente) return NextResponse.json({ data: existente }, { status: 200 });
      }
      if (String(error?.code) === '22012') {
        // Rollback ya deshizo lo nuestro: releemos el saldo real para el detalle.
        const actuales = await sql`
          SELECT id, codigo, saldo FROM public.productos WHERE id = ANY(${productoIds})
        `;
        const porId = new Map((actuales as any[]).map((p) => [p.id, p]));
        const sinStock = calculado.lineas
          .filter((l) => Number(porId.get(l.producto_id)?.saldo ?? 0) < l.unidades)
          .map((l) => ({
            codigo: l.codigo,
            disponible: Number(porId.get(l.producto_id)?.saldo ?? 0),
            solicitado: l.unidades,
          }));
        return NextResponse.json({ error: 'Stock insuficiente', items: sinStock }, { status: 409 });
      }
      throw error;
    }
    const pedido = results[0][0];

    return NextResponse.json({
      data: {
        id: pedido.id,
        cliente_id: pedido.cliente_id,
        estado: pedido.estado,
        created_at: pedido.created_at,
        total: pedido.total,
      },
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if ((session.user as any).rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');

    const pedidos = await sql`
      SELECT p.id, p.cliente_id, p.origen, p.origen_slug, p.estado, p.created_at::text,
             p.email_contacto, p.entrega_codigo, p.entrega_costo, p.direccion_entrega, p.total,
             c.nombre, c.telefono
      FROM public.pedidos p
      LEFT JOIN public.clientes c ON c.id = p.cliente_id
      ${estado ? sql`WHERE p.estado = ${estado}` : sql``}
      ORDER BY p.created_at DESC
    `;

    if (pedidos.length === 0) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    const pedidoIds = pedidos.map((p: any) => p.id);
    const items = await sql`
      SELECT pi.pedido_id, pi.codigo, pi.detalle, pi.cantidad, pi.modalidad,
             pi.precio, pi.subtotal, p.cantcaja
      FROM public.pedido_items pi
      LEFT JOIN public.productos p ON p.id = pi.producto_id
      WHERE pi.pedido_id = ANY(${pedidoIds})
    `;

    const itemsPorPedido = new Map<string, any[]>();
    for (const it of items) {
      const lista = itemsPorPedido.get(it.pedido_id) ?? [];
      lista.push({
        codigo: it.codigo,
        detalle: it.detalle,
        cantidad: it.cantidad,
        modalidad: it.modalidad,
        precio: it.precio,
        subtotal: it.subtotal,
        cantcaja: it.cantcaja ?? null,
      });
      itemsPorPedido.set(it.pedido_id, lista);
    }

    const data = pedidos.map((p: any) => ({
      id: p.id,
      cliente: { id: p.cliente_id, nombre: p.nombre, telefono: p.telefono },
      email_contacto: p.email_contacto,
      origen: p.origen,
      origen_slug: p.origen_slug,
      estado: p.estado,
      entrega_codigo: p.entrega_codigo,
      entrega_costo: p.entrega_costo,
      direccion_entrega: p.direccion_entrega,
      total: p.total,
      created_at: p.created_at,
      items: itemsPorPedido.get(p.id) ?? [],
    }));

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
