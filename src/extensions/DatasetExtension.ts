import * as vscode from 'vscode';
import {readFileSync} from "fs";
import {DatasetService} from "../services/DatasetService";
import {UtilsService} from "../services/UtilsService";
import {TemplateService} from "../services/TemplateService";
import {ServerService} from "../services/ServerService";
import {DatasetView} from "../views/DatasetView";

export class DatasetExtension {

    public static activate(context: vscode.ExtensionContext): void {
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.newDataset",
            DatasetExtension.createDataset
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.importManyDataset",
            DatasetService.importMany
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.importDataset",
            DatasetService.import
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.exportDataset",
            DatasetExtension.exportDataset
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.searchDataset",
            DatasetExtension.searchDataset(context)
        ));
    }

    /**
     * Cria um Dataset
     */
    private static async createDataset() {
        let dataset: string = await vscode.window.showInputBox({
            prompt: "Qual o nome do Dataset (sem espaços e sem caracteres especiais)?",
            placeHolder: "ds_nome_dataset"
        }) || "";

        if (!dataset) {
            return;
        }

        if (!dataset.endsWith(".js")) {
            dataset += ".js";
        }

        const datasetUri = vscode.Uri.joinPath(UtilsService.getWorkspaceUri(), "datasets", dataset);

        try {
            // Se Dataset já existe carrega o arquivo no editor
            await vscode.workspace.fs.stat(datasetUri);
            return vscode.window.showTextDocument(datasetUri);
        } catch (err) {

        }

        await vscode.workspace.fs.writeFile(
            datasetUri,
            readFileSync(vscode.Uri.joinPath(TemplateService.templatesUri, 'createDataset.txt').fsPath)
        );
        vscode.window.showTextDocument(datasetUri);
    }

    private static exportDataset(fileUri: vscode.Uri) {
        // Ativado pela Tecla de Atalho
        if (!fileUri) {
            if (!vscode.window.activeTextEditor) {
                vscode.window.showErrorMessage("Não há editor de texto ativo com Dataset");
                return;
            }
            fileUri = vscode.window.activeTextEditor.document.uri;
        }

        DatasetService.export(fileUri);
    }

    /**
     * Realiza a importação de um dataset específico
     */
    private static searchDataset(context: vscode.ExtensionContext) {
        return async function() {
            const server = await ServerService.getSelect();
            if (!server) {
                return;
            }
            new DatasetView(context, server).show();
        };
    }
}
