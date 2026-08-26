import Link from 'next/link';

export default function Landing() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="flex items-center justify-between px-8 py-6 max-w-5xl w-full mx-auto">
        <span className="font-bold text-lg tracking-tight">
          easymidia <span className="text-violet-400">clip</span>
        </span>
        <Link
          href="/login"
          className="text-sm px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-500 transition-colors"
        >
          Entrar
        </Link>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight max-w-3xl text-balance">
          De vídeo longo a Shorts publicados, <span className="text-violet-400">no automático</span>
        </h1>
        <p className="mt-6 text-lg text-zinc-400 max-w-xl">
          A IA encontra os trechos virais, renderiza com legendas e avatar, e publica em 9
          plataformas no seu cronograma. Você só aprova.
        </p>
        <Link
          href="/login"
          className="mt-10 px-8 py-4 rounded-lg bg-violet-600 hover:bg-violet-500 font-semibold text-lg transition-colors"
        >
          Começar grátis — 5 shorts
        </Link>
        <p className="mt-4 text-sm text-zinc-500">Sem cartão de crédito no trial</p>
      </section>

      <footer className="px-8 py-6 text-center text-sm text-zinc-600">
        © 2026 easymidia · easymidia.io
      </footer>
    </main>
  );
}
