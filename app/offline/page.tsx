export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="mx-auto w-full max-w-[560px] rounded-card bg-[#F2D9DC] p-8 text-center md:p-12">
        <h1 className="text-3xl font-bold text-[#231F20] md:text-4xl">
          Sin conexión
        </h1>
        <p className="mx-auto mt-4 max-w-[65ch] text-base leading-relaxed text-[#4B5563]">
          No hay conexión a internet en este momento. Revisá tu señal y
          volvé a intentar. Cuando vuelvas a estar en línea, la aplicación
          se actualizará sola.
        </p>
        <a
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-pill bg-gradient-brand px-6 py-3 text-base font-medium text-white shadow-xs transition-colors hover:brightness-110"
        >
          Reintentar
        </a>
      </div>
    </main>
  );
}
