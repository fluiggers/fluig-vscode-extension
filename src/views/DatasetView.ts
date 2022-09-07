import * as vscode from 'vscode';
import * as path from 'path';
import { ServerDTO } from '../models/ServerDTO';
import { ServerService } from '../services/ServerService';
import * as fs from 'fs';
import { UserService } from '../services/UserService';
import { Server } from '../models/Server';
import { DatasetService } from '../services/DatasetService';
const compile = require('template-literal');

export class DatasetView {

    private currentPanel: vscode.WebviewPanel | undefined = undefined;
    private servers;

    constructor(public context: vscode.ExtensionContext) {
        this.servers = ServerService.getServerConfig();
    }

    public show() {
        this.currentPanel = this.createWebViewPanel();
        this.currentPanel.webview.html = this.getWebViewContent();
        this.currentPanel.onDidDispose(
            () => {
                this.currentPanel = undefined;
            },
            null
        );
        this.currentPanel.webview.onDidReceiveMessage(
            obj => this.messageListener(obj),
            undefined
        );
    }

    private getWebViewContent() {
        const jqueryPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'js', 'jquery.min.js'));
        const bootstrapCssPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'css', 'bootstrap.min.css'));
        const bootstrapJsPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'js', 'bootstrap.min.js'));
        const datatablesCssPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'css', 'datatables.min.css'));
        const datatablesJsPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'js', 'datatables.min.js'));
        const htmlPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'views', 'dataset', 'dataset.html'));
        const jqueryContent = fs.readFileSync(jqueryPath.with({ scheme: 'vscode-resource' }).fsPath);
        const bootstrapCssContent = fs.readFileSync(bootstrapCssPath.with({ scheme: 'vscode-resource' }).fsPath);
        const bootstrapJsContent = fs.readFileSync(bootstrapJsPath.with({ scheme: 'vscode-resource' }).fsPath);
        const datatablesCssContent = fs.readFileSync(datatablesCssPath.with({ scheme: 'vscode-resource' }).fsPath);
        const datatablesJsContent = fs.readFileSync(datatablesJsPath.with({ scheme: 'vscode-resource' }).fsPath);
        const htmlContent = fs.readFileSync(htmlPath.with({ scheme: 'vscode-resource' }).fsPath);

        let runTemplate = compile(htmlContent);

        let serverOptions = ``;
        if(this.servers && this.servers.configurations) {
            for(let server of this.servers.configurations) {
                serverOptions += `<option value="${server.id}">${server.name}</option>`;
            }
        }

        return runTemplate({
            jquery: jqueryContent,
            bootstrapCss: bootstrapCssContent,
            bootstrapJs: bootstrapJsContent,
            datatablesCss: datatablesCssContent,
            datatablesJs: datatablesJsContent,
            servidores: serverOptions
        });
    }

    private createWebViewPanel() {
        const file = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'views', 'dataset'));

        return vscode.window.createWebviewPanel(
            "fluig-vscode-extension.consultarDataset",
            "Consultar dataset",
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
            case 'list_dataset':
                this.getlistDataset(obj.serverId);
                break;
            case 'consult_dataset':
                this.consultDataset(obj);
                break;
        }
    }

    private async getlistDataset(serverId: string) {
        if(!this.currentPanel) return;

        const server:ServerDTO | undefined = ServerService.findById(serverId);
        if(!server) return;

        const serverObj = new Server(server)
        const listDataset = await DatasetService.getDatasets(serverObj);

        this.currentPanel.webview.postMessage({
            command: 'list_dataset',
            listDataset: listDataset
        });
    }

    private async consultDataset(queryInformation: any) {
        if(!this.currentPanel || !queryInformation || !queryInformation.serverId) return;

        const server:ServerDTO | undefined = ServerService.findById(queryInformation.serverId);
        if(!server) return;

        const serverObj = new Server(server);
        const queryResult = await DatasetService.getResultDataset(serverObj, queryInformation.datasetId, null, queryInformation.constraints, null);



        this.currentPanel.webview.postMessage({
            command: 'query_result',
            queryResult: queryResult
        });
    }
}
