import { ServerConfig } from "../models/ServerConfig";
import { ServerDTO } from "../models/ServerDTO";
import { UtilsService } from "./UtilsService";
import { window } from "vscode";

export class ServerService {
    private static PATH = UtilsService.getWorkspace() + '/.vscode';
    private static FILE_SERVER_CONFIG = ServerService.PATH + '/servers.json';

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

    public static findByName(name: string) {
        const servers = ServerService.getServerConfig();
        return servers.configurations.find(server => server.name == name);
    }

    public static async getSelect() {
        const serversConfig = ServerService.getServerConfig();
        const servers = serversConfig.configurations.map(server => ({ label: server.name }));

        const result = await window.showQuickPick(servers, {
            placeHolder: "Selecione o servidor",
        });

        if (!result) {
            return;
        }

        return ServerService.findByName(result.label);
    }

    /**
     * Retorna o caminho do arquivo Server Config
     */
    public static getFileServerConfig(): string {
        const fs = require('fs');

        if (!fs.existsSync(ServerService.FILE_SERVER_CONFIG)) {
            ServerService.createServerConfig();
        }

        return ServerService.FILE_SERVER_CONFIG;
    }

    /**
     * Cria o arquivo de configuração dos servidores
     */
    private static createServerConfig() {
        const fs = require('fs');
        const serverConfig: ServerConfig = {
            version: "0.0.1",
            permissions: undefined,
            connectedServer: undefined,
            configurations: []
        };

        if (!fs.existsSync(ServerService.PATH)) {
            fs.mkdirSync(ServerService.PATH);
        }

        fs.writeFileSync(ServerService.FILE_SERVER_CONFIG, JSON.stringify(serverConfig, null, "\t"));
    }

    /**
     * Criar / Alterar o arquivo de servidores
     */
    private static writeServerConfig(serverConfig: ServerConfig) {
        const fs = require('fs');
        fs.writeFileSync(ServerService.FILE_SERVER_CONFIG, JSON.stringify(serverConfig, null, "\t"));
    }

    /**
     * Leitura do arquivo Server Config
     */
    public static getServerConfig(): ServerConfig {
        const fs = require('fs');
        if (!fs.existsSync(ServerService.FILE_SERVER_CONFIG)) {
            ServerService.createServerConfig();
        }

        const serverConfig = fs.readFileSync(ServerService.FILE_SERVER_CONFIG).toString();
        return JSON.parse(serverConfig);
    }
}
