import * as vscode from 'vscode';
import * as path from 'path';
import { ServerDTO } from '../models/ServerDTO';
import { ServerService } from '../services/ServerService';
import * as fs from 'fs';
import { UserService } from '../services/UserService';
const compile = require('template-literal');

export class ServerView {

    private currentPanel: vscode.WebviewPanel | undefined = undefined;
    private serverData: ServerDTO | undefined = undefined;

    constructor(public context: vscode.ExtensionContext) {}

    public setServerData(server: ServerDTO) {
        this.serverData = server;
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
        const htmlPath = vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'resources', 'views', 'server', 'server.html'));
        const cssPath = vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'resources', 'css', 'bootstrap.min.css'));
        const htmlContent = fs.readFileSync(htmlPath.with({ scheme: 'vscode-resource' }).fsPath);
        const cssContent = fs.readFileSync(cssPath.with({ scheme: 'vscode-resource' }).fsPath);
        let runTemplate = compile(htmlContent);

        return runTemplate({
            css: cssContent,
            serverData: this.serverData
        });
    }

    private createWebViewPanel() {
        const file = vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'resources', 'views', 'server'));
        return vscode.window.createWebviewPanel(
            "fluig-vscode-extension.addServer",
            "Adicionar Servidor",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [file],
                retainContextWhenHidden: true
            }
        );
    }

    private messageListener(obj: any) {
        if(obj.name && obj.host && obj.port && 
            obj.username && obj.password) {
                const server = {
                    id: '',
                    name: obj.name,
                    host: obj.host,
                    ssl: obj.ssl,
                    port: obj.port,
                    username: obj.username,
                    password: obj.password,
                    confirmExporting: obj.confirmExporting
                };

                UserService.getUser(server).then((response) => {
                    ServerService.create(server);

                    if (this.currentPanel) {
                        this.currentPanel.dispose();
                    }
                }).catch(() => {
                    vscode.window.showErrorMessage(`Falha na conexão com o servidor ${server.name}`);
                });
        }
    }
}