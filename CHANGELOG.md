# Change Log

Lista de atualizações da Extensão.

## 1.18.1

Remove as linhas desnecessárias do template do Mecanismo Customizado.

## 1.18.0

Adiciona o comando de criar Mecanismo Customizado.

## 1.17.1

Corrige cor de fundo do cabeçalho fixo da consulta de dataset.

## 1.17.0

Adiciona o comando `Instalar Declarações de Tipo` para instalar a biblioteca de declarações de tipo puxando os
arquivos mais atualizados do GitHub.

## 1.16.0

Adiciona atalhos para:

- Exportar Dataset (CTRL + F9 / CMD + F9)
- Novo Dataset (CTRL + F10 / CMD + F10)
- Novo Formulário (CTRL + F11 / CMD + F11)
- Novo Evento de Formulário (CTRL + F12 / CMD + F12)
- Novo Evento de Processo (CTRL + F12 / CMD + F12)

## 1.15.2

Realmente corrige o bug de não fechar a tela de loading quando há erro de consulta ao Dataset. Ainda havia uma
situação na qual a tela de loading permanecia aberta.

## 1.15.1

Corrige o bug de não fechar a tela de loading quando há erro de consulta ao Dataset.

## 1.15.0

Melhorias de Interface, otimização de performance e correção de bugs nas chamadas aos Datasets.

Ao efetuar consultas de Datasets as Constraints não estavam filtrando corretamente.

Adição dos seguintes snippets JavaScript (front-end):

- fluig-dataset-async
- fluig-modal
- fluig-widget

## 1.14.0

Adicionada a opção de efetuar a consulta a um Dataset indicando quais colunas devem vir ordenadas.

## 1.13.2

Melhoria visual aplicando o tema configurado no VS Code à Extensão.

## 1.13.1

Melhoria visual da seleção de campos ao visualizar Dataset.

## 1.13.0

Permite selecionar os campos que serão retornados do Dataset ao Consultar Dataset.

## 1.12.0

Adiciona a Consulta de Dataset no gerenciamento dos Servidores.

## 1.10.0

Adição dos comandos:

- Importar Vários Formulários
- Importar Evento Global
- Importar Vários Eventos Globais

Ao exportar um Dataset o nome dele virá em primeiro na listagem caso já exista no servidor, facilitando a exportação
de Dataset já existente.

Melhor ordenação dos comandos no menu de contexto **File Explorer**.

Correção de vulnerabilidades nas dependências da extensão.

## 1.9.1

Melhoria de performance na descriptografia da senha do servidor.

## 1.9.0

Adicionado o comando "Importar Formulário".

A senha do servidor agora é criptografada utilizando como frase secreta a identificação do computador do usuário.

## 1.8.0

Agora as senhas dos servidores são criptografadas no momento de armazenagem.

Os servidores salvos devem ser atualizados para que as senhas sejam atualizadas com a criptografia.

## 1.7.0

Adição do snippet JavaScript (fluig-paifilho-loop-workflow) para percorrer Pai Filho em evento de Processo.

## 1.6.0

Adição do snippet JavaScript (fluig-consulta-jdbc) para facilitar consulta direta ao Banco de Dados com JDBC.

## 1.5.0

Adição dos comandos:

- Exportar Dataset
- Importar Dataset
- Importar Vários Dataset

Adição dos eventos de Processo:

- afterStateEntry
- afterTaskSave

## 1.4.0

Adição do gerenciamento de Servidores.

## 1.3.0

Adição dos snippets HTML:

- fluig-checkbox
- fluig-checkbox-inline
- fluig-alert
- fluig-alert-dismissible
- fluig-button-dropdown-split

## 1.2.0

Adição dos snippets HTML:

- fluig-radio
- fluig-radio-inline
- fluig-tabs

## 1.1.0

Adição dos snippets JavaScript:

- fluig-beforeMovementOptions
- fluig-beforeSendValidate
- fluig-zoom-removed
- fluig-zoom-selected

## 1.0.0

- Melhoria da documentação da Extensão;
- Redução do tamanho da Extensão;

## 0.0.8

- Adicionado comando **Novo Evento Global**;
- Adicionado template para o evento global **displayCentralTasks**;
- Adicionado template para o evento global **onNotify**;

## 0.0.7

- Refatoração dos templates em arquivos ao invés de funções;

## 0.0.5

- Comando **Novo Evento de Formulário** só aparece no menu se for selecionado um formulário;
- Comando **Novo Evento de Processo** só aparece no menu se for selecionado um diagrama de processo;

## 0.0.3

- Criação do comando **Novo Evento de Formulário** no menu de contexto de arquivos;
- Criação do comando **Novo Evento de Processo** no menu de contexto de arquivos;

## 0.0.2

- Comando **Criar Dataset** adicionado ao menu de contexto de arquivos;
- Comando **Novo Formulário** adicionado ao menu de contexto de arquivos;

## 0.0.1

- Criação dos snippets para HTML;
- Criação dos snippets para JavaScript;
- Criação do comando **Novo Dataset** no Command Palette;
- Criação do comando **Novo Formulário** no Command Palette;
