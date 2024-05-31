import { ExtensionContext, commands, Uri, window } from 'vscode';
import { UtilsService } from "../services/UtilsService";
import { createWriteStream } from "fs";
import { Readable } from "stream";

export class LibraryExtension {

    public static activate(context: ExtensionContext): void {
        context.subscriptions.push(commands.registerCommand(
            "fluiggers-fluig-vscode-extension.installDeclarationLibrary",
            LibraryExtension.installDeclarationLibrary
        ));
    }

    /**
     * Instala a última versão da bilioteca de tipos
     */
    private static installDeclarationLibrary() {
        const workspaceUri = UtilsService.getWorkspaceUri();

        Promise.all([
            fetch("https://raw.githubusercontent.com/fluiggers/fluig-declaration-type/master/jsconfig.json"),
            fetch("https://raw.githubusercontent.com/fluiggers/fluig-declaration-type/master/fluig.d.ts")
        ])
        .then(function ([jsConfig, fluigDeclarations]) {
            if (!jsConfig.ok || !jsConfig.body || !fluigDeclarations.ok || !fluigDeclarations.body) {
                throw new Error("Erro: Os arquivos da biblioteca de tipos não foram encontrados.");
            }

            const jsConfigWriter = createWriteStream(Uri.joinPath(workspaceUri, "jsconfig.json").fsPath);
            Readable.fromWeb(jsConfig.body).pipe(jsConfigWriter);

            const declarationsWriter = createWriteStream(Uri.joinPath(workspaceUri, "fluig.d.ts").fsPath);
            Readable.fromWeb(fluigDeclarations.body).pipe(declarationsWriter);

            window.showInformationMessage("A biblioteca de Declarações de Tipos foi instalada.");
        })
        .catch(() => window.showErrorMessage("Erro ao baixar biblioteca do GitHub. Verifique sua conexão com a Internet"));
    }
}
