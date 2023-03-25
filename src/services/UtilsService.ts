import * as vscode from 'vscode';
import { ServerDTO } from '../models/ServerDTO';

export class UtilsService {
    public static generateRandomID() {
        return Math.random().toString(36).substring(2, 15) + Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
    }

    /**
     * Retorna o PATH do workspace
     */
    public static getWorkspace(): vscode.Uri {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showInformationMessage("Você não esta em um diretório / workspace.");

            throw "Obrigatório estar em um diretório / workspace";
        }

        return vscode.workspace.workspaceFolders[0].uri;
    }

    public static getHost(server: ServerDTO): string {
        const schema: string = server.ssl ? "https" : "http";
        const port: string = [80, 443].includes(server.port) ? "" : `:${server.port}`;

        return `${schema}://${server.host}${port}`;
    }
}
