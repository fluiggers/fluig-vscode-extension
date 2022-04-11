import * as vscode from 'vscode';
import { ServerDTO } from '../models/ServerDTO';
import * as path from 'path';
import { ServerService } from '../services/ServerService';
import * as fs from 'fs';
import { ServerView } from '../views/ServerView';
import { Server } from '../models/Server';
import { DatasetView } from '../views/DatasetView';

export class DatasetItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public server: ServerDTO
    ) {
        super(label, collapsibleState);
    }

    iconPath = {
        light: path.join(__filename, '..', '..', 'resources', 'images', 'light', 'server.svg'),
        dark: path.join(__filename, '..', '..', 'resources', 'images', 'dark', 'server.svg')
    };

    contextValue = 'serverItem';
}

export class DatasetItemProvider implements vscode.TreeDataProvider<DatasetItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<DatasetItem | undefined | void> = new vscode.EventEmitter<DatasetItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<DatasetItem | undefined | void> = this._onDidChangeTreeData.event;

    public serverItems: Array<DatasetItem> = [];

    constructor(public context: vscode.ExtensionContext) {
        this.serverConfigListener();
    }

    public getTreeItem(element: DatasetItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    public getChildren(element?: DatasetItem): vscode.ProviderResult<DatasetItem[]> {
        return Promise.resolve(this.serverItems.sort((srv1, srv2) => {
            const label1 = srv1.label.toLowerCase();
            const label2 = srv2.label.toLowerCase();
            if (label1 > label2) { return 1; }
            if (label1 < label2) { return -1; }
            return 0;
        }));
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public add(): void {
        const datasetView = new DatasetView(this.context);
        datasetView.show();
    }

    public delete(serverItem: DatasetItem): void {
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

    public update(serverItem: DatasetItem): void {
        const serverView = new ServerView(this.context);
        serverView.setServerData(new Server(serverItem.server));
        serverView.show();
    }

    private getServers(): DatasetItem[] {
        const serverConfig = ServerService.getServerConfig();
        const listServer = new Array<DatasetItem>();

        serverConfig.configurations.forEach((element: ServerDTO) => {
            const serverItem = new DatasetItem(
                element.name,
                vscode.TreeItemCollapsibleState.None,
                element
            );

            listServer.push(serverItem);
        });

        return listServer;
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
