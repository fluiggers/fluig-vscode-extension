import { Uri } from 'vscode';
import { globSync } from "glob";
import { basename } from "path";

export class TemplateService {

    public static templatesUri: Uri;
    public static formEventsUri: Uri;
    public static workflowEventsUri: Uri;
    public static globalEventsUri: Uri;

    public static formEventsNames: string[];
    public static workflowEventsNames: string[];
    public static globalEventsNames: string[];

    /**
     * Pega o nome dos templates de determinado diretório
     *
     * @param templatesUri Diretório onde estão os templates
     * @returns Nome dos arquivos sem a extensão
     */
    static getTemplatesNameFromPath(templatesUri: Uri): string[] {
        return globSync(Uri.joinPath(templatesUri, '*.txt').path)
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
