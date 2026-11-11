// Publica o CalcuLu no Netlify (https://calculu-app.netlify.app).
// Rodar: node publicar.js
// Usa o login salvo do Netlify neste computador (pasta do netlify-cli); a chave nunca é impressa.
// Rode os testes antes (veja o README).
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SITE = '8abacb42-7a4a-4742-9274-dfac1a3e4e5d';
const ARQUIVOS = ['index.html', 'sw.js'];
const API = 'https://api.netlify.com/api/v1';

const pastaConfig = process.platform === 'win32'
  ? path.join(process.env.APPDATA || '', 'netlify', 'Config')
  : path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Preferences/netlify' : '.config/netlify');
let token;
try {
  const config = JSON.parse(fs.readFileSync(path.join(pastaConfig, 'config.json'), 'utf8'));
  token = Object.values(config.users || {})[0].auth.token;
} catch (e) {
  console.error('Não achei o login do Netlify neste computador. Rode "npx netlify-cli login" uma vez e tente de novo.');
  process.exit(1);
}

const pedir = async (metodo, caminho, corpo, tipo = 'application/json') => {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': tipo },
    body: corpo == null ? undefined : (tipo === 'application/json' ? JSON.stringify(corpo) : corpo),
  });
  if (!r.ok) throw new Error(`${metodo} ${caminho}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

(async () => {
  const conteudo = Object.fromEntries(ARQUIVOS.map(a => [a, fs.readFileSync(path.join(__dirname, a))]));
  const resumo = Object.fromEntries(ARQUIVOS.map(a => ['/' + a, crypto.createHash('sha1').update(conteudo[a]).digest('hex')]));
  const deploy = await pedir('POST', `/sites/${SITE}/deploys`, { files: resumo });
  for (const a of ARQUIVOS) {
    if ((deploy.required || []).includes(resumo['/' + a])) {
      await pedir('PUT', `/deploys/${deploy.id}/files/${a}`, conteudo[a], 'application/octet-stream');
      console.log('enviado:', a);
    }
  }
  let estado = deploy.state;
  for (let i = 0; i < 60 && !['ready', 'error'].includes(estado); i++) {
    await new Promise(r => setTimeout(r, 2000));
    estado = (await pedir('GET', `/deploys/${deploy.id}`)).state;
  }
  console.log(estado === 'ready' ? 'Publicado: https://calculu-app.netlify.app' : 'A publicação não terminou: ' + estado);
  process.exit(estado === 'ready' ? 0 : 1);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
