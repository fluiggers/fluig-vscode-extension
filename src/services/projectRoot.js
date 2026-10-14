'use strict';

const path = require('node:path');

/**
 * Raiz do projeto Fluig que contém `start` (pasta ou arquivo): sobe até `workspaceRoot` e para na primeira
 * pasta chamada `workflow` (devolve a de cima) ou que contenha `.project` ou a pasta `workflow/`.
 * Sem marcador, ou com `start` fora do workspace, devolve `workspaceRoot`.
 * @param {string} start
 * @param {string} workspaceRoot
 * @param {(candidate: string) => Promise<'file' | 'directory' | undefined>} kindOf
 * @returns {Promise<string>}
 */
async function findProjectRoot(start, workspaceRoot, kindOf) {
    const root = path.resolve(workspaceRoot);
    let current = path.resolve(start);
    if (await kindOf(current) === 'file') current = path.dirname(current);
    while (isInside(current, root)) {
        if (current !== root && path.basename(current).toLowerCase() === 'workflow') return path.dirname(current);
        if (await kindOf(path.join(current, 'workflow')) === 'directory' || await kindOf(path.join(current, '.project'))) {
            return current;
        }
        if (current === root) break;
        current = path.dirname(current);
    }
    return root;
}

/**
 * Pasta `<...>/<folder>/<nome>` que contém `filePath` (ex.: o formulário de um evento em `forms/<nome>/events`).
 * @param {string} filePath
 * @param {'forms' | 'widget'} folder
 * @returns {string | null}
 */
function artifactFolderPath(filePath, folder) {
    return String(filePath).match(new RegExp(`^(.*[\\\\/]${folder}[\\\\/][^\\\\/]+)`))?.[1] ?? null;
}

function isInside(candidate, root) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

module.exports = { artifactFolderPath, findProjectRoot };
