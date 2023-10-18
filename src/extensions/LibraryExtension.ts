import * as vscode from 'vscode';
import {UtilsService} from "../services/UtilsService";
import axios, {AxiosRequestConfig} from "axios";
import {createWriteStream} from "fs";

export class LibraryExtension {

    public static activate(context: vscode.ExtensionContext): void {
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.installDeclarationLibrary",
            LibraryExtension.installDeclarationLibrary
        ));
    }

    /**
     * Instala a última versão da bilioteca de tipos
     */
    private static installDeclarationLibrary() {
        const workspaceUri = UtilsService.getWorkspaceUri();

        const axiosConfig: AxiosRequestConfig = {
            responseType: "stream"
        };

        Promise.all([
            axios.get(
                "https://raw.githubusercontent.com/fluiggers/fluig-declaration-type/master/jsconfig.json",
                axiosConfig
            ),
            axios.get(
                "https://raw.githubusercontent.com/fluiggers/fluig-declaration-type/master/fluig.d.ts",
                axiosConfig
            )
        ])
            .then(function ([jsConfig, fluigDeclarations]) {
                jsConfig.data.pipe(createWriteStream(vscode.Uri.joinPath(workspaceUri, "jsconfig.json").fsPath));
                fluigDeclarations.data.pipe(createWriteStream(vscode.Uri.joinPath(workspaceUri, "fluig.d.ts").fsPath));
            })
            .catch(() => vscode.window.showErrorMessage("Erro ao baixar biblioteca do GitHub. Verifique sua conexão com a Internet"));
    }
}
