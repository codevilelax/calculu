// Service worker do CalcuLu: guarda o app no celular para abrir sem internet.
// Abre sempre a cópia guardada (rápido) e, se houver internet, baixa a versão do
// site em segundo plano. Se ela mudou, guarda e avisa a tela ("Tem uma versão nova").
const CACHE = 'calculu-v2';
const ARQUIVOS = ['./', './index.html'];
// Guarda a hora em que baixou uma versão nova; a tela compara com a hora em que ela abriu
const MARCA = './__calculu-versao-nova';

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Avisa agora e de novo em 2 s: a página pode ainda estar abrindo na primeira vez.
// O aviso só diz "confira"; quem decide se mostra a faixa é a página (pela hora da MARCA).
async function avisarNovaVersao() {
  const avisar = async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    janelas.forEach(j => j.postMessage({ tipo: 'nova-versao' }));
  };
  await avisar();
  await new Promise(r => setTimeout(r, 2000));
  await avisar();
}

self.addEventListener('fetch', evento => {
  const pedido = evento.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;
  evento.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(pedido, { ignoreSearch: true });
    const copiaGuardada = guardado ? guardado.clone() : null;
    const daRede = fetch(pedido, { cache: 'no-cache' })
      .then(async resposta => {
        if (!resposta.ok) return resposta;
        if (copiaGuardada && pedido.mode === 'navigate') {
          const [novo, velho] = await Promise.all([resposta.clone().text(), copiaGuardada.text()]);
          await cache.put(pedido, resposta.clone());
          if (novo !== velho) {
            await cache.put(MARCA, new Response(String(Date.now())));
            await avisarNovaVersao();
          }
        } else {
          await cache.put(pedido, resposta.clone());
        }
        return resposta;
      })
      .catch(() => null);
    if (guardado) { evento.waitUntil(daRede); return guardado; }
    const resposta = await daRede;
    if (resposta) return resposta;
    if (pedido.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    return Response.error();
  })());
});
