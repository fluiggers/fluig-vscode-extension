import { ServerConfig } from "../models/ServerConfig";
import { ServerDTO } from "../models/ServerDTO";
import { UtilsService } from "./UtilsService";

const homedir = require('os').homedir();

export class ServerService {
    private static PATH = homedir + '/.vscode';
    private static PATH_FLUIG = ServerService.PATH + '/fluig';
    private static FILE_SERVER_CONFIG = ServerService.PATH_FLUIG + '/servers.json'; 

    /**
     * Adiciona um novo servidor
     * @param server 
     * @returns 
     */
    public static create(server: ServerDTO) {
        const serverConfig = ServerService.getServerConfig();

        if(!serverConfig.configurations) {
            return null;
        }

        server.id = UtilsService.generateRandomID();
        serverConfig.configurations.push(server);
        ServerService.writeServerConfig(serverConfig);

        return server;
    }

    /**
     * Retorna o caminho do arquivo Server Config
     * @returns 
     */
    public static getFileServerConfig() {
        const fs = require('fs');

        if(!fs.existsSync(ServerService.FILE_SERVER_CONFIG)) {
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

        if(!fs.existsSync(ServerService.PATH_FLUIG)) {
            fs.mkdirSync(ServerService.PATH_FLUIG);
        }

        fs.writeFileSync(ServerService.FILE_SERVER_CONFIG, JSON.stringify(serverConfig, null, "\t"));
    }

    /**
     * Criar/Alterar o arquivo de servidores
     * @param serverConfig 
     */
    private static writeServerConfig(serverConfig: ServerConfig) {
        const fs = require('fs');
        fs.writeFileSync(ServerService.FILE_SERVER_CONFIG, JSON.stringify(serverConfig, null, "\t"));
    }

    /**
     * Leitura do arquivo Server Config
     * @returns 
     */
    public static getServerConfig(): ServerConfig {
        const fs = require('fs');
        if(!fs.existsSync(ServerService.FILE_SERVER_CONFIG)) {
            ServerService.createServerConfig();
        }

        const serverConfig = fs.readFileSync(ServerService.FILE_SERVER_CONFIG).toString();
        return  JSON.parse(serverConfig);
    }
}