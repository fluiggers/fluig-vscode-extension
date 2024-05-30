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
     * Pega a URL para um serviço REST já com usuário e senha do servidor
     *
     * @param server Servidor selecionado
     * @param basePath Caminho base do recurso REST (ex: /ecm/api/rest/ecm/dataset/)
     * @param resource Recurso solicitado (ex: loadDataset)
     * @param params Objeto com parâmetros adicionais para inserir na Url
     */
    public static getRestUrl(server: ServerDTO, basePath: string, resource: string, params?: {[s: string]: string}): URL {
        const url = new URL(`${UtilsService.getHost(server)}${basePath}${resource}`);
        url.searchParams.append("username", server.username);
        url.searchParams.append("password", server.password);

        if (!params) {
            return url;
        }

        for (const [key, value] of Object.entries(params)) {
            url.searchParams.append(key, value);
        }

        return url;
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
