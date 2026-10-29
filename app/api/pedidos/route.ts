import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { calcularPedido, ErrorPrecio, type OpcionEntrega, type Origen, type ProductoPrecio } from '@/lib/pedidos/precios';
import { liberarReservasVencidas } from '@/lib/pedidos/liberar-reservas';
import { crearPreferenciaPedido } from '@/lib/pedidos/preferencia';
import { rechazarPedido } from '@/lib/pedidos/rechazar';
import { reservarStockLinea } from '@/lib/pedidos/reserva-stock';
import { mpAccessToken, siteUrl } from '@/lib/mercadopago/config';
import { precioCatalogoBase } from '@/lib/precio-catalogo';
import { seleccionarProductosCatalogo } from '@/app/api/catalogos/public/[slug]/seleccion';
import flags from '@/config/feature-flags.json';
import { usuarioSesion } from '@/lib/session';
import { mensajeError, codigoError } from '@/lib/errores';

const ORIGENES = ['productos', 'catalogo'] as const;

const ERROR_PAGO = 'No se pudo iniciar el pago. Intenta nuevamente.';

type PedidoReplay = {
  id: string;
  cliente_id: string;
  estado: string;
  created_at: string;
  total: number;
  expira_en: string | null;
  mp_init_point: string | null;
};

type ItemEntrada = { producto_id: number; cantidad: number; modalidad: 'unidad' | 'detalle' | 'caja' | 'mayor' };
type ProductoFila = ProductoPrecio & { costo: number | string; saldo: number };
type PedidoLista = Record<string, unknown> & { id: string; cliente_id: string };
type ItemLista = {
  pedido_id: string;
  codigo: string;
  detalle: string | null;
  cantidad: number;
  modalidad: string;
  precio: number;
  subtotal: number;
};
type CuerpoPedido = {
  nombre_contacto?: unknown;
  telefono_contacto?: unknown;
  email_contacto?: unknown;
  entrega_codigo?: unknown;
  items?: unknown;
  origen?: Origen;
  origen_slug?: unknown;
  idempotency_key?: unknown;
  direccion_entrega?: string | null;
};

/** Slice 9c — preflight MP: sin config no se reserva stock. */
async function pagoOnlineConfigurado(): Promise<boolean> {
  try {
    mpAccessToken();
    siteUrl();
  } catch {
    return false;
  }
  const [config] = await sql`SELECT valor FROM public.caja_config WHERE clave = 'mp_cuenta_id'`;
  const cuentaId = Number(config?.valor);
  if (!Number.isInteger(cuentaId) || cuentaId <= 0) return false;
  const [cuenta] = await sql`
    SELECT id FROM public.caja_cuentas WHERE id = ${cuentaId} AND activa = true
  `;
  return Boolean(cuenta);
}

/** Replay de Idempotency-Key con pago online: reusa el init point guardado. */
async function responderReplay(pedido: PedidoReplay, pagoOnline: boolean) {
  if (!pagoOnline) return NextResponse.json({ data: pedido }, { status: 200 });
  if (pedido.estado !== 'pendiente_pago') {
    return NextResponse.json({ data: pedido }, { status: 200 });
  }
  if (pedido.mp_init_point) {
    return NextResponse.json({ data: { ...pedido, init_point: pedido.mp_init_point } }, { status: 200 });
  }
  try {
    const { initPoint } = await crearPreferenciaPedido(pedido.id);
    return NextResponse.json({ data: { ...pedido, init_point: initPoint } }, { status: 200 });
  } catch {
    // No se castiga una reserva viva por un replay.
    return NextResponse.json({ error: ERROR_PAGO, pedido_id: pedido.id }, { status: 502 });
  }
}

