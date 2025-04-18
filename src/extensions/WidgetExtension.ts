import { ExtensionContext, commands, Uri, window } from 'vscode';
import { WidgetService } from "../services/WidgetService";

export class WidgetExtension {
    public static activate(context: ExtensionContext): void {
        context.subscriptions.push(commands.registerCommand(
            "fluiggers-fluig-vscode-extension.newWidget",
            WidgetService.create
        ));

        context.subscriptions.push(commands.registerCommand(
            "fluiggers-fluig-vscode-extension.exportWidget",
            function (fileUri: Uri) {
                // Ativado pela Tecla Atalho
                if (!fileUri) {
                    if (!window.activeTextEditor) {
                        window.showErrorMessage("Não há editor de texto ativo na Widget");
                        return;
                    }
                    fileUri = window.activeTextEditor.document.uri;
                }

                WidgetService.export(fileUri);
            }
        ));

        context.subscriptions.push(commands.registerCommand(
            "fluiggers-fluig-vscode-extension.importWidget",
            WidgetService.import
        ));

        context.subscriptions.push(commands.registerCommand(
            "fluiggers-fluig-vscode-extension.exportFluiggersWidget",
            WidgetService.exportFluiggersWidget
        ));
    }
}
