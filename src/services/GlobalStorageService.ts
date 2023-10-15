import * as vscode from "vscode";
import { ServerDTO } from "../models/ServerDTO";

export class GlobalStorageService {

    static getLastParentDocumentId(context: vscode.ExtensionContext, server: ServerDTO): string {
        return context.globalState.get(server.id + "_lastParentDocumentId") || "2";
    }

    static updateLastParentDocumentId(context: vscode.ExtensionContext, server: ServerDTO, newValue: string) {
        context.globalState.update(server.id + "_lastParentDocumentId", newValue);
    }
}