// Slice unicidad: match por teléfono normalizado a dígitos. El INSERT de
// cliente se hace standalone con captura de 23505: si dos requests concurrentes
// crean el mismo teléfono, el segundo reutiliza el existente (índice único de
// la migración 036). El pedido NUNCA falla por duplicado de cliente.

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CuerpoPedido;

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

    const items = Array.isArray(body?.items) ? (body.items as ItemEntrada[]) : null;
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'items debe ser un array con al menos 1 elemento' }, { status: 400 });
    }
    for (const it of items) {
      if (!Number.isInteger(it?.producto_id)) {
        return NextResponse.json({ error: 'cada item.producto_id debe ser un entero' }, { status: 400 });
      }
      if (!Number.isInteger(it?.cantidad) || it.cantidad <= 0) {
        return NextResponse.json({ error: 'cada item.cantidad debe ser un entero > 0' }, { status: 400 });
      }
      if (
        it?.modalidad !== 'unidad' && it?.modalidad !== 'detalle' &&
        it?.modalidad !== 'caja' && it?.modalidad !== 'mayor'
      ) {
        return NextResponse.json({ error: "cada item.modalidad debe ser 'unidad' o 'detalle'" }, { status: 400 });
      }
    }

    // Hotfix: la tienda online no vende por mayor (flag apagado = bloqueo).
    if (flags['tienda-mayor-online'] !== true && items.some((it) => it?.modalidad === 'caja' || it?.modalidad === 'mayor')) {
      return NextResponse.json(
        { error: 'El precio por mayor no está disponible en la tienda online' },
        { status: 400 },
      );
    }

    const origen = body?.origen as Origen;
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

    const idempotencyKey = (
      request.headers.get('idempotency-key')
      ?? (typeof body?.idempotency_key === 'string' ? body.idempotency_key : '')
    ).trim() || null;
    if (idempotencyKey) {
      const existentes = await sql`
        SELECT id, cliente_id, estado, created_at::text, total,
               expira_en::text, mp_init_point
        FROM public.pedidos
        WHERE idempotency_key = ${idempotencyKey}
        LIMIT 1
      `;
      if (existentes[0]) {
        return responderReplay(existentes[0] as PedidoReplay, pagoOnline);
      }
    }

    if (pagoOnline) {
      // Sin config de MP no se reserva nada (ni pedido ni stock).
      if (!(await pagoOnlineConfigurado())) {
        return NextResponse.json(
          { error: 'El pago online no está configurado. Contacta a la tienda.' },
          { status: 503 },
        );
      }
      // Llamada perezosa antes de descontar: nunca reservar sobre stock sucio.
      await liberarReservasVencidas();
    }

    // ─── Lectura de productos, entrega y precio de catálogo ─────────
    const productoIds = items.map((it) => it.producto_id);
    const productos = (await sql`
      SELECT id, codigo, detalle, prcventa, precio_mayor, activo, costo, saldo
      FROM public.productos
      WHERE id = ANY(${productoIds})
    `) as ProductoFila[];

    const opciones = await sql`
      SELECT codigo, nombre, costo, requiere_direccion, activa
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
        (seleccion as { codigo: unknown }[]).map((p) => String(p.codigo).trim().toUpperCase()),
      );
      for (const p of productos) {
        if (!codigosCatalogo.has(String(p.codigo).trim().toUpperCase())) {
          return NextResponse.json({ error: 'producto no pertenece al catalogo' }, { status: 400 });
        }
      }
      const codigos = productos.map((p) => String(p.codigo).toUpperCase());
      const overrides = await sql`
        SELECT codigo, precio FROM public.catalogo_precio_override
        WHERE catalogo_id = ${cats[0].id} AND UPPER(codigo) = ANY(${codigos})
      `;
      const porCodigo = new Map(
        (overrides as { codigo: unknown; precio: string }[]).map(
          (o): [string, number] => [String(o.codigo).toUpperCase(), parseFloat(o.precio)],
        ),
      );
      const margen = parseFloat(cats[0].margen_precio) || 0;
      preciosCatalogo = {};
      for (const p of productos) {
        preciosCatalogo[p.id] = porCodigo.get(String(p.codigo).toUpperCase())
          ?? precioCatalogoBase(parseFloat(String(p.costo)), margen);
      }
    }

    let calculado;
    try {
      calculado = calcularPedido(items, productos, {
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
      } catch (err) {
        if (codigoError(err) === '23505') {
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
    const queries = [sql`
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
      RETURNING id, cliente_id, estado, created_at::text, total, expira_en::text
    `];
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
        // Guard 1/COUNT (lib/pedidos/reserva-stock): si falta stock la transacción
        // entera aborta con 22012, sin pedido ni descuento parcial.
        queries.push(reservarStockLinea(linea.producto_id, linea.unidades));
      }
    }

    let results;
    try {
      results = await sql.transaction(queries);
    } catch (error) {
      // Doble clic concurrente: el índice único aborta el INSERT; devolvemos
      // el pedido que ganó la carrera sin reservar de nuevo.
      if (idempotencyKey && codigoError(error) === '23505') {
        const [existente] = await sql`
          SELECT id, cliente_id, estado, created_at::text, total,
                 expira_en::text, mp_init_point
          FROM public.pedidos
          WHERE idempotency_key = ${idempotencyKey}
          LIMIT 1
        `;
        if (existente) return responderReplay(existente as PedidoReplay, pagoOnline);
      }
      if (codigoError(error) === '22012') {
        // Rollback ya deshizo lo nuestro: releemos el saldo real para el detalle.
        const actuales = await sql`
          SELECT id, codigo, saldo FROM public.productos WHERE id = ANY(${productoIds})
        `;
        const porId = new Map(
          (actuales as { id: number; saldo: number }[]).map(
            (p): [number, { id: number; saldo: number }] => [p.id, p],
          ),
        );
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
    const data: Record<string, unknown> & { init_point?: string } = {
      id: pedido.id,
      cliente_id: pedido.cliente_id,
      estado: pedido.estado,
      created_at: pedido.created_at,
      total: pedido.total,
      expira_en: pedido.expira_en,
    };

    if (pagoOnline) {
      try {
        const { initPoint } = await crearPreferenciaPedido(pedido.id);
        data.init_point = initPoint;
      } catch {
        // Slice 9c: no dejar stock retenido por un pedido que nunca podrá pagarse.
        await rechazarPedido(pedido.id);
        return NextResponse.json({
          error: 'No se pudo iniciar el pago. El pedido fue cancelado y el stock liberado. Intenta nuevamente.',
          pedido_id: pedido.id,
        }, { status: 502 });
      }
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (usuarioSesion(session).rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');

    const pedidos = (await sql`
      SELECT p.id, p.cliente_id, p.origen, p.origen_slug, p.estado, p.created_at::text,
             p.email_contacto, p.entrega_codigo, p.entrega_costo, p.direccion_entrega, p.total,
             p.mp_payment_id, p.mp_fecha_pago::text, p.mp_revision_motivo,
             c.nombre, c.telefono
      FROM public.pedidos p
      LEFT JOIN public.clientes c ON c.id = p.cliente_id
      ${estado ? sql`WHERE p.estado = ${estado}` : sql``}
      ORDER BY p.created_at DESC
    `) as PedidoLista[];

    if (pedidos.length === 0) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    const pedidoIds = pedidos.map((p) => p.id);
    const items = (await sql`
      SELECT pi.pedido_id, pi.codigo, pi.detalle, pi.cantidad, pi.modalidad,
             pi.precio, pi.subtotal
      FROM public.pedido_items pi
      WHERE pi.pedido_id = ANY(${pedidoIds})
    `) as ItemLista[];

    const itemsPorPedido = new Map<string, Record<string, unknown>[]>();
    for (const it of items) {
      const lista = itemsPorPedido.get(it.pedido_id) ?? [];
      lista.push({
        codigo: it.codigo,
        detalle: it.detalle,
        cantidad: it.cantidad,
        modalidad: it.modalidad,
        precio: it.precio,
        subtotal: it.subtotal,
      });
      itemsPorPedido.set(it.pedido_id, lista);
    }

    const data = pedidos.map((p) => ({
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
      mp_payment_id: p.mp_payment_id ?? null,
      mp_fecha_pago: p.mp_fecha_pago ?? null,
      mp_revision_motivo: p.mp_revision_motivo ?? null,
      items: itemsPorPedido.get(p.id) ?? [],
    }));

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}
