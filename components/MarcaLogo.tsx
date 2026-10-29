import { EMPRESA } from '@/lib/empresa';

/**
 * Único punto de cambio del logo. Sin `logo` cae al wordmark de texto actual.
 */
export function MarcaLogo({
  logo = EMPRESA.logo,
  nombre = EMPRESA.nombre,
  className = 'font-extrabold text-xl tracking-tight text-[var(--primary)]',
  logoClassName = 'h-10 w-auto',
}: {
  logo?: string | null;
  nombre?: string;
  className?: string;
  logoClassName?: string;
}) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={nombre}
        width={320}
        height={149}
        decoding="async"
        className={logoClassName}
      />
    );
  }
  return <span className={className}>{nombre}</span>;
}
