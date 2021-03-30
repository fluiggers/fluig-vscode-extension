// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { posix } from 'path';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('fluig-vscode-extension.newDataset', createDataset));
	context.subscriptions.push(vscode.commands.registerCommand('fluig-vscode-extension.newForm', createForm));
}

// this method is called when your extension is deactivated
export function deactivate() {}

/**
 * Cria um arquivo contendo um novo Dataset
 */
async function createDataset() {
	if (!vscode.workspace.workspaceFolders) {
		vscode.window.showInformationMessage('Você precisa estar em um diretório / workspace.');
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
	const datasetUri = workspaceFolderUri.with({ path: posix.join(workspaceFolderUri.path, 'datasets', dataset) });
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
 * @param {string[]} fields
 * @param {Constraint[]} constraints
 * @param {string[]} sorts
 * @returns {Dataset}
 */
function createDataset(fields, constraints, sorts) {
	var dataset = DatasetFactory.newDataset();

	return dataset;
}
`;
}

/**
 * Cria um novo formulário
 */
async function createForm() {
	if (!vscode.workspace.workspaceFolders) {
		vscode.window.showInformationMessage('Você precisa estar em um diretório / workspace.');
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
	const formUri = workspaceFolderUri.with({ path: posix.join(workspaceFolderUri.path, 'forms', formName, formFileName) });
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
