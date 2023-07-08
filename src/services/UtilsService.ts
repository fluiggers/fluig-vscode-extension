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

    /**
     * Confirma a senha do servidor para exportar artefatos
     */
    public static async confirmPassword(server: ServerDTO): Promise<boolean> {
        let isPasswordCorrect: boolean = true;

        do {
            const confirmPassword = await vscode.window.showInputBox({
                prompt: "Informe a senha do servidor " + server.name,
                password: true
            }) || "";

            if (!confirmPassword) {
                return false;
            } else if (confirmPassword !== server.password) {
                vscode.window.showWarningMessage(`A senha informada para o servidor "${server.name}" está incorreta!`);
                isPasswordCorrect = false;
            } else {
                isPasswordCorrect = true;
            }
        } while (!isPasswordCorrect);

        return isPasswordCorrect;
    }
}
