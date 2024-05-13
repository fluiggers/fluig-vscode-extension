import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { window, Uri, QuickPickItem } from "vscode";
import { UtilsService } from "./UtilsService";
import { ServerConfig } from "../models/ServerConfig";
import { ServerDTO } from "../models/ServerDTO";
import { Server } from "../models/Server";

export class ServerService {
    private static PATH = Uri.joinPath(UtilsService.getWorkspaceUri(), '.vscode').fsPath;
    private static FILE_SERVER_CONFIG = Uri.joinPath(UtilsService.getWorkspaceUri(), '.vscode', 'servers.json').fsPath;
    private static SELECTED_SERVER: string = "";

    /**
     * Adiciona um novo servidor
     */
    public static create(server: ServerDTO) {
        const serverConfig = ServerService.getServerConfig();

        if (!serverConfig.configurations) {
            return null;
        }

        server.id = UtilsService.generateRandomID();
        serverConfig.configurations.push(server);
        ServerService.writeServerConfig(serverConfig);

        return server;
    }

    /**
     * Remover um servidor
     */
    public static delete(id: string) {
        const serverConfig = ServerService.getServerConfig();

        if (!serverConfig.configurations) {
            return;
        }

        const servers = serverConfig.configurations;
        servers.forEach((element: ServerDTO) => {
            if (element.id === id) {
                const index = servers.indexOf(element, 0);
                servers.splice(index, 1);
                ServerService.writeServerConfig(serverConfig);
                return;
            }
        });
    }

    /**
     * Atualizar dados do servidor
     */
    public static update(server: ServerDTO) {
        const serverConfig = ServerService.getServerConfig();

        if (!serverConfig.configurations) {
            return;
        }

        const servers = serverConfig.configurations;
        servers.forEach((element: ServerDTO) => {
            if (element.id === server.id) {
                const index = servers.indexOf(element, 0);
                servers.splice(index, 1);
                servers.push(server);
                ServerService.writeServerConfig(serverConfig);
                return;
            }
        });
    }

    public static createOrUpdate(server: ServerDTO) {
        if (server.id) {
            this.update(server);
        } else {
            this.create(server);
        }
    }

    public static findByName(name: string): ServerDTO|undefined {
        const servers = ServerService.getServerConfig();
        return servers.configurations.find(server => server.name == name);
    }

    public static findById(id: string): ServerDTO|undefined {
        const servers = ServerService.getServerConfig();
        return servers.configurations.find(server => server.id == id);
    }

    public static async getSelect() {
        const servers = ServerService.getServersLabels();

        const result = await window.showQuickPick(servers, {
            placeHolder: "Selecione o servidor",
        });

        if (!result) {
            return;
        }

        ServerService.SELECTED_SERVER = result.label;

        return new Server(ServerService.findByName(result.label));
    }

    private static getServersLabels() {
        const serversConfig = ServerService.getServerConfig();
        const serversLabels: QuickPickItem[] = [];
        let hasSelectedServer = false;

        for (let i = 0; i < serversConfig.configurations.length; ++i) {
            const serverName = serversConfig.configurations[i].name;

            if (serverName === ServerService.SELECTED_SERVER) {
                hasSelectedServer = true;
                continue;
            }
            serversLabels.push({ label: serverName });
        }

        if (hasSelectedServer) {
            serversLabels.unshift({ label: ServerService.SELECTED_SERVER});
        }

        return serversLabels;
    }

    /**
     * Retorna o caminho do arquivo Server Config
     */
    public static getFileServerConfig(): string {
        if (!existsSync(ServerService.FILE_SERVER_CONFIG)) {
            ServerService.createServerConfig();
        }

        return ServerService.FILE_SERVER_CONFIG;
    }

    /**
     * Cria o arquivo de configuração dos servidores
     */
    private static createServerConfig() {
        const serverConfig: ServerConfig = {
            version: "1.0.0",
            configurations: []
        };

        if (!existsSync(ServerService.PATH)) {
            mkdirSync(ServerService.PATH);
        }

        writeFileSync(ServerService.FILE_SERVER_CONFIG, JSON.stringify(serverConfig, null, "\t"));
    }

    /**
     * Criar / Alterar o arquivo de servidores
     */
    private static writeServerConfig(serverConfig: ServerConfig) {
        writeFileSync(ServerService.FILE_SERVER_CONFIG, JSON.stringify(serverConfig, null, "\t"));
    }

    /**
     * Leitura do arquivo Server Config
     */
    public static getServerConfig(): ServerConfig {
        if (!existsSync(ServerService.FILE_SERVER_CONFIG)) {
            ServerService.createServerConfig();
        }

        return JSON.parse(readFileSync(ServerService.FILE_SERVER_CONFIG).toString());
    }
}
