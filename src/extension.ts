// The module "vscode" contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { posix } from "path";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand("fluig-vscode-extension.newDataset", createDataset));
    context.subscriptions.push(vscode.commands.registerCommand("fluig-vscode-extension.newForm", createForm));
    context.subscriptions.push(vscode.commands.registerCommand("fluig-vscode-extension.newFormEvent", createFormEvent));
}

// this method is called when your extension is deactivated
export function deactivate() {}

/**
 * Cria um arquivo contendo um novo Dataset
 */
async function createDataset() {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    let dataset:string = await vscode.window.showInputBox({
        prompt: "Qual o nome do Dataset (sem espaços e sem caracteres especiais)?",
        placeHolder: "ds_nome_dataset"
    }) || "";

    if (!dataset) {
        return;
    }

    if (!dataset.endsWith(".js")) {
        dataset += ".js";
    }

    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const datasetUri = workspaceFolderUri.with({ path: posix.join(workspaceFolderUri.path, "datasets", dataset) });
    await vscode.workspace.fs.writeFile(datasetUri, Buffer.from(createDatasetContent(), "utf-8"));
    vscode.window.showTextDocument(datasetUri);
}

/**
 * Cria o conteúdo do arquivo de um novo Dataset
 *
 * @returns {string}
 */
function createDatasetContent() {
    return `/**
 *
 *
 * @param {string[]} fields Campos Solicitados
 * @param {Constraint[]} constraints Filtros
 * @param {string[]} sorts Campos da Ordenação
 * @returns {Dataset}
 */
function createDataset(fields, constraints, sorts) {
    var dataset = DatasetBuilder.newDataset();

    return dataset;
}

/**
 *
 */
function defineStructure() {

}

/**
 *
 *
 * @param {number} lastSyncDate
 */
function onSync(lastSyncDate) {

}

/**
 *
 *
 * @param user
 * @returns {DatasetMobileSync}
 */
function onMobileSync(user) {

}
`;
}

/**
 * Cria um novo formulário
 */
async function createForm() {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    let formName:string = await vscode.window.showInputBox({
        prompt: "Qual o nome do Formulário (sem espaços e sem caracteres especiais)?",
        placeHolder: "NomeFormulario"
    }) || "";

    if (!formName) {
        return;
    }

    const formFileName = formName + ".html";
    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const formUri = workspaceFolderUri.with({ path: posix.join(workspaceFolderUri.path, "forms", formName, formFileName) });
    await vscode.workspace.fs.writeFile(formUri, Buffer.from(createFormContent(), "utf-8"));
    vscode.window.showTextDocument(formUri);
}

/**
 * Cria o conteúdo do arquivo de um novo Dataset
 *
 * @returns {string}
 */
function createFormContent() {
    return `<html>
<head>
    <link rel="stylesheet" href="/style-guide/css/fluig-style-guide.min.css"/>
    <script type="text/javascript" src="/portal/resources/js/jquery/jquery.js"></script>
    <script type="text/javascript" src="/portal/resources/js/jquery/jquery-ui.min.js"></script>
    <script type="text/javascript" src="/portal/resources/js/mustache/mustache-min.js"></script>
    <script type="text/javascript" src="/style-guide/js/fluig-style-guide.min.js"></script>
</head>
<body>
    <div class="fluig-style-guide">
        <form name="form" role="form">

        </form>
    </div>
</body>
</html>
`;
}

/**
 * Cria um novo evento de formulário
 */
async function createFormEvent(folderUri: vscode.Uri) {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("Você precisa estar em um diretório / workspace.");
        return;
    }

    if (!folderUri.path.includes("/forms/")) {
        vscode.window.showErrorMessage("Necessário selecionar um formulário para criar o evento.");
        return;
    }

    const formName:string = folderUri.path.replace(/.*\/forms\/([^/]+).*/, "$1");

    console.log(formName);

    const eventName: string = await vscode.window.showQuickPick(
        [
            'afterProcessing',
            'afterSaveNew',
            'beforeProcessing',
            'displayFields',
            'enableFields',
            'inputFields',
            'setEnable',
            'validateForm'
        ],
        {
            canPickMany: false,
            placeHolder: "Selecione o Evento"
        }
    ) || "";

    if (!eventName) {
        return;
    }

    const eventFilename = eventName + ".js";
    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const eventUri = workspaceFolderUri.with({
        path: posix.join(
            workspaceFolderUri.path,
            "forms",
            formName,
            'events',
            eventFilename
        )
    });

    let fileData: string = "";

    switch (eventName) {
        case "displayFields":
            fileData = createEventFormDisplayFields();
            break;

        case "setEnable":
            fileData = createEventFormSetEnable();
            break;

        default:
            fileData = createEventFormWithFormController(eventName);
    }

    await vscode.workspace.fs.writeFile(eventUri, Buffer.from(fileData, "utf-8"));
    vscode.window.showTextDocument(eventUri);
}

function createEventFormWithFormController(eventName: string) {
    return `/**
 *
 *
 * @param {FormController} form
 */
function ${eventName}(form) {

}
`;
}

function createEventFormSetEnable() {
    return `/**
 *
 *
 */
function setEnable() {

}
`;
}

function createEventFormDisplayFields() {
    return `/**
 *
 *
 * @param {FormController} form
 * @param {customHTML} customHTML
 */
function displayFields(form, customHTML) {

}
`;
}
