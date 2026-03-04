import * as vscode from 'vscode';
import {ServerDTO} from '../models/ServerDTO';
import {ServerService} from '../services/ServerService';
import * as fs from 'fs';
import {UserService} from '../services/UserService';
import {Server} from '../models/Server';
import { LoginService } from '../services/LoginService';

const compile = require('template-literal');

export class ServerView {

    private currentPanel: vscode.WebviewPanel | undefined = undefined;
    private serverData: ServerDTO | undefined = undefined;

    constructor(private context: vscode.ExtensionContext) {}

    public setServerData(server: ServerDTO) {
        this.serverData = server;
    }

    public show() {
        this.currentPanel = this.createWebViewPanel();
        this.currentPanel.webview.html = this.getWebViewContent();
        this.currentPanel.onDidDispose(
            () => this.currentPanel = undefined,
            null
        );
        this.currentPanel.webview.onDidReceiveMessage(
            obj => this.messageListener(obj),
            undefined
        );
    }

    private getWebViewContent() {
        const htmlPath = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'views', 'server', 'server.html');
        const runTemplate = compile(fs.readFileSync(htmlPath.with({scheme: 'vscode-resource'}).fsPath));

        return runTemplate({
            jquery: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'libs', 'jquery.min.js')),
            bootstrapCss: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'libs', 'bootstrap.min.css')),
            themeCss: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'css', 'theme.css')),
            serverJs: this.currentPanel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'views', 'server', 'server.js')),
            serverData: this.serverData,
            ssl: (this.serverData && this.serverData.ssl) ? this.serverData.ssl : false,
            confirmExporting: (this.serverData && this.serverData.confirmExporting) ? this.serverData.confirmExporting : false
        });
    }

    private createWebViewPanel() {
        return vscode.window.createWebviewPanel(
            "fluig-vscode-extension.addServer",
            this.serverData !== undefined ? "Editar Servidor" : "Adicionar Servidor",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri],
                retainContextWhenHidden: true
            }
        );
    }

    private messageListener(obj: any) {
        if (obj.hasBrowser && !obj.companyId) {
            return;
        }
        if (!obj.hasBrowser && (!obj.username || !obj.password)) {
            return;
        }
        if (!obj.name || !obj.host || !obj.port) {
            return;
        }
        if (!this.currentPanel || !this.currentPanel.webview) {
            return;
        }

        const webview = this.currentPanel.webview;

        const server: ServerDTO = new Server();
        server.id = obj.id;
        server.name = obj.name;
        server.host = obj.host;
        server.ssl = obj.ssl;
        server.port = parseInt(obj.port);
        server.userCode = "";
        server.hasBrowser = obj.hasBrowser;
        server.companyId = obj.hasBrowser ? obj.companyId : '';
        server.username = !obj.hasBrowser ? obj.username : '';
        server.password = !obj.hasBrowser ? obj.password : '';
        server.confirmExporting = !obj.hasBrowser && obj.confirmExporting;

        UserService.getUser(server).then((response:any) => {
            if (!response.content) {
                throw response.message?.message;
            }
            if (server.companyId != response.content.tenantId) {
                LoginService.clearCookies(server);
                throw new Error("O servidor retornou um Código da empresa diferente do Código informado.");
            }

            server.companyId = response.content.tenantId;

            server.userCode = response.content.userCode;

            ServerService.createOrUpdate(server);

            if (this.currentPanel) {
                this.currentPanel.dispose();
            }
        }).catch((e) => {
            webview.postMessage({
                command: 'error',
                message: e.message || e
            });

            vscode.window.showErrorMessage(`Falha na conexão com o servidor ${server.name}.\nErro retornado: ${e.message || e}`);
        });
    }
}
