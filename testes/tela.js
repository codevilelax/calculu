// Testa a tela do CalcuLu num navegador de verdade (Chrome ou Edge, sem janela),
// simulando um celular, com toques de verdade nos botões.
// Rodar: node testes/tela.js        (precisa do Chrome ou do Edge instalado)
// As fotos da tela ficam na pasta mostrada no fim.
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const PASTA_APP = path.join(__dirname, '..');
const SAIDA = path.join(os.tmpdir(), 'calculu-testes');
const espera = ms => new Promise(r => setTimeout(r, ms));
const NAVEGADOR = [
  process.env.CALCULU_NAVEGADOR,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean).find(p => fs.existsSync(p));

let falhas = 0;
function confere(nome, obtido, esperado) {
  const ok = typeof esperado === 'function' ? esperado(obtido) : obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}: ${JSON.stringify(obtido)}${ok ? '' : `  (esperado ${typeof esperado === 'function' ? 'outra coisa' : JSON.stringify(esperado)})`}`);
}

// Servidor de teste: serve a pasta do app; "marca" simula uma versão nova publicada
let marca = '';
const servidor = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const arquivo = url === '/' ? 'index.html' : url.slice(1);
  if (!['index.html', 'sw.js'].includes(arquivo)) { res.writeHead(404); return res.end(); }
  let corpo = fs.readFileSync(path.join(PASTA_APP, arquivo), 'utf8');
  if (arquivo === 'index.html') corpo += marca;
  res.writeHead(200, { 'Content-Type': arquivo.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(corpo);
});

(async () => {
  if (!NAVEGADOR) { console.error('Não achei o Chrome nem o Edge. Indique o caminho em CALCULU_NAVEGADOR.'); process.exit(2); }
  fs.rmSync(SAIDA, { recursive: true, force: true });
  fs.mkdirSync(SAIDA, { recursive: true });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const URL_APP = `http://localhost:${servidor.address().port}/`;
  const PORTA = 9300 + Math.floor(Math.random() * 500);
  const nav = spawn(NAVEGADOR, ['--headless=new', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${path.join(SAIDA, 'perfil')}`,
    '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });

  const abrirAba = async () => {
    let alvo;
    for (let i = 0; i < 50 && !alvo; i++) {
      await espera(200);
      try { alvo = (await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json()).find(t => t.type === 'page'); } catch (e) { /* abrindo */ }
    }
    const ws = new WebSocket(alvo.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    let seq = 0;
    const pendentes = new Map(), ouvintes = [], erros = [];
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m); pendentes.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') erros.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') erros.push(m.params.args.map(a => a.value || a.description).join(' '));
      ouvintes.forEach(f => f(m));
    });
    const cmd = (method, params = {}) => new Promise((res, rej) => {
      const id = ++seq;
      pendentes.set(id, m => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
    const carregou = () => new Promise(r => { const f = m => { if (m.method === 'Page.loadEventFired') { ouvintes.splice(ouvintes.indexOf(f), 1); r(); } }; ouvintes.push(f); });
    return { ws, cmd, carregou, erros };
  };

  const { ws, cmd, carregou, erros } = await abrirAba();
  const js = async expr => {
    const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const foto = async (nome, inteira = true) => {
    const r = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: inteira });
    fs.writeFileSync(path.join(SAIDA, nome), Buffer.from(r.data, 'base64'));
  };
  const AJUDA = `window.T = {
    set(id, v) { const i = document.getElementById(id); i.focus(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); },
    un(grupo, u) { document.querySelector('#' + grupo + '-un [data-un="' + u + '"]').click(); },
    unDe(grupo) { return document.querySelector('#' + grupo + '-un').dataset.valor; },
    txt(sel) { const e = document.querySelector(sel); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : null; },
    todos(sel) { return [...document.querySelectorAll(sel)].map(e => e.textContent.replace(/\\s+/g, ' ').trim()); },
    clicar(sel) { document.querySelector(sel).click(); },
    botao(texto) { [...document.querySelectorAll('button')].reverse().find(b => b.textContent.trim() === texto).click(); },
    centro(sel) { const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; },
  };`;
  const recarregar = async (esperar = 1700) => { const c = carregou(); await cmd('Page.reload'); await c; await espera(esperar); await js(AJUDA); };
  // Toque de verdade (dedo), não .click(): é assim que o bug do "primeiro toque" aparece
  const tocar = async sel => {
    const p = await js(`T.centro(${JSON.stringify(sel)})`);
    await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
    await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await espera(450);
  };

  await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Network.enable'); await cmd('DOM.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 380, height: 800, deviceScaleFactor: 2, mobile: true });
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cmd('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SAIDA });
  let c = carregou();
  await cmd('Page.navigate', { url: URL_APP });
  await c;
  await espera(250);
  await foto('01-abertura.png', false);
  await espera(1500);
  await js(AJUDA);

  console.log('--- Abertura e Dose pronta ---');
  confere('abertura sai sozinha', await js(`!document.getElementById('abertura')`), true);
  confere('abre no modo Dose pronta', await js(`document.body.dataset.modo`), 'pronta');
  confere('4 abas', await js(`T.todos('.abas button').join(' | ')`), 'Dose pronta | Dose por peso | Redi­luição | Infusão contínua');
  await js(`T.set('pronta-dose','70'); T.set('pronta-frasco','500'); T.set('pronta-diluicao','10')`);
  confere('70 mg / 500 mg em 10 mL', await js(`T.txt('#pronta-resultado .volume')`), '1,4mL');
  confere('dose aparece junto do resultado', await js(`T.txt('#pronta-resultado .dose-resumo')`), 'Dose prescrita: 70 mg');
  confere('sem arredondar', await js(`T.txt('#pronta-resultado .exato')`), 'Sem arredondar: 1,4 mL');
  confere('concentração', await js(`T.txt('#pronta-resultado .info b')`), '50 mg/mL');
  confere('regra de 3', await js(`T.todos('#pronta-resultado .regra > span').filter(Boolean).join(' | ')`), '500 mg | 10 mL | 70 mg | x mL');
  confere('fórmula', await js(`T.txt('#pronta-resultado .formula')`), 'x = (70 mg × 10 mL) ÷ 500 mg = 1,4 mL');
  await foto('02-dose-pronta.png');

  console.log('--- Toques de verdade (bug do primeiro toque) ---');
  await js(`document.getElementById('pronta-dose').focus()`);
  await tocar('#pronta-resultado .salvar-fav');
  confere('"Salvar como favorito" abre no 1º toque com teclado aberto', await js(`!!document.querySelector('.dialogo')`), true);
  await js(`T.botao('Cancelar')`);
  await js(`T.clicar('#painel-pronta .limpar')`);
  await espera(400);
  await js(`document.getElementById('pronta-dose').focus()`);
  await tocar('#painel-pronta button[type=submit]');
  confere('"Calcular" com campo vazio focado mostra os 3 erros no 1º toque', await js(`document.querySelectorAll('#painel-pronta .msg.erro').length`), 3);

  console.log('--- mcg e g, alerta amarelo, ir para Rediluição ---');
  await js(`T.clicar('#painel-pronta .limpar')`);
  await js(`T.un('pronta-dose','mcg'); T.set('pronta-dose','500'); T.un('pronta-frasco','g'); T.set('pronta-frasco','1'); T.set('pronta-diluicao','10')`);
  confere('500 mcg / 1 g em 10 mL', await js(`T.txt('#pronta-resultado .volume')`), '0,005mL');
  confere('alerta amarelo', await js(`T.txt('#pronta-resultado .alerta.amarelo strong')`), 'Volume muito pequeno');
  confere('conversão mostrada', await js(`T.txt('#pronta-resultado .passo')`), 'Frasco na mesma unidade: 1 g = 1 000 000 mcg');
  await foto('03-alerta-amarelo.png');
  await tocar('#pronta-resultado .ir-redil');
  confere('foi para Rediluição', await js(`document.body.dataset.modo`), 'redil');
  confere('levou frasco e dose', await js(`[document.getElementById('redil-frasco').value, T.unDe('redil-frasco'), document.getElementById('redil-dose').value, T.unDe('redil-dose')].join(' ')`), '1 g 500 mcg');
  await js(`T.set('redil-aspira','1'); T.set('redil-completa','10')`);
  confere('rediluído: 0,05 mL', await js(`T.txt('#redil-resultado .volume')`), '0,05mL');
  await js(`T.set('redil-aspira','20')`);
  confere('aspira mais que a diluição', await js(`T.txt('#redil-aspira-msg')`), 'Não dá para aspirar mais do que a primeira diluição (10 mL).');

  console.log('--- UI e mEq ---');
  await js(`T.clicar('#aba-pronta'); T.clicar('#painel-pronta .limpar')`);
  await js(`T.un('pronta-frasco','UI')`);
  confere('frasco em UI puxa a dose para UI', await js(`T.unDe('pronta-dose')`), 'UI');
  await js(`T.set('pronta-dose','50'); T.set('pronta-frasco','5000'); T.set('pronta-diluicao','1')`);
  confere('heparina 50 UI / 5000 UI em 1 mL', await js(`T.txt('#pronta-resultado .volume')`), '0,01mL');
  confere('concentração em UI (sem mg/mL)', await js(`T.txt('#pronta-resultado .info b')`), '5 000 UI/mL');
  await js(`T.un('pronta-dose','mg')`);
  confere('dose em mg puxa o frasco para mg', await js(`T.unDe('pronta-frasco')`), 'mg');
  await js(`T.un('pronta-frasco','mEq'); T.set('pronta-dose','2'); T.set('pronta-frasco','25,6'); T.set('pronta-diluicao','10')`);
  confere('KCl 2 mEq / 25,6 mEq em 10 mL', await js(`T.txt('#pronta-resultado .volume')`), '0,78mL');

  console.log('--- Dose por peso ---');
  await js(`T.clicar('#aba-peso')`);
  confere('intervalo escondido em "por dose"', await js(`document.getElementById('peso-intervalo-campo').hidden`), true);
  await js(`T.un('peso-peso','kg'); T.set('peso-peso','2'); T.set('peso-doseKg','10'); T.set('peso-frasco','100'); T.set('peso-diluicao','5')`);
  confere('10 mg/kg, 2 kg: dose total', await js(`T.txt('#peso-resultado .dt-valor')`), '20 mg');
  confere('  volume', await js(`T.txt('#peso-resultado .volume')`), '1mL');
  await js(`T.un('peso-peso','g'); T.set('peso-peso','1850'); T.set('peso-doseKg','5'); T.set('peso-frasco','500'); T.set('peso-diluicao','10')`);
  confere('1850 g, 5 mg/kg: dose total', await js(`T.txt('#peso-resultado .dt-valor')`), '9,25 mg');
  confere('  volume', await js(`T.txt('#peso-resultado .volume')`), '0,19mL');
  confere('  sem arredondar', await js(`T.txt('#peso-resultado .exato')`), 'Sem arredondar: 0,185 mL');
  await js(`T.un('peso-tipo','dia'); T.set('peso-doseKg','100')`);
  confere('por dia: intervalo aparece', await js(`document.getElementById('peso-intervalo-campo').hidden`), false);
  confere('por dia: rótulo muda', await js(`T.txt('#peso-doseKg-rotulo')`), 'Dose prescrita por kg por dia (total do dia)');
  confere('100 mg/kg/dia de 12/12h: cada dose', await js(`T.txt('#peso-resultado .dt-rotulo') + ' = ' + T.txt('#peso-resultado .dt-valor')`), 'Dose de cada vez (12/12h) = 92,5 mg');
  confere('  conta do dia', await js(`T.txt('#peso-resultado .dt-conta')`), '100 mg/kg/dia × 1,85 kg = 185 mg/dia ÷ 2 doses');
  confere('  volume', await js(`T.txt('#peso-resultado .volume')`), '1,85mL');
  await foto('04-por-dia.png');
  await js(`T.set('peso-peso','1.850')`);
  confere('aviso do ponto ambíguo', await js(`T.txt('#peso-peso-msg')`), 'Lido como 1,85. Se você quis dizer 1 850, digite sem o ponto.');
  confere('alerta de peso estranho', await js(`T.txt('#peso-resultado .alerta.amarelo strong')`), 'Confira o peso');
  await js(`T.clicar('#painel-peso .limpar')`);
  confere('Limpar volta para "por dose" e unidades padrão', await js(`[T.unDe('peso-tipo'), T.unDe('peso-peso'), T.unDe('peso-doseKg')].join(' ')`), 'dose g mg/kg');

  console.log('--- Infusão contínua ---');
  await js(`T.clicar('#aba-infusao')`);
  await js(`T.un('infusao-peso','kg'); T.set('infusao-peso','2'); T.set('infusao-doseInf','5'); T.set('infusao-frasco','50'); T.set('infusao-diluicao','50')`);
  confere('dopamina 5 mcg/kg/min, 2 kg, 50 mg em 50 mL', await js(`T.txt('#infusao-resultado .volume')`), '0,6mL/h');
  confere('  rótulo', await js(`T.txt('#infusao-resultado .rotulo-aspirar')`), 'Vazão na bomba');
  confere('  resumo da dose', await js(`T.txt('#infusao-resultado .dose-resumo')`), 'Dose: 5 mcg/kg/min · bebê de 2 kg');
  confere('  concentração e duração', await js(`T.todos('#infusao-resultado .info b').join(' | ')`), '1 000 mcg/mL (= 1 mg/mL) | 83 h 20 min');
  confere('  dose por hora', await js(`T.todos('#infusao-resultado .passo')[0]`), 'Dose por hora: 5 mcg/kg/min × 2 kg × 60 min = 600 mcg/h');
  confere('  fórmula', await js(`T.txt('#infusao-resultado .formula')`), 'x = (600 mcg × 50 mL) ÷ 50 000 mcg = 0,6 mL em cada hora → 0,6 mL/h');
  await foto('05-infusao.png');

  console.log('--- Alerta vermelho e validações ---');
  await js(`T.clicar('#aba-pronta'); T.clicar('#painel-pronta .limpar')`);
  await js(`T.set('pronta-dose','600'); T.set('pronta-frasco','500'); T.set('pronta-diluicao','10')`);
  confere('alerta vermelho', await js(`T.txt('#pronta-resultado .alerta.vermelho strong')`), 'Dose maior que o frasco');
  confere('número em vermelho', await js(`document.querySelector('#pronta-resultado .volume').classList.contains('perigo')`), true);
  await foto('06-alerta-vermelho.png');
  await js(`T.clicar('#painel-pronta .limpar'); T.clicar('#painel-pronta button[type=submit]')`);
  await js(`T.set('pronta-dose','0'); T.set('pronta-frasco','abc'); T.set('pronta-diluicao','-3')`);
  confere('zero, texto e negativo', await js(`T.todos('#painel-pronta .msg.erro').join(' | ')`), 'Precisa ser maior que zero. | Número inválido. Use só algarismos e uma vírgula. | Use só números positivos.');

  console.log('--- Favoritos ---');
  await js(`T.clicar('#painel-pronta .limpar'); T.clicar('#abrir-favoritos')`);
  confere('lista começa vazia', await js(`T.txt('#lista-fav')`), v => v.startsWith('Nenhum remédio salvo'));
  await js(`T.clicar('#novo-fav')`);
  await js(`document.getElementById('fav-nome').value = 'Teste'; document.getElementById('fav-frasco').value = '500'; document.getElementById('fav-diluicao').value = '10'`);
  await foto('07-novo-favorito.png');
  await js(`T.botao('Salvar')`);
  await espera(100);
  confere('"Teste" na lista', await js(`T.txt('#lista-fav .fav-nome') + ' | ' + T.txt('#lista-fav .fav-desc')`), 'Teste | 500 mg em 10 mL');
  await js(`T.clicar('#lista-fav [data-acao=usar]')`);
  confere('aplicou e foi para a dose', await js(`[document.getElementById('pronta-frasco').value, document.getElementById('pronta-diluicao').value, document.activeElement.id].join(' ')`), '500 10 pronta-dose');
  await js(`T.set('pronta-dose','70')`);
  confere('"Usando: Teste"', await js(`T.txt('#pronta-resultado .fav-uso')`), '⭐ Usando: Teste – 500 mg em 10 mL');
  confere('Teste + 70 mg', await js(`T.txt('#pronta-resultado .volume')`), '1,4mL');
  await js(`T.set('pronta-diluicao','5')`);
  confere('mudou a diluição: avisa', await js(`T.txt('#pronta-resultado .fav-uso')`), '⭐ Baseado em Teste, mas com valores alterados');

  await js(`T.clicar('#abrir-favoritos'); T.clicar('#novo-fav')`);
  await js(`document.getElementById('fav-nome').value = 'Fentanil'; document.getElementById('fav-frasco').value = '0,05'; document.getElementById('fav-diluicao').value = '1';
    T.un('fav-doseUn','mcg'); document.getElementById('fav-obs').value = 'Correr em 30 min'; T.botao('Salvar')`);
  await espera(100);
  await js(`[...document.querySelectorAll('#lista-fav .fav')].find(li => li.textContent.includes('Fentanil')).querySelector('[data-acao=usar]').click()`);
  confere('favorito põe a dose em mcg', await js(`T.unDe('pronta-dose')`), 'mcg');
  await js(`T.set('pronta-dose','10')`);
  confere('Fentanil 10 mcg', await js(`T.txt('#pronta-resultado .volume')`), '0,2mL');
  confere('rótulo com unidade da dose e observação', await js(`T.txt('#pronta-resultado .fav-uso')`), '⭐ Usando: Fentanil – 0,05 mg em 1 mL · dose em mcgCorrer em 30 min');
  await foto('08-favorito-fentanil.png');

  await js(`T.clicar('#aba-redil'); T.clicar('#painel-redil .limpar')`);
  await js(`T.set('redil-frasco','500'); T.set('redil-diluicao','10'); T.set('redil-aspira','1'); T.set('redil-completa','10'); T.set('redil-dose','0,5')`);
  confere('rediluição 0,5 mg', await js(`T.txt('#redil-resultado .volume')`), '0,1mL');
  await js(`T.clicar('#redil-resultado .salvar-fav')`);
  await js(`document.getElementById('fav-nome').value = 'Ampicilina'; T.botao('Salvar')`);
  await espera(100);
  confere('salvou com rediluição', await js(`T.txt('#redil-resultado .fav-uso')`), '⭐ Usando: Ampicilina – 500 mg em 10 mL · aspira 1 mL e completa até 10 mL');

  await recarregar();
  await js(`T.clicar('#abrir-favoritos')`);
  confere('continua salvo e em ordem alfabética', await js(`T.todos('#lista-fav .fav-nome').join(', ')`), 'Ampicilina, Fentanil, Teste');
  await js(`{ const b = document.getElementById('busca-fav'); b.value = 'fent'; b.dispatchEvent(new Event('input')); }`);
  confere('busca', await js(`T.todos('#lista-fav .fav-nome').join(', ')`), 'Fentanil');
  await js(`{ const b = document.getElementById('busca-fav'); b.value = ''; b.dispatchEvent(new Event('input')); }`);
  await foto('09-lista.png', false);

  fs.readdirSync(SAIDA).filter(f => f.startsWith('calculu-favoritos')).forEach(f => fs.unlinkSync(path.join(SAIDA, f)));
  await js(`navigator.canShare = undefined; T.clicar('#exportar-fav')`);
  let arquivo;
  for (let i = 0; i < 30 && !arquivo; i++) { await espera(200); arquivo = fs.readdirSync(SAIDA).find(f => /^calculu-favoritos-.*\.json$/.test(f)); }
  const exportado = arquivo && JSON.parse(fs.readFileSync(path.join(SAIDA, arquivo), 'utf8'));
  confere('exportou', exportado && exportado.favoritos.map(f => f.nome + (f.obs ? ' (' + f.obs + ')' : '')).join(', '), 'Ampicilina, Fentanil (Correr em 30 min), Teste');

  await js(`[...document.querySelectorAll('#lista-fav .fav')].find(li => li.textContent.includes('Teste')).querySelector('[data-acao=excluir]').click()`);
  confere('pede confirmação para excluir', await js(`T.txt('.dialogo h2')`), 'Excluir favorito?');
  await js(`T.botao('Excluir')`);
  confere('excluiu', await js(`T.todos('#lista-fav .fav-nome').join(', ')`), 'Ampicilina, Fentanil');
  await js(`document.querySelector('#lista-fav [data-acao=editar]').click()`);
  await js(`document.getElementById('fav-nome').value = 'Ampicilina 1g'; T.botao('Salvar')`);
  await espera(100);
  confere('editou', await js(`T.todos('#lista-fav .fav-nome').join(', ')`), 'Ampicilina 1g, Fentanil');
  const doc = await cmd('DOM.getDocument');
  const no = await cmd('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#arquivo-importar' });
  await cmd('DOM.setFileInputFiles', { nodeId: no.nodeId, files: [path.join(SAIDA, arquivo)] });
  await espera(300);
  confere('importar pergunta juntar ou substituir', await js(`T.txt('.dialogo-texto')`), v => v && v.startsWith('O arquivo tem 3 favorito(s)'));
  await js(`T.botao('Juntar')`);
  await espera(100);
  confere('importou juntando', await js(`T.todos('#lista-fav .fav-nome').join(', ')`), 'Ampicilina, Ampicilina 1g, Fentanil, Teste');
  await js(`T.clicar('#fechar-folha')`);

  await js(`Storage.prototype._set = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('cheio'); }`);
  await js(`T.clicar('#aba-pronta'); T.clicar('#painel-pronta .limpar'); T.set('pronta-dose','70'); T.set('pronta-frasco','500'); T.set('pronta-diluicao','10'); T.clicar('#pronta-resultado .salvar-fav')`);
  await js(`document.getElementById('fav-nome').value = 'Sem espaço'; T.botao('Salvar')`);
  await espera(100);
  confere('falha ao salvar aparece na tela', await js(`T.txt('#faixa span')`), v => v && v.startsWith('Não foi possível salvar os favoritos'));
  await js(`Storage.prototype.setItem = Storage.prototype._set; document.getElementById('faixa').hidden = true`);

  console.log('--- Modo noturno ---');
  await js(`T.clicar('#tema')`);
  confere('liga o modo noturno', await js(`document.documentElement.dataset.tema`), 'noite');
  await recarregar();
  confere('continua noturno ao abrir de novo', await js(`document.documentElement.dataset.tema`), 'noite');
  await js(`T.set('pronta-dose','70'); T.set('pronta-frasco','500'); T.set('pronta-diluicao','10')`);
  await foto('10-noturno.png');
  await js(`T.clicar('#abrir-favoritos')`);
  await foto('11-noturno-favoritos.png', false);
  await js(`T.clicar('#fechar-folha'); T.clicar('#tema')`);
  confere('volta ao claro', await js(`document.documentElement.dataset.tema || 'dia'`), 'dia');

  console.log('--- Celular de 360 px ---');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 360, height: 760, deviceScaleFactor: 2, mobile: true });
  await espera(200);
  for (const modo of ['pronta', 'peso', 'redil', 'infusao']) {
    await js(`T.clicar('#aba-${modo}')`);
    if (modo === 'peso') await js(`T.un('peso-tipo','dia')`);
    await espera(100);
    confere(`aba ${modo}: nada passa da largura da tela`, await js(`document.documentElement.scrollWidth <= 360`), true);
    confere(`aba ${modo}: nenhum botão de unidade com texto cortado`,
      await js(`[...document.querySelectorAll('#painel-${modo} .unidades button')].filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent).join(', ')`), '');
    await js(`window.scrollTo(0, 0)`);
    await foto(`12-tela-360-${modo}.png`);
  }
  await js(`T.clicar('#painel-peso .limpar'); T.clicar('#aba-pronta')`);
  await cmd('Emulation.setDeviceMetricsOverride', { width: 380, height: 800, deviceScaleFactor: 2, mobile: true });

  console.log('--- Instalar, offline e atualização ---');
  const manifesto = await cmd('Page.getAppManifest');
  confere('manifesto sem erros', manifesto.errors.map(e => e.message).join('; '), '');
  confere('ícones PNG no manifesto', ((manifesto.data || '').match(/data:image\/png/g) || []).length, 3);
  confere('ícone do iPhone', await js(`(document.querySelector('link[rel=apple-touch-icon]') || {}).href?.slice(0, 22)`), 'data:image/png;base64,');
  confere('service worker ativo', await js(`navigator.serviceWorker.ready.then(r => !!r.active)`), true);
  await recarregar(400);
  confere('página controlada pelo service worker', await js(`!!navigator.serviceWorker.controller`), true);
  const inst = await cmd('Page.getInstallabilityErrors');
  confere('pode instalar como app', inst.installabilityErrors.map(e => e.errorId).join(', '), '');
  confere('sem aviso de versão nova à toa', await js(`document.getElementById('nova-versao').hidden`), true);
  marca = '\n<!-- versao de teste 2 -->';
  await recarregar(400);
  let apareceu = false;
  for (let i = 0; i < 25 && !apareceu; i++) { await espera(200); apareceu = await js(`!document.getElementById('nova-versao').hidden`); }
  confere('avisa quando há versão nova', apareceu, true);
  await foto('13-versao-nova.png', false);
  c = carregou();
  await js(`T.clicar('.botao-atualizar')`);
  await c;
  await espera(1700);
  confere('"Atualizar" abre a versão nova', await js(`[...document.childNodes].some(n => n.nodeType === 8 && n.data.includes('versao de teste 2'))`), true);
  confere('e o aviso some', await js(`document.getElementById('nova-versao').hidden`), true);
  await cmd('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await recarregar();
  await js(`T.set('pronta-dose','70'); T.set('pronta-frasco','500'); T.set('pronta-diluicao','10')`);
  confere('funciona sem internet', await js(`T.txt('#pronta-resultado .volume')`), '1,4mL');
  await cmd('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  console.log('--- Celular antigo ---');
  await cmd('Page.addScriptToEvaluateOnNewDocument', { source: 'delete window.BigInt;' });
  await recarregar();
  confere('mostra aviso de celular antigo', await js(`getComputedStyle(document.getElementById('antigo')).display !== 'none'`), true);
  confere('esconde a calculadora', await js(`getComputedStyle(document.querySelector('.abas')).display`), 'none');
  await foto('14-celular-antigo.png', false);
  const errosAntigo = erros.length;

  confere('erros de JavaScript', erros.slice(0, errosAntigo).join(' || '), '');
  ws.close();
  nav.kill();
  servidor.close();
  console.log(`\nFotos da tela em: ${SAIDA}`);
  console.log(falhas ? `${falhas} FALHA(S)` : 'Todos os testes da tela passaram.');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e); process.exit(2); });
