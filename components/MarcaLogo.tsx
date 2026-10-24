import { EMPRESA } from '@/lib/empresa';

/**
 * Único punto de cambio del logo. Sin `logo` cae al wordmark de texto actual.
 */
export function MarcaLogo({
  logo = EMPRESA.logo,
  nombre = EMPRESA.nombre,
  className = 'font-extrabold text-xl tracking-tight text-[var(--primary)]',
  logoClassName = 'h-8 w-auto',
}: {
  logo?: string | null;
  nombre?: string;
  className?: string;
  logoClassName?: string;
}) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt={nombre} className={logoClassName} />;
  }
  return <span className={className}>{nombre}</span>;
}
