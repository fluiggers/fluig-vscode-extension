import * as vscode from 'vscode';
import { ServerDTO } from '../models/ServerDTO';
import * as path from 'path';
import { ServerService } from '../services/ServerService';
import * as fs from 'fs';
import { ServerView } from '../views/ServerView';
import { Server } from '../models/Server';
import { DatasetView } from '../views/DatasetView';


export class ServerItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public server: ServerDTO
    ) {
        super(label, collapsibleState);
    }

    iconPath = {
        light: path.join(__filename, '..', '..', 'dist', 'assets', 'images', 'light', 'server-environment.svg'),
        dark: path.join(__filename, '..', '..', 'dist', 'assets', 'images', 'dark', 'server-environment.svg')
    };

    contextValue = 'serverItem';
}

export class DatasetItem extends ServerItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public server: ServerDTO
    ) {
        super(label, collapsibleState, server);
    }

    iconPath = {
        light: path.join(__filename, '..', '..', 'dist', 'assets', 'images', 'light', 'database.svg'),
        dark: path.join(__filename, '..', '..', 'dist', 'assets', 'images', 'dark', 'database.svg')
    };

    contextValue = 'DatasetItem';
}

export class ServerItemProvider implements vscode.TreeDataProvider<ServerItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<ServerItem | undefined | void> = new vscode.EventEmitter<ServerItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ServerItem | undefined | void> = this._onDidChangeTreeData.event;

    public serverItems: Array<ServerItem> = [];

    constructor(public context: vscode.ExtensionContext) {
        this.serverConfigListener();
    }

    public getTreeItem(element: ServerItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: ServerItem): vscode.ProviderResult<ServerItem[]> {
        if (element) {
            return Promise.resolve([
                new DatasetItem("Dataset", vscode.TreeItemCollapsibleState.None, element.server),
            ]);
        } else {
            return Promise.resolve(this.serverItems);
        }
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public add(): void {
        const serverView = new ServerView(this.context);
        serverView.show();
    }

    public delete(serverItem: ServerItem): void {
        vscode.window.showInformationMessage(`Deseja excluir o servidor ${serverItem.server.name}?`, "Sim", "Não")
            .then(selection => {
                if (selection == "Sim") {
                    const index = this.serverItems.indexOf(serverItem);

                    if (index < 0 || serverItem.server.id == undefined) {
                        return;
                    }

                    ServerService.delete(serverItem.server.id);
                }
            });
    }

    public update(serverItem: ServerItem): void {
        const serverView = new ServerView(this.context);
        serverView.setServerData(new Server(serverItem.server));
        serverView.show();
    }

    public datasetView(datasetItem: DatasetItem): void {
        const datasetView = new DatasetView(this.context, datasetItem.server);
        datasetView.show();
    }

    private getServers(): ServerItem[] {
        const serverConfig = ServerService.getServerConfig();
        const listServer = new Array<ServerItem>();

        serverConfig.configurations.forEach((element: ServerDTO) => {
            const serverItem = new ServerItem(
                element.name,
                vscode.TreeItemCollapsibleState.Collapsed,
                element
            );

            listServer.push(serverItem);
        });

        return listServer.sort((srv1, srv2) => {
            const label1 = srv1.label.toLowerCase();
            const label2 = srv2.label.toLowerCase();
            if (label1 > label2) { return 1; }
            if (label1 < label2) { return -1; }
            return 0;
        });
    }

    private serverConfigListener(): void {
        const fileServer = ServerService.getFileServerConfig();

        this.serverItems = this.getServers();
        fs.watch(fileServer, { encoding: 'buffer' }, (eventType, filename) => {
            if (filename && eventType === 'change') {
                this.serverItems = this.getServers();
                this.refresh();
            }
        });
    }
}
