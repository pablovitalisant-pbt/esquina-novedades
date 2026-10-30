'use client';

import { useState } from 'react';
import { getSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { EMPRESA } from '@/lib/empresa';
import flags from '@/config/feature-flags.json';
import { rutaCallbackSegura, rutaInicio } from '@/lib/ruta-inicio';

export default function LoginPage() {
  const router = useRouter();
  const [rut, setRut] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRut(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const res = await signIn('credentials', {
      redirect: false,
      rut,
      password,
    });

    setIsLoading(false);

    if (res?.error) {
      toast.error('Credenciales inválidas o usuario inactivo');
    } else {
      // callbackUrl interno (p.ej. middleware) manda; si no, inicio por rol.
      const callbackUrl = new URLSearchParams(window.location.search).get('callbackUrl');
      const destino = rutaCallbackSegura(callbackUrl);
      if (destino) {
        router.push(destino);
      } else {
        const sesion = await getSession();
        router.push(rutaInicio(sesion?.user?.rol, flags as Record<string, boolean>));
      }
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={EMPRESA.logoGrande}
              alt={EMPRESA.nombre}
              width={640}
              height={297}
              decoding="async"
              className="mx-auto h-24 w-auto"
            />
            <CardTitle className="sr-only">{EMPRESA.nombre}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rut">RUT</Label>
              <Input
                id="rut"
                type="text"
                placeholder="RUT"
                value={rut}
                onChange={handleRutChange}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
