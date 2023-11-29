import * as vscode from "vscode";
import {TemplateExtension} from "./extensions/TemplateExtension";
import {LibraryExtension} from "./extensions/LibraryExtension";
import {DatasetExtension} from "./extensions/DatasetExtension";
import {FormExtension} from "./extensions/FormExtension";
import {WidgetExtension} from "./extensions/WidgetExtension";
import {WorkflowExtension} from "./extensions/WorkflowExtension";
import {GlobalEventExtension} from "./extensions/GlobalEventExtension";
import {ServerExtension} from "./extensions/ServerExtension";

export function activate(context: vscode.ExtensionContext) {
    if (!vscode.workspace.workspaceFolders) {
        throw "É necessário estar em Workspace / Diretório.";
    }

    TemplateExtension.activate(context);
    LibraryExtension.activate(context);
    DatasetExtension.activate(context);
    FormExtension.activate(context);
    WidgetExtension.activate(context);
    WorkflowExtension.activate(context);
    GlobalEventExtension.activate(context);
    ServerExtension.activate(context);
}

export function deactivate() {
}
