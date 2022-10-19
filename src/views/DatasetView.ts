import * as vscode from 'vscode';
import * as path from 'path';
import { ServerDTO } from '../models/ServerDTO';
import * as fs from 'fs';
import { Server } from '../models/Server';
import { DatasetService } from '../services/DatasetService';
const compile = require('template-literal');

export class DatasetView {

    private currentPanel: vscode.WebviewPanel | undefined = undefined;
    private server: Server;

    constructor(private context: vscode.ExtensionContext, serverDto: ServerDTO) {
        this.server = new Server(serverDto);
    }

    public async show() {
        this.currentPanel = this.createWebViewPanel();
        this.currentPanel.webview.html = await this.getWebViewContent();
        this.currentPanel.onDidDispose(
            () => this.currentPanel = undefined,
            null
        );
        this.currentPanel.webview.onDidReceiveMessage(
            obj => this.messageListener(obj),
            undefined
        );
    }

    private async getWebViewContent() {
        const htmlPath = vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'views', 'dataset', 'dataset.html'));
        const runTemplate = compile(fs.readFileSync(htmlPath.with({ scheme: 'vscode-resource' }).fsPath));

        return runTemplate({
            jquery: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'libs', 'jquery.min.js')),
            bootstrapCss: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'libs', 'bootstrap.min.css')),
            bootstrapJs: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'libs', 'bootstrap.min.js')),
            select2Css: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'libs', 'select2.min.css')),
            select2Js: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'libs', 'select2.min.js')),
            datatablesCss: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'libs', 'datatables.min.css')),
            datatablesJs: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'libs', 'datatables.min.js')),
            html5SortableJs: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'libs', 'html5sortable.min.js')),
            themeCss: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'css', 'theme.css')),
            datasetCss: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'views', 'dataset', 'dataset.css')),
            datasetJs: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'views', 'dataset', 'dataset.js')),
            serverName: this.server.name
        });
    }

    private createWebViewPanel() {
        return vscode.window.createWebviewPanel(
            "fluig-vscode-extension.consultarDataset",
            `${this.server.name}: Consultar Dataset`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri],
                retainContextWhenHidden: true
            }
        );
    }

    private messageListener(obj: any) {
        switch(obj.command) {
            case 'consult_dataset':
                this.consultDataset(obj);
                break;

            case 'load_datasets':
                this.loadDatasets();
                break;

            case 'error':
                vscode.window.showErrorMessage(obj.message);
                break;
        }
    }

    private async loadDatasets() {
        if (!this.currentPanel) {
            return;
        }

        try {
            let datasets = await DatasetService.getDatasets(this.server);
            let datasetOptions = [];

            for (let dataset of datasets) {
                datasetOptions.push({
                    id: dataset.datasetId,
                    text: dataset.datasetId
                });
            }

            this.currentPanel.webview.postMessage({
                command: 'load_datasets',
                datasets: datasetOptions
            });
        } catch (error) {
            this.showError(error);
            throw error;
        }
    }

    private async consultDataset(queryInformation: any) {
        if (!this.currentPanel || !queryInformation) {
            return;
        }

        try {
            const queryResult = await DatasetService.getResultDataset(
                this.server,
                queryInformation.datasetId,
                queryInformation.fields,
                queryInformation.constraints,
                queryInformation.order
            );

            this.currentPanel.webview.postMessage({
                command: 'query_result',
                queryResult: queryResult
            });

        } catch (error) {
            this.showError(error);
        }
    }

    private showError(error: any) {
        let message = "";

        if (typeof error === "string") {
            message = error;
        } else if (error instanceof Error) {
            message = error.message;
        }

        if (message) {
            vscode.window.showErrorMessage(message);
        }
    }
}
