'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FileType = Object.freeze({ Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 });

class FileUri {
  constructor(fsPath) {
    this.scheme = 'file';
    this.fsPath = path.resolve(fsPath);
    this.path = this.fsPath.split(path.sep).join('/');
  }

  toString() {
    return `file://${this.path}`;
  }
}

const Uri = Object.freeze({
  file: (fsPath) => new FileUri(fsPath),
  joinPath: (base, ...segments) => new FileUri(path.join(base.fsPath, ...segments))
});

/**
 * Subconjunto da API do VS Code que os módulos de `src/bpmn` recebem por parâmetro (catálogos,
 * backup), implementado sobre o sistema de arquivos. É o que deixa a CLI ler o mesmo contexto do editor.
 * @param {{workspaceRoot: string, settings?: Record<string, unknown>}} options
 */
function createNodeHost(options) {
  const workspaceRoot = new FileUri(options.workspaceRoot);
  const settings = options.settings ?? {};
  return {
    FileType,
    Uri,
    // Sem machineId a senha dos servidores fica ilegível: a CLI não consulta o servidor.
    env: { machineId: '' },
    workspace: {
      fs: {
        readFile: async (uri) => new Uint8Array(await fs.promises.readFile(uri.fsPath)),
        writeFile: (uri, bytes) => fs.promises.writeFile(uri.fsPath, bytes),
        createDirectory: async (uri) => { await fs.promises.mkdir(uri.fsPath, { recursive: true }); },
        readDirectory: async (uri) => (await fs.promises.readdir(uri.fsPath, { withFileTypes: true }))
          .map((entry) => [entry.name, entry.isDirectory() ? FileType.Directory : FileType.File]),
        stat: async (uri) => {
          const stat = await fs.promises.stat(uri.fsPath);
          return { type: stat.isDirectory() ? FileType.Directory : FileType.File, size: stat.size, mtime: stat.mtimeMs };
        }
      },
      getWorkspaceFolder: () => ({ uri: workspaceRoot, name: path.basename(workspaceRoot.fsPath), index: 0 }),
      getConfiguration: (section) => ({
        get: (key, fallback) => settings[`${section}.${key}`] ?? fallback
      })
    }
  };
}

/** Pastas de dados dos editores baseados no VS Code, onde fica o settings.json do usuário. */
function editorDataDirectories(environment = process.env, platform = process.platform, home = os.homedir()) {
  const products = ['Code', 'Code - Insiders', 'VSCodium', 'Cursor', 'Windsurf'];
  if (platform === 'darwin') return products.map((name) => path.join(home, 'Library', 'Application Support', name));
  if (platform === 'win32') {
    const appData = environment.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    return products.map((name) => path.join(appData, name));
  }
  const configHome = environment.XDG_CONFIG_HOME ?? path.join(home, '.config');
  return products.map((name) => path.join(configHome, name));
}

/**
 * Configurações `fluiggers.*` como o editor as veria: o settings.json do projeto vence o do usuário.
 * @param {string} workspaceRoot
 */
function readFluiggersSettings(workspaceRoot, dataDirectories = editorDataDirectories()) {
  const files = [
    ...dataDirectories.map((directory) => path.join(directory, 'User', 'settings.json')).reverse(),
    path.join(workspaceRoot, '.vscode', 'settings.json')
  ];
  const settings = {};
  for (const file of files) {
    let parsed;
    try {
      parsed = parseJsonWithComments(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parsed ?? {})) {
      if (key.startsWith('fluiggers.')) settings[key] = value;
    }
  }
  return settings;
}

/** settings.json aceita comentários e vírgula final, que JSON.parse recusa. */
function parseJsonWithComments(text) {
  const withoutComments = String(text).replace(
    /"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match) => (match.startsWith('"') ? match : '')
  );
  const withoutTrailingCommas = withoutComments.replace(
    /"(?:\\.|[^"\\])*"|,(\s*[}\]])/g,
    (match, closing) => (closing === undefined ? match : closing)
  );
  return JSON.parse(withoutTrailingCommas);
}

module.exports = {
  createNodeHost,
  editorDataDirectories,
  parseJsonWithComments,
  readFluiggersSettings
};
