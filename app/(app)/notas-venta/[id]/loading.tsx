export default function Loading() {
  return (
    <div role="status" aria-label="Cargando nota de venta" className="p-4 space-y-4">
      <p className="sr-only">Cargando nota de venta...</p>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="h-24 bg-[var(--muted)] rounded-card animate-pulse motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
