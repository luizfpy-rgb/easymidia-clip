import Link from 'next/link';

const STEPS = [
  {
    n: '1',
    title: 'Cole o link (ou deixe a descoberta achar)',
    body: 'Você adiciona um vídeo longo do YouTube — ou define um nicho e a plataforma garimpa os vídeos com mais tração sozinha.',
  },
  {
    n: '2',
    title: 'A IA encontra e renderiza os melhores trechos',
    body: 'Transcrição palavra a palavra, curadoria dos ganchos com maior potencial e render com legendas karaokê, gancho fixo e sua marca.',
  },
  {
    n: '3',
    title: 'Você aprova, o resto é automático',
    body: 'Os shorts aprovados entram no seu cronograma e são publicados no YouTube, Instagram e TikTok sem você encostar em nada.',
  },
];

const FEATURES = [
  'Legendas karaokê palavra a palavra, sincronizadas com o áudio',
  'Gancho fixo no topo, escrito pela IA pra segurar os 3 primeiros segundos',
  'Vídeo inteiro no quadro — nada de crop cortando metade da cena',
  'Legenda de post e hashtags prontas pra cada rede',
  'Publicação agendada nas 3 redes com um clique de aprovação',
];

export default function Landing() {
  return (
    <main className="min-h-screen bg-ink text-white flex flex-col">
      <header className="flex items-center justify-between px-8 py-6 max-w-6xl w-full mx-auto">
        <span className="flex items-center gap-3 font-bold text-lg tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" className="w-8 h-8 rounded-lg" />
          easymidia <span className="text-violet-400">clip</span>
        </span>
        <Link
          href="/login"
          className="text-sm px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-500 transition-colors font-semibold"
        >
          Entrar
        </Link>
      </header>

      <section className="flex flex-col items-center text-center px-6 pt-16 pb-20">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl text-balance">
          De vídeo longo a Shorts publicados,{' '}
          <span className="text-violet-400">no automático</span>
        </h1>
        <p className="mt-6 text-lg text-mist max-w-xl">
          A IA encontra os trechos virais, renderiza com legendas karaokê e publica no
          YouTube, Instagram e TikTok no seu cronograma. Você só aprova.
        </p>
        <Link
          href="/login"
          className="mt-10 px-8 py-4 rounded-lg bg-violet-600 hover:bg-violet-500 font-bold text-lg transition-colors"
        >
          Começar grátis — 5 shorts
        </Link>
        <p className="mt-4 text-sm text-mist/60">Sem cartão de crédito no trial</p>
      </section>

      <section className="px-6 pb-24 max-w-6xl w-full mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="flex justify-center md:justify-end">
            <div className="w-64 aspect-[9/16] rounded-2xl overflow-hidden border border-edge shadow-[0_0_80px_-20px_#7C3AED]">
              <iframe
                src="https://www.youtube.com/embed/SBt8YklXmKM"
                title="Short gerado pela easymidia clip"
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              Isto saiu da máquina, <span className="text-violet-400">sem edição manual</span>
            </h2>
            <p className="mt-3 text-mist">
              Um short real: encontrado, cortado, legendado e publicado pela plataforma de
              ponta a ponta.
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex gap-3 text-sm text-mist">
                  <span className="text-violet-400 font-bold shrink-0">▸</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="px-6 pb-24 max-w-6xl w-full mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-center mb-12">
          Como funciona
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-xl border border-edge bg-ink-2/60 p-6">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-violet-600 font-bold">
                {s.n}
              </span>
              <h3 className="mt-4 font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-mist">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 pb-24 text-center">
        <div className="max-w-2xl mx-auto rounded-2xl border border-edge bg-ink-2/60 px-8 py-12">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Seu canal postando todo dia, <span className="text-violet-400">sem você editar</span>
          </h2>
          <p className="mt-3 text-mist">
            Custa centavos por short e roda sozinho no cronograma que você definir.
          </p>
          <Link
            href="/login"
            className="inline-block mt-8 px-8 py-4 rounded-lg bg-violet-600 hover:bg-violet-500 font-bold text-lg transition-colors"
          >
            Criar conta grátis
          </Link>
        </div>
      </section>

      <footer className="px-8 py-8 border-t border-edge/60 text-sm text-mist/60">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>© 2026 easymidia · easymidia.io</span>
          <div className="flex gap-5">
            <a
              href="https://www.youtube.com/channel/UCLf1WrXFKNA4CD2ldmzK06g"
              target="_blank"
              className="hover:text-white"
            >
              YouTube
            </a>
            <a href="https://www.instagram.com/easymid.ia" target="_blank" className="hover:text-white">
              Instagram
            </a>
            <a href="https://www.tiktok.com/@easymidia1" target="_blank" className="hover:text-white">
              TikTok
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
