# CalcuLu

Calculadora de medicação feita para (UTI neonatal). Funciona no celular e sem internet.

O app tem quatro modos:
- **Dose pronta:** quantos mL aspirar.
- **Dose por peso:** a dose pode ser prescrita por dose ou por dia, dividida em horários.
- **Rediluição:** para doses muito pequenas.
- **Infusão contínua:** vazão da bomba em mL/h.

Também tem favoritos com backup, modo noturno e alertas de segurança.

Ferramenta de apoio. Confira sempre a prescrição e siga o protocolo da unidade.

O app está publicado em **https://calculu-app.netlify.app**.

## Arquivos

- `index.html`: o app inteiro (tela, estilo e contas).
- `sw.js`: deixa o app abrir sem internet e avisa quando sai uma versão nova. Precisa ficar ao lado do `index.html`.
- `testes/`: testes automáticos.
- `publicar.js`: envia o `index.html` e o `sw.js` para o Netlify. Rode com `node publicar.js`, depois dos testes.

## Antes de publicar qualquer mudança

```
node testes/motor.js
node testes/tela.js
```

- `motor.js` confere as contas: os casos combinados, o arredondamento, UI e mEq, a prescrição por dia e a infusão.
- `tela.js` abre o app no Chrome ou no Edge simulando um celular, testa com toques de verdade e salva fotos da tela.

Os dois precisam terminar sem nenhuma `FALHA`.

As contas usam frações exatas, e só o que aparece na tela é arredondado. Não troque esse cálculo por números comuns do JavaScript: com eles, 0,185 mL arredonda para 0,18 em vez de 0,19.
