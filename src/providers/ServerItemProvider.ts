import * as vscode from 'vscode';
import { ServerDTO } from '../models/ServerDTO';
import * as path from 'path';
import { ServerService } from '../services/ServerService';
import * as fs from 'fs';
import { ServerView } from '../views/ServerView';

export class ServerItem extends vscode.TreeItem {
    constructor(
      public readonly label: string,
      public readonly collapsibleState: vscode.TreeItemCollapsibleState,
      public server: ServerDTO
    ) {
      super(label, collapsibleState);
    }
  
    iconPath = {
      light: path.join(__filename, '..', '..','src', 'resources', 'images', 'light', 'server.svg'),
      dark: path.join(__filename, '..', '..','src', 'resources', 'images', 'dark', 'server.svg')
    };
  
    contextValue = 'serverItem';
  }

export class ServerItemProvider implements vscode.TreeDataProvider<ServerItem> {
    
    private _onDidChangeTreeData: vscode.EventEmitter<ServerItem | undefined | void> = new vscode.EventEmitter<ServerItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ServerItem | undefined | void> = this._onDidChangeTreeData.event;

    public serverItems: Array<ServerItem> = [];

    constructor(public context: vscode.ExtensionContext) {
        this.serverConfigListener();    
    }

    public getTreeItem(element: ServerItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    public getChildren(element?: ServerItem): vscode.ProviderResult<ServerItem[]> {
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

    public add() {
        const serverView = new ServerView(this.context);
        serverView.show();
    }

    private getServers() {
        const serverConfig = ServerService.getServerConfig();
        const listServer = new Array<ServerItem>();

        serverConfig.configurations.forEach((element: ServerDTO) => {
            const serverItem = new ServerItem(
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