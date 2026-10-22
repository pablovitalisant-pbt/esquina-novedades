import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

const ORIGENES = ['productos', 'catalogo'] as const;
type Origen = (typeof ORIGENES)[number];

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

    const items = Array.isArray(body?.items) ? body.items : null;
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'items debe ser un array con al menos 1 elemento' }, { status: 400 });
    }
    for (const it of items) {
      if (!Number.isInteger(it?.cantidad) || (it.cantidad as number) <= 0) {
        return NextResponse.json({ error: 'cada item.cantidad debe ser un entero > 0' }, { status: 400 });
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

    // ─── Verificación de que todos los productos existen ───────────
    const productoIds = items.map((it: any) => it.producto_id);
    if (productoIds.some((id: any) => !Number.isInteger(id))) {
      return NextResponse.json({ error: 'cada item.producto_id debe ser un entero' }, { status: 400 });
    }
    const existentes = await sql`
      SELECT id FROM public.productos
      WHERE id = ANY(${productoIds})
    `;
    if (existentes.length !== productoIds.length) {
      return NextResponse.json({ error: 'uno o más productos no existen' }, { status: 400 });
    }

    // ─── Match / creación de cliente (normalizado a dígitos) ───────
    const normalizado = telefono.replace(/\D/g, '');
    const match = await sql`
      SELECT id FROM public.clientes
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
          INSERT INTO public.clientes (id, nombre, telefono)
          VALUES (${nuevoId}, ${nombre}, ${telefono})
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
    const pedidoId = randomUUID();

    // ─── Transacción atómica: pedido + items ───────────────────────
    const queries: any[] = [];
    queries.push(sql`
      INSERT INTO public.pedidos (id, cliente_id, nombre_contacto, telefono_contacto, origen, origen_slug)
      VALUES (${pedidoId}, ${clienteId}, ${nombre}, ${telefono}, ${origen}, ${origenSlug})
      RETURNING id, cliente_id, estado, created_at::text
    `);
    for (const it of items) {
      queries.push(sql`
        INSERT INTO public.pedido_items (pedido_id, producto_id, codigo, detalle, cantidad, precio_referencia)
        VALUES (${pedidoId}, ${it.producto_id}, ${it.codigo}, ${it.detalle ?? null}, ${it.cantidad}, ${it.precio_referencia ?? null})
      `);
    }

    const results = await sql.transaction(queries);
    const pedido = results[0][0];

    return NextResponse.json({
      data: {
        id: pedido.id,
        cliente_id: pedido.cliente_id,
        estado: pedido.estado,
        created_at: pedido.created_at,
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
      SELECT pi.pedido_id, pi.codigo, pi.detalle, pi.cantidad, pi.precio_referencia, p.cantcaja
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
        precio_referencia: it.precio_referencia,
        cantcaja: it.cantcaja ?? null,
      });
      itemsPorPedido.set(it.pedido_id, lista);
    }

    const data = pedidos.map((p: any) => ({
      id: p.id,
      cliente: { id: p.cliente_id, nombre: p.nombre, telefono: p.telefono },
      origen: p.origen,
      estado: p.estado,
      created_at: p.created_at,
      items: itemsPorPedido.get(p.id) ?? [],
    }));

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
