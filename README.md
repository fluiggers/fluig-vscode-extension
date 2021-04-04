# Fluig - Extensão VS Code

Extensão para facilitar o desenvolvimento na plataforma TOTVS Fluig utilizando o VS Code.

Essa extensão adiciona alguns comandos para criar arquivos e snippets HTML e JavaScript.

Os comandos aparecem ao clicar com o botão direito do mouse nos arquivos e diretórios, sendo obrigatório ter um Diretório / Workspace aberto.

![Novo Dataset](images/dataset.gif)

## Instalação

Você pode procurar pela extensão `Fluig - Extensão VS Code` no VS Code ou baixá-la diretamente no [VS Code Market Place: Fluig - Extensão VS Code](https://marketplace.visualstudio.com/items?itemName=BrunoGasparetto.fluig-vscode-extension).

Essa extensão cria os arquivos utilizando os tipos declarados na biblioteca [Declaração de Tipos para o Fluig](https://github.com/brunogasparetto/fluig-declaration-type) para ter auto-complete no VS Code, por isso é recomendado que ela seja instalada.

## Como utilizar

Para utilizar os comandos de criação de arquivos é obrigatório estar com um diretório / workspace aberto.

Os seguintes comandos estão disponíveis:

- [Novo Dataset](#novo-dataset);
- [Novo Formulário](#novo-formulário);
- [Novo Evento Global](#novo-evento-global);
- [Novo Evento de Formulário](#novo-evento-de-formulário);
- [Novo Evento de Processo](#novo-evento-de-processo);

Foram criados snippets para as seguintes linguagens:

- [Snippets para HTML](#snippets-para-html);
- [Snippets para JavaScript](#snippets-para-javascript);

## Novo Dataset.

Esse comando cria um arquivo JavaScript, após você preencher o nome do Dataset, no diretório `datasets` do seu projeto Fluig.

O arquivo vem com as quatro funções básicas de datasets que o Fluig disponibiliza.

Você pode executar esse comando no **Command Palette** ou com o menu de contexto no **File Explorer**.

## Novo Formulário.

Esse comando cria, após preencher o nome, um diretório contendo um arquivo HTML de formulário. Esse diretório é criado dentro do diretório `forms` do seu projeto Fluig.

O arquivo HTML vem com o esqueleto básico de um formulário Fluig utilizando o **Fluig Style Guide**.

Você pode executar esse comando no **Command Palette** ou com o menu de contexto no **File Explorer**.

## Novo Evento Global

Esse comando cria um arquivo JavaScript, após selecionar o evento, no diretório `events` do seu projeto Fluig.

O arquivo JavaScript contém a estrutura da função do evento selecionado.

Você pode executar esse comando no **Command Palette** ou com o menu de contexto no **File Explorer**.

Eventos disponibilizados:

- displayCentralTasks
- onNotify

## Novo Evento de Formulário

Esse comando cria um arquivo JavaScript, após selecionar o evento, no diretório `events` do formulário selecionado.

Esse comando só é exibido no menu de contexto no **File Explorer** ao selecionar um **Formulário** ou qualquer arquivo / diretório que esteja dentro de um formulário.

O arquivo JavaScript contém a estrutura da função do evento selecionado.

Eventos disponibilizados:

- afterProcessing
- afterSaveNew
- beforeProcessing
- displayFields
- enableFields
- inputFields
- setEnable
- validateForm

## Novo Evento de Processo

Esse comando cria um arquivo JavaScript, após selecionar o evento, no diretório `workflow/scripts` do seu projeto Fluig.

Esse comando só é exibido no menu de contexto no **File Explorer** ao selecionar um **Diagrama**, que são arquivos com a extensão **.process** e estão no diretório `workflow/diagrams`.

O arquivo JavaScript será nomeado seguindo a regra do Fluig (nome_do_diagrama.nome_do_evento.js) e contém a estrutura da função do evento selecionado.

É possível criar uma função compartilhada para o processo selecionando a opção **Nova Função** no menu de eventos. Quando o fizer será solicitado que informe o nome da função.

Eventos disponibilizados:

- afterCancelProcess
- afterProcessCreate
- afterProcessFinish
- afterReleaseProcessVersion
- afterReleaseVersion
- afterStateLeave
- afterTaskComplete
- afterTaskCreate
- beforeCancelProcess
- beforeSendData
- beforeStateEntry
- beforeStateLeave
- beforeTaskComplete
- beforeTaskCreate
- beforeTaskSave
- checkComplementsPermission
- subProcessCreated
- validateAvailableStates

## Snippets para HTML

Snippets para criar estruturas HTML seguindo o **Fluig Style Guide**.

Os snippets disponibilizados são:

- **fluig-input-data**: cria uma coluna com input do tipo texto e ícone de calendário;
- **fluig-input-text**: cria uma coluna contendo um input do tipo texto;
- **fluig-input-textarea**: cria uma coluna contendo um textarea;
- **fluig-input-zoom**: cria uma coluna contendo um Zoom;
- **fluig-panel-collapse**: cria um painel com estrutura de collapse;
- **fluig-panel**: cria um painel;
- **fluig-switch-aprovacao**: cria uma linha contendo dois botões para indicar aprovação / reprovação;

## Snippets para JavaScript

Devido ao Fluig utilizar JavaScript para front-end (navegador) e JavaScript para back-end que será convertido em Java (e possui um suporte antigo) na descrição de cada snippet é indicado se ele deve ser utilizado em qual dos dois ambientes.

### Snippets para Back-End

- **fluig-function-data**: cria uma função que retorna a data atual formatada no padrão solicitado;
- **fluig-paifilho-loop**: cria um loop for percorrendo os elementos de uma tabela pai filho;

### Snippets para Front-End

- **fluig-calendar**: Ativa o plugin de Data em um input text;
- **fluig-data-atual**: Pega a data atual formatada em PT-BR;

## Todo

- Criar comando Novo Widget;
- Criar comando Novo Layout;
- Adicionar todos os templates de Eventos Globais;
- Adicionar novos Snippets;

## Colaboração

Sinta-se à vontade para colaborar criando mais snippets, templates de arquivos e comandos.

Basta criar um fork e uma efetuar uma PR quando estiver pronto.
