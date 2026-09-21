# Editor BPMN integrado

O editor de processos Fluig e distribuido no mesmo VSIX da extensao principal.

## Estrutura

- `src/extensions/BpmnEditorExtension.ts`: fronteira tipada com a API do VS Code e registro dos comandos.
- `src/bpmn/*.ts`: parser, validadores, patchers, catalogos e provider do editor.
- `media/bpmn`: webview executada no sandbox do VS Code.
- `test/bpmn`: testes funcionais e fixtures autocontidos.

O bundle e gerado pela mesma entrada `src/extension.ts` e pelo mesmo webpack do restante da extensao. O editor separado nao e uma dependencia de execucao.

## Estrategia de tipagem

Os modulos legados foram migrados para arquivos TypeScript sem alterar sua semantica CommonJS. Eles passam pelo compilador TypeScript em modo de transpilacao durante o bundle, enquanto a fronteira do VS Code permanece sob `strict`.

Essa separacao preserva os formatos `.process` ja homologados e permite endurecer os tipos gradualmente, modulo a modulo, usando os 302 testes do editor como rede de seguranca. Ao concluir a tipagem de um modulo, ele deve ser retirado do grupo de transpilacao legada no webpack e incluido na verificacao estrita do `tsconfig.json`.
