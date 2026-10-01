'use strict';

class TranslationPreviewProvider {
  static scheme = 'fluig-bpmn-preview';

  constructor() {
    this.contents = new Map();
    this.sequence = 0;
  }

  createUri(vscode, fileName, content) {
    const safeName = String(fileName || 'preview.properties').replace(/[^a-z0-9_.-]/gi, '_');
    const uri = vscode.Uri.from({
      scheme: TranslationPreviewProvider.scheme,
      path: `/${safeName}`,
      query: `version=${Date.now()}-${this.sequence += 1}`
    });
    this.contents.set(uri.toString(), String(content ?? ''));
    while (this.contents.size > 24) this.contents.delete(this.contents.keys().next().value);
    return uri;
  }

  provideTextDocumentContent(uri) {
    return this.contents.get(uri.toString()) ?? '';
  }
}

module.exports = { TranslationPreviewProvider };
