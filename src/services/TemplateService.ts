import * as vscode from 'vscode';
import { globSync } from "glob";
import { basename } from "path";

export class TemplateService {

    public static templatesUri: vscode.Uri;
    public static formEventsUri: vscode.Uri;
    public static workflowEventsUri: vscode.Uri;
    public static globalEventsUri: vscode.Uri;

    public static formEventsNames: string[];
    public static workflowEventsNames: string[];
    public static globalEventsNames: string[];

    /**
     * Pega o nome dos templates de determinado diretório
     *
     * @param templatesUri Diretório onde estão os templates
     * @returns Nome dos arquivos sem a extensão
     */
    static getTemplatesNameFromPath(templatesUri: vscode.Uri): string[] {
        return globSync(vscode.Uri.joinPath(templatesUri, '*.txt').path)
            .map(filename => basename(filename, '.txt'));
    }

    /**
     * Cria o conteúdo de evento/função compartilhada
     *
     * @param functionName Nome da Função
     * @returns Definição da função
     */
    static createEmptyFunction(functionName: string): string {
        return `/**
 *
 *
 */
function ${functionName}() {

}

`;
    }
}
