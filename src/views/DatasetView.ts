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

    constructor(public context: vscode.ExtensionContext, serverDto: ServerDTO) {
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
        let datasets = null;

        try {
            datasets = await DatasetService.getDatasets(this.server);
        } catch (error) {
            this.showError(error);
            throw error;
        }

        const jqueryPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'js', 'jquery.min.js'));
        const bootstrapCssPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'css', 'bootstrap.min.css'));
        const select2CssPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'css', 'select2.min.css'));
        const select2JsPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'js', 'select2.min.js'));
        const bootstrapJsPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'js', 'bootstrap.min.js'));
        const datatablesCssPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'css', 'datatables.min.css'));
        const datatablesJsPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'js', 'datatables.min.js'));
        const htmlPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'views', 'dataset', 'dataset.html'));

        const jqueryContent = fs.readFileSync(jqueryPath.with({ scheme: 'vscode-resource' }).fsPath);
        const bootstrapCssContent = fs.readFileSync(bootstrapCssPath.with({ scheme: 'vscode-resource' }).fsPath);
        const bootstrapJsContent = fs.readFileSync(bootstrapJsPath.with({ scheme: 'vscode-resource' }).fsPath);
        const datatablesCssContent = fs.readFileSync(datatablesCssPath.with({ scheme: 'vscode-resource' }).fsPath);
        const datatablesJsContent = fs.readFileSync(datatablesJsPath.with({ scheme: 'vscode-resource' }).fsPath);
        const select2CssContent = fs.readFileSync(select2CssPath.with({ scheme: 'vscode-resource' }).fsPath);
        const select2JsContent = fs.readFileSync(select2JsPath.with({ scheme: 'vscode-resource' }).fsPath);
        const htmlContent = fs.readFileSync(htmlPath.with({ scheme: 'vscode-resource' }).fsPath);

        let runTemplate = compile(htmlContent);

        datasets = await DatasetService.getDatasets(this.server);
        let datasetOptions = ``;

        for (let dataset of datasets) {
            datasetOptions += `<option value="${dataset.datasetId}">${dataset.datasetId}</option>`;
        }

        return runTemplate({
            jquery: jqueryContent,
            bootstrapCss: bootstrapCssContent,
            bootstrapJs: bootstrapJsContent,
            select2Css: select2CssContent,
            select2Js: select2JsContent,
            datatablesCss: datatablesCssContent,
            datatablesJs: datatablesJsContent,
            datasets: datasetOptions,
            serverName: this.server.name,
        });
    }

    private createWebViewPanel() {
        const file = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'views', 'dataset'));

        return vscode.window.createWebviewPanel(
            "fluig-vscode-extension.consultarDataset",
            `${this.server.name}: Consultar Dataset`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [file],
                retainContextWhenHidden: true
            }
        );
    }

    private messageListener(obj: any) {
        switch(obj.command) {
            case 'consult_dataset':
                this.consultDataset(obj);
                break;

            case 'error':
                vscode.window.showErrorMessage(obj.message);
                break;
        }
    }

    private async consultDataset(queryInformation: any) {
        if (!this.currentPanel || !queryInformation) {
            return;
        }

        try {
            const queryResult = await DatasetService.getResultDataset(this.server, queryInformation.datasetId, null, queryInformation.constraints, null);

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
