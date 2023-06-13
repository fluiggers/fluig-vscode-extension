import * as vscode from 'vscode';
import { glob } from "glob";
import { basename } from "path";

export class TemplateService {
    public static templatesUri: vscode.Uri;
    public static formEventsUri: vscode.Uri;
    public static workflowEventsUri: vscode.Uri;
    public static globalEventsUri: vscode.Uri;

    public static formEventsNames: string[];
    public static workflowEventsNames: string[];
    public static globalEventsNames: string[];

    public static init(context: vscode.ExtensionContext): void {
        TemplateService.templatesUri = vscode.Uri.joinPath(context.extensionUri, 'dist', 'templates');
        TemplateService.formEventsUri = vscode.Uri.joinPath(TemplateService.templatesUri, 'formEvents');
        TemplateService.workflowEventsUri = vscode.Uri.joinPath(TemplateService.templatesUri, 'workflowEvents');
        TemplateService.globalEventsUri = vscode.Uri.joinPath(TemplateService.templatesUri, 'globalEvents');
        TemplateService.formEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.formEventsUri);
        TemplateService.workflowEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.workflowEventsUri);
        TemplateService.globalEventsNames = TemplateService.getTemplatesNameFromPath(TemplateService.globalEventsUri);
    }

    /**
     * Pega o nome dos templates de determinado diretório
     *
     * @param path Diretório onde estão os templates
     * @returns Nome dos arquivos sem a extensão
     */
    private static getTemplatesNameFromPath(templatesUri: vscode.Uri): string[] {
        return glob.sync(vscode.Uri.joinPath(templatesUri, '*.txt').fsPath)
            .map(filename => basename(filename, '.txt'));
    }
}
