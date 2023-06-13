import * as vscode from 'vscode';
import { ServerDTO } from '../models/ServerDTO';

export class UtilsService {
    public static generateRandomID() {
        return Math.random().toString(36).substring(2, 15) + Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
    }

    /**
     * Retorna o PATH do workspace
     */
    public static getWorkspaceUri(): vscode.Uri {
        if (!vscode.workspace.workspaceFolders) {
            throw "É necessário estar em Workspace / Diretório.";
        }
        return vscode.workspace.workspaceFolders[0].uri;
    }

    public static getHost(server: ServerDTO): string {
        const schema: string = server.ssl ? "https" : "http";
        const port: string = [80, 443].includes(server.port) ? "" : `:${server.port}`;

        return `${schema}://${server.host}${port}`;
    }
}
