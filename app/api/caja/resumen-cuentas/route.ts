import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = (session.user as any).rol;
  if (rol !== "admin") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  try {
    const rows = await sql`
      SELECT
        m.cuenta_id,
        cc.nombre AS cuenta_nombre,
        cc.moneda,
        COALESCE(SUM(CASE WHEN m.tipo = 'cobro' THEN m.monto ELSE 0 END), 0) AS total_cobros,
        COALESCE(SUM(CASE WHEN m.tipo = 'gasto' THEN m.monto ELSE 0 END), 0) AS total_gastos,
        COALESCE(SUM(CASE WHEN m.tipo = 'reembolso' THEN m.monto ELSE 0 END), 0) AS total_reembolsos,
        COALESCE(SUM(CASE WHEN m.tipo = 'cobro' THEN m.monto ELSE -m.monto END), 0) AS movimientos_neto
      FROM caja_movimientos m
      JOIN caja_cuentas cc ON cc.id = m.cuenta_id
      GROUP BY m.cuenta_id, cc.nombre, cc.moneda, cc.orden, cc.id
      ORDER BY cc.orden ASC, cc.id ASC
    `;

    // Fetch saldos iniciales
    const saldosIniciales = await sql`
      SELECT cuenta_id, saldo FROM caja_saldos_iniciales
    `;
    const saldoMap = new Map<number, number>();
    for (const s of saldosIniciales) {
      saldoMap.set(s.cuenta_id as number, parseFloat(s.saldo as string));
    }

    const result = rows.map((r: any) => ({
      cuenta_id: r.cuenta_id,
      cuenta_nombre: r.cuenta_nombre,
      moneda: r.moneda as "USD" | "ARS",
      total_cobros: parseFloat(r.total_cobros),
      total_gastos: parseFloat(r.total_gastos),
      total_reembolsos: parseFloat(r.total_reembolsos),
      saldo_neto: (saldoMap.get(r.cuenta_id as number) || 0) + parseFloat(r.movimientos_neto),
    }));

    return NextResponse.json({ data: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
