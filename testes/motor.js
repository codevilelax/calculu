// Testa as contas do CalcuLu (o "motor" dentro do index.html).
// Rodar: node testes/motor.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const codigo = html.match(/<script id="motor">([\s\S]*?)<\/script>/)[1];
const Motor = vm.runInNewContext(codigo + '\n;Motor', {});

const n = t => { const r = Motor.lerNumero(t); if (r.erro) throw new Error('entrada inválida: ' + t); return r.valor; };
const alertas = r => (r.alertas || []).map(a => a.codigo).join(',') || '-';
const erros = r => Object.keys(r.errosCampo || {}).join(',') || '-';
const vol = r => Motor.volumePrincipal(r.volume);
let falhas = 0;
function confere(nome, obtido, esperado) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}: ${obtido}${ok ? '' : `  (esperado ${esperado})`}`);
}
const pronta = (dose, doseUn, frasco, frascoUn, diluicao) =>
  Motor.calcDosePronta({ dose: n(dose), doseUn, frasco: n(frasco), frascoUn, diluicao: n(diluicao) });
const peso = (p, pesoUn, doseKg, doseKgUn, frasco, frascoUn, diluicao, tipo = 'dose', intervalo = '12') =>
  Motor.calcPeso({ peso: n(p), pesoUn, doseKg: n(doseKg), doseKgUn, frasco: n(frasco), frascoUn, diluicao: n(diluicao), tipo, intervalo });
const infusao = (p, pesoUn, doseInf, doseInfUn, frasco, frascoUn, diluicao) =>
  Motor.calcInfusao({ peso: n(p), pesoUn, doseInf: n(doseInf), doseInfUn, frasco: n(frasco), frascoUn, diluicao: n(diluicao) });
const redil = (frasco, frascoUn, diluicao, aspira, completa, dose, doseUn) =>
  Motor.calcRediluicao({ frasco: n(frasco), frascoUn, diluicao: n(diluicao), aspira: n(aspira), completa: n(completa), dose: n(dose), doseUn });

console.log('--- Casos pedidos ---');
let r = pronta('70', 'mg', '500', 'mg', '10');
confere('70 mg, frasco 500 mg em 10 mL', vol(r), '1,4');
confere('  concentração (mg/mL)', Motor.num(r.concentracao), '50');
confere('  alertas', alertas(r), '-');
r = peso('2', 'kg', '10', 'mg/kg', '100', 'mg', '5');
confere('10 mg/kg, 2 kg, 100 mg em 5 mL: dose', Motor.num(r.doseTotal) + ' ' + r.doseTotalUn, '20 mg');
confere('  volume', vol(r), '1');
r = peso('1850', 'g', '5', 'mg/kg', '500', 'mg', '10');
confere('1850 g, 5 mg/kg, 500 mg em 10 mL: dose', Motor.num(r.doseTotal) + ' ' + r.doseTotalUn, '9,25 mg');
confere('  sem arredondar', Motor.semArredondar(r.volume), '0,185');
confere('  exibido', vol(r), '0,19');
r = pronta('500', 'mcg', '1', 'g', '10');
confere('500 mcg, frasco 1 g em 10 mL', vol(r), '0,005');
confere('  alerta', alertas(r), 'muito-pequeno');
confere('  frasco convertido', Motor.num(r.frasco) + ' ' + r.un, '1 000 000 mcg');

console.log('--- Arredondamento e números ---');
confere('0,185 com conta comum de computador daria', (9.25 * 10 / 500).toFixed(2), '0.18');
r = pronta('70', 'mg', '300', 'mg', '10');
confere('dízima: exibido', vol(r), '2,33');
confere('dízima: sem arredondar', Motor.semArredondar(r.volume), '2,333333…');
r = pronta('1', 'mg', '3', 'mg', '1');
confere('1/3 mL na conta', Motor.num(r.volume), '≈ 0,3333');
const soma = Motor.fr(n('0,1').n * n('0,2').d + n('0,2').n * n('0,1').d, n('0,1').d * n('0,2').d);
confere('0,1 + 0,2', Motor.num(soma), '0,3');
confere('vírgula ou ponto', Motor.num(n('1.5')) + ' / ' + Motor.num(n('1,5')) + ' / ' + Motor.num(n(',5')), '1,5 / 1,5 / 0,5');
confere('"1.850" é ambíguo', String(Motor.lerNumero('1.850').ambiguo), 'true');
for (const t of ['', '0', '0,0', '-5', 'abc', '1,2,3', '1.000,5', '7mg']) {
  confere(`rejeita "${t}"`, Motor.lerNumero(t).erro ? 'rejeitado' : 'aceito', 'rejeitado');
}

console.log('--- Alertas ---');
confere('dose maior que o frasco', alertas(pronta('600', 'mg', '500', 'mg', '10')), 'maior-que-frasco');
confere('dose = frasco inteiro', alertas(pronta('500', 'mg', '500', 'mg', '10')), '-');
confere('exatamente 0,1 mL', alertas(pronta('5', 'mg', '500', 'mg', '10')), '-');
confere('peso 1850 kg', alertas(peso('1850', 'kg', '5', 'mg/kg', '500', 'mg', '10')), 'peso-incomum,maior-que-frasco');

console.log('--- UI e mEq ---');
r = pronta('50', 'UI', '5000', 'UI', '1');
confere('heparina 50 UI, 5000 UI em 1 mL', vol(r) + ' / ' + alertas(r), '0,01 / muito-pequeno');
r = pronta('2', 'mEq', '25,6', 'mEq', '10');
confere('KCl 2 mEq, 25,6 mEq em 10 mL', vol(r) + ' (' + Motor.semArredondar(r.volume) + ')', '0,78 (0,78125)');
confere('UI com frasco em mg', erros(pronta('50', 'UI', '500', 'mg', '10')), 'dose');
confere('mg com frasco em mEq', erros(pronta('50', 'mg', '20', 'mEq', '10')), 'dose');
r = peso('2', 'kg', '10', 'UI/kg', '5000', 'UI', '1');
confere('10 UI/kg, 2 kg, 5000 UI em 1 mL', Motor.num(r.doseTotal) + ' ' + r.doseTotalUn + ' / ' + vol(r), '20 UI / 0,004');
confere('mEq/kg com frasco em mg', erros(peso('2', 'kg', '1', 'mEq/kg', '500', 'mg', '10')), 'doseKg');

console.log('--- Prescrição por dia ---');
r = peso('1850', 'g', '100', 'mg/kg', '500', 'mg', '10', 'dia', '12');
confere('100 mg/kg/dia, 1850 g, 12/12h: dose do dia', Motor.num(r.doseDia), '185');
confere('  doses por dia', String(r.dosesPorDia), '2');
confere('  cada dose', Motor.num(r.doseTotal), '92,5');
confere('  volume', vol(r), '1,85');
r = peso('1', 'kg', '100', 'mg/kg', '500', 'mg', '10', 'dia', '8');
confere('100 mg/kg/dia, 1 kg, 8/8h: cada dose', Motor.num(r.doseTotal), '≈ 33,3333');
confere('  volume (sem arredondar)', vol(r) + ' (' + Motor.semArredondar(r.volume) + ')', '0,67 (0,666666…)');
r = peso('2', 'kg', '20', 'mg/kg', '500', 'mg', '10', 'dia', '24');
confere('24/24h = a dose do dia inteira', Motor.num(r.doseTotal), '40');

console.log('--- Infusão contínua ---');
r = infusao('2', 'kg', '5', 'mcg/kg/min', '50', 'mg', '50');
confere('dopamina 5 mcg/kg/min, 2 kg, 50 mg em 50 mL', vol(r), '0,6');
confere('  dose por hora', Motor.num(r.dosePorHora), '600');
confere('  concentração', Motor.num(r.concentracao) + ' ' + r.un + '/mL', '1 000 mcg/mL');
confere('  duração', Motor.horasEMinutos(r.duracaoH), '83 h 20 min');
confere('  alertas', alertas(r), '-');
confere('fentanil 1 mcg/kg/h, 1850 g, 50 mcg em 50 mL', vol(infusao('1850', 'g', '1', 'mcg/kg/h', '50', 'mcg', '50')), '1,85');
confere('heparina 10 UI/kg/h, 2 kg, 500 UI em 50 mL', vol(infusao('2', 'kg', '10', 'UI/kg/h', '500', 'UI', '50')), '2');
confere('midazolam 0,06 mg/kg/h, 1 kg, 5 mg em 50 mL', vol(infusao('1', 'kg', '0,06', 'mg/kg/h', '5', 'mg', '50')), '0,6');
r = infusao('0,5', 'kg', '5', 'mcg/kg/min', '200', 'mg', '10');
confere('vazão muito baixa', vol(r) + ' / ' + alertas(r), '0,0075 / vazao-baixa');
r = infusao('2', 'kg', '10', 'mcg/kg/min', '1', 'mg', '1');
confere('solução acaba em menos de 1 h', vol(r) + ' / ' + alertas(r) + ' / ' + Motor.horasEMinutos(r.duracaoH), '1,2 / acaba-rapido / 50 min');
confere('UI/kg/h com solução em mg', erros(infusao('2', 'kg', '10', 'UI/kg/h', '50', 'mg', '50')), 'doseInf');

console.log('--- Rediluição ---');
r = redil('500', 'mg', '10', '1', '10', '0,5', 'mg');
confere('500 mg em 10 mL, aspira 1, completa 10, dose 0,5 mg', `${Motor.num(r.conc1)} → ${Motor.num(r.conc2)} → ${vol(r)}`, '50 → 5 → 0,1');
r = redil('1', 'g', '10', '1', '10', '500', 'mcg');
confere('caso 4 rediluído', vol(r) + ' / ' + alertas(r), '0,05 / pequeno-mesmo-rediluido');
confere('aspira > diluição e completa < aspira', erros(redil('500', 'mg', '10', '11', '5', '1', 'mg')), 'aspira,completa');
confere('unidade da dose não combina', erros(redil('500', 'mg', '10', '1', '10', '1', 'UI')), 'dose');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodas as contas conferem.');
process.exit(falhas ? 1 : 0);
