import { neon } from '@neondatabase/serverless';
import * as bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. Please set it in your .env file.');
  process.exit(1);
}

const sql = neon(connectionString);

async function seed() {
  console.log('Starting seed process (INSERT-only, idempotent)...');

  try {
    // ─── Empresa (single-tenant) ──────────────────────────
    const empresasResult = await sql`
      INSERT INTO empresas (nombre, slug)
      VALUES ('Bazar Naty', 'bazar-naty')
      ON CONFLICT (slug) DO NOTHING
      RETURNING id, slug;
    `;

    let empresa: { id: number; slug: string };
    if (empresasResult.length === 1) {
      empresa = (empresasResult as any)[0];
    } else {
      const existing = await sql`SELECT id, slug FROM empresas WHERE slug = 'bazar-naty'`;
      empresa = (existing as any)[0];
    }

    // ─── Usuarios ──────────────────────────────────────────
    const adminHash = await bcrypt.hash('admin123', 10);
    const bodegaHash = await bcrypt.hash('bodega123', 10);
    const vendedorHash = await bcrypt.hash('venta123', 10);

    const usuariosResult = await sql`
      INSERT INTO usuarios (rut, nombre, rol, password)
      VALUES
        ('11.111.111-1', 'Admin User', 'admin', ${adminHash}),
        ('22.222.222-2', 'Bodeguero User', 'bodeguero', ${bodegaHash}),
        ('33.333.333-3', 'Vendedor User', 'vendedor', ${vendedorHash})
      ON CONFLICT (rut) DO NOTHING
      RETURNING id, rut, rol;
    `;

    let usuarios: { id: number; rut: string; rol: string }[];
    if (usuariosResult.length === 3) {
      usuarios = usuariosResult as any;
    } else {
      usuarios = (await sql`SELECT id, rut, rol FROM usuarios WHERE rut IN ('11.111.111-1', '22.222.222-2', '33.333.333-3')`) as any;
    }

    // ─── usuario_empresa ───────────────────────────────────
    for (const u of usuarios) {
      await sql`
        INSERT INTO usuario_empresa (usuario_id, empresa_id)
        VALUES (${u.id}, ${empresa.id})
        ON CONFLICT (usuario_id, empresa_id) DO NOTHING
      `;
    }

    // ─── Productos ─────────────────────────────────────────
    const baseProducts = [
      { code: 'A100', desc: 'Sartén Antiadherente 24cm', nuevo: true, saldo: 50 },
      { code: 'A101', desc: 'Sartén Antiadherente 28cm', nuevo: false, saldo: 0 },
      { code: 'B200', desc: 'Olla Presión 5L Acero Inox', nuevo: true, saldo: 20 },
      { code: 'C300', desc: 'Juego de Cubiertos 24 Pzas', nuevo: false, saldo: 150 },
      { code: 'D400', desc: 'Hervidor Eléctrico 1.7L', nuevo: false, saldo: 45 },
      { code: 'D401', desc: 'Batidora de Mano 300W', nuevo: false, saldo: 0 },
      { code: 'E500', desc: 'Juego de Vasos Vidrio 6 Pzas', nuevo: true, saldo: 80 },
      { code: 'F600', desc: 'Tupper Cristal Set 3', nuevo: false, saldo: 120 },
      { code: 'G700', desc: 'Cuchillo Chef 20cm', nuevo: false, saldo: 60 },
      { code: 'H800', desc: 'Cafetera Italiana 6 Tazas', nuevo: false, saldo: 30 },
    ];

    const allProducts: { emp: number; id: number; codigo: string }[] = [];

    for (const p of baseProducts) {
      const res = await sql`
        INSERT INTO productos (
          empresa_id, codigo, detalle, saldo, umed, cif, costo, prcventa, prcminimo, cantcaja, es_nuevo
        ) VALUES (
          ${empresa.id}, ${p.code}, ${p.desc}, ${p.saldo}, 'U',
          12.5000, 15.00, 25.00, 20.00, 12, ${p.nuevo}
        )
        ON CONFLICT (empresa_id, codigo) DO NOTHING
        RETURNING id, codigo;
      `;
      if (res.length > 0) {
        allProducts.push({ emp: empresa.id, id: res[0].id, codigo: res[0].codigo });
      } else {
        const existing = await sql`SELECT id, codigo FROM productos WHERE empresa_id = ${empresa.id} AND codigo = ${p.code}`;
        allProducts.push({ emp: empresa.id, id: (existing as any)[0].id, codigo: (existing as any)[0].codigo });
      }

      // ─── Ubicaciones (solo productos con saldo > 0) ────
      if (p.saldo > 0) {
        const saldocajas = p.saldo / 12;
        const prodData = allProducts[allProducts.length - 1];
        await sql`
          INSERT INTO ubicaciones_bodega (
            empresa_id, codigo, ubicacion, detalle, cantcaja, saldo, saldocajas
          ) VALUES (
            ${prodData.emp}, ${prodData.codigo}, ${`A-01-0${allProducts.length % 9}`}, ${p.desc}, 12, ${p.saldo}, ${saldocajas}
          )
          ON CONFLICT (empresa_id, codigo) DO NOTHING
        `;
      }
    }

    // ─── Catálogo ─────────────────────────────────────────
    const cat = await sql`
      INSERT INTO catalogos (empresa_id, titulo, slug, descripcion)
      VALUES (${empresa.id}, 'Catálogo de Temporada', 'catalogo-temporada', 'Los mejores productos para el hogar.')
      ON CONFLICT (slug) DO NOTHING
      RETURNING id;
    `;

    let catalogoId: number;
    if (cat.length > 0) {
      catalogoId = (cat as any)[0].id;
    } else {
      const existing = await sql`SELECT id FROM catalogos WHERE slug = 'catalogo-temporada'`;
      catalogoId = (existing as any)[0].id;
    }

    // ─── Catalogo items (primeros 3 productos) ────────────
    for (let i = 0; i < 3 && i < allProducts.length; i++) {
      await sql`
        INSERT INTO catalogo_items (catalogo_id, producto_id, orden)
        SELECT ${catalogoId}, ${allProducts[i].id}, ${i}
        WHERE NOT EXISTS (
          SELECT 1 FROM catalogo_items
          WHERE catalogo_id = ${catalogoId} AND producto_id = ${allProducts[i].id}
        )
      `;
    }

    // ─── Clientes demo ─────────────────────────────────────
    await sql`
      INSERT INTO clientes (nombre, telefono, direccion, notas)
      SELECT 'Juan Pérez', '71234567', 'Av. Principal 123', 'Cliente frecuente'
      WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre = 'Juan Pérez' AND telefono = '71234567')
    `;
    await sql`
      INSERT INTO clientes (nombre, telefono, direccion, notas)
      SELECT 'María Gómez', '72345678', 'Calle Secundaria 456', NULL
      WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre = 'María Gómez' AND telefono = '72345678')
    `;
    await sql`
      INSERT INTO clientes (nombre, telefono, direccion, notas)
      SELECT 'Comercial XYZ', '73456789', NULL, 'Compra al por mayor'
      WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre = 'Comercial XYZ' AND telefono = '73456789')
    `;

    // ─── Caja: config + cuentas ──────────────────────────
    await sql`
      INSERT INTO caja_config (clave, valor, updated_por)
      VALUES ('dolar_dia', '1200', 'seed')
      ON CONFLICT (clave) DO NOTHING
    `;

    await sql`
      INSERT INTO caja_cuentas (nombre, moneda, orden, activa)
      SELECT 'Caja chica', 'USD', 1, TRUE
      WHERE NOT EXISTS (SELECT 1 FROM caja_cuentas WHERE nombre = 'Caja chica')
    `;

    await sql`
      INSERT INTO caja_cuentas (nombre, moneda, orden, activa)
      SELECT 'Caja fuerte', 'ARS', 2, TRUE
      WHERE NOT EXISTS (SELECT 1 FROM caja_cuentas WHERE nombre = 'Caja fuerte')
    `;

    console.log('Seed completed successfully!');
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  }
}

seed();
