import * as vscode from 'vscode';

export class UtilsService {
    public static generateRandomID() {
        return Math.random().toString(36).substring(2, 15) + Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
    }

    /**
     * Retorna o PATH do workspace
     * @returns 
     */
    public static getWorkspace() {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showInformationMessage("Você não esta em um diretório /workspace.");
            return require('os').homedir();
        }

        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
}