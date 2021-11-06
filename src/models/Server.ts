import * as vscode from "vscode";
import { ServerDTO } from "./ServerDTO";
import * as CryptoJS from 'crypto-js';

/**
 * Configuração do Servidor com criptografia da senha
 */
export class Server implements ServerDTO {
    public id: string = "";
    public name: string = "";
    public host: string = "";
    public ssl: boolean = false;
    public port: number = 80;
    public confirmExporting: boolean = false;
    public companyId: number = 0;
    public userCode: string = "";
    public username: string = "";
    private _password: string = "";
    private decryptedPassword: string = "";

    get password(): string {
        if (!this.decryptedPassword) {
            this.decryptedPassword = CryptoJS.AES.decrypt(this._password, vscode.env.machineId).toString(CryptoJS.enc.Utf8);
        }

        return this.decryptedPassword;
    }

    set password(password: string) {
        this._password = CryptoJS.AES.encrypt(password, vscode.env.machineId).toString();
    }

    constructor(server?: ServerDTO) {
        this.id = server?.id || "";
        this.name = server?.name || "";
        this.host = server?.host || "";
        this.ssl = server?.ssl || false;
        this.port = server?.port || 0;
        this.username = server?.username || "";
        this._password = server?.password || "";
        this.userCode = server?.userCode || "";
        this.confirmExporting = server?.confirmExporting || false;
        this.companyId = server?.companyId || 0;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            host: this.host,
            ssl: this.ssl,
            port: this.port,
            username: this.username,
            password: this._password,
            userCode: this.userCode,
            confirmExporting: this.confirmExporting,
            companyId: this.companyId,
        };
    }
}
