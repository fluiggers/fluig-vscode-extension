import { ExtensionContext, workspace } from "vscode";
import { TemplateExtension } from "./extensions/TemplateExtension";
import { LibraryExtension } from "./extensions/LibraryExtension";
import { DatasetExtension } from "./extensions/DatasetExtension";
import { FormExtension } from "./extensions/FormExtension";
import { WidgetExtension } from "./extensions/WidgetExtension";
import { WorkflowExtension } from "./extensions/WorkflowExtension";
import { GlobalEventExtension } from "./extensions/GlobalEventExtension";
import { ServerExtension } from "./extensions/ServerExtension";
import { BpmnEditorExtension } from "./extensions/BpmnEditorExtension";

export function activate(context: ExtensionContext) {
    if (!workspace.workspaceFolders) {
        throw new Error("É necessário estar em Workspace / Diretório.");
    }

    TemplateExtension.activate(context);
    LibraryExtension.activate(context);
    DatasetExtension.activate(context);
    FormExtension.activate(context);
    WidgetExtension.activate(context);
    WorkflowExtension.activate(context);
    GlobalEventExtension.activate(context);
    ServerExtension.activate(context);
    BpmnEditorExtension.activate(context);
}

export function deactivate() {
}
