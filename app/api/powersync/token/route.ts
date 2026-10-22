import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { SignJWT, importPKCS8 } from 'jose';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    // Firma RS256 (asimétrica, recomendada para producción) con la llave
    // privada PKCS8 en base64. El `kid` debe coincidir con el JWKS pegado en
    // el Dashboard de PowerSync (bazar-naty-rs256-v1).
    const privateKeyBase64 = process.env.POWERSYNC_JWT_PRIVATE_KEY;
    const endpoint = process.env.POWERSYNC_INSTANCE_URL;
    if (!privateKeyBase64 || !endpoint) {
      return NextResponse.json(
        { error: 'Configuración de PowerSync incompleta' },
        { status: 500 }
      );
    }

    const privateKeyPem = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    const privateKey = await importPKCS8(privateKeyPem, 'RS256');

    const user = session.user as any;
    const token = await new SignJWT({ rol: user.rol })
      .setProtectedHeader({ alg: 'RS256', kid: 'bazar-naty-rs256-v1' })
      .setSubject(String(user.id))
      .setAudience(endpoint)
      .setIssuedAt()
      .setExpirationTime('30m')
      .sign(privateKey);

    return NextResponse.json({ token, endpoint });
  } catch (error: any) {
    console.error('GET /api/powersync/token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
