import * as vscode from 'vscode';
import {DatasetItem, ServerItem, ServerItemProvider} from "../providers/ServerItemProvider";

export class ServerExtension {

    public static activate(context: vscode.ExtensionContext): void {
        const serverItemProvider = new ServerItemProvider(context);
        vscode.window.registerTreeDataProvider("fluiggers-fluig-vscode-extension.servers", serverItemProvider);

        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.addServer",
            () => serverItemProvider.add()
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.refreshServer",
            () => serverItemProvider.refresh()
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.editServer",
            (serverItem: ServerItem) => serverItemProvider.update(serverItem)
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.deleteServer",
            (serverItem: ServerItem) => serverItemProvider.delete(serverItem)
        ));
        context.subscriptions.push(vscode.commands.registerCommand(
            "fluiggers-fluig-vscode-extension.datasetView",
            (datasetItem: DatasetItem) => serverItemProvider.datasetView(datasetItem)
        ));
    }
}
