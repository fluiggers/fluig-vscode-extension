'use strict';

const path = require('node:path');

function formFolderRenameInfo(oldPath, newPath) {
    const oldParent = path.dirname(path.resolve(String(oldPath || '')));
    const newParent = path.dirname(path.resolve(String(newPath || '')));
    if (path.basename(oldParent).toLowerCase() !== 'forms' || comparablePath(oldParent) !== comparablePath(newParent)) {
        return null;
    }
    const oldName = path.basename(String(oldPath || ''));
    const newName = path.basename(String(newPath || ''));
    if (!oldName || !newName || oldName === newName) {
        return null;
    }
    return { oldName, newName };
}

function assertDistinctFormName(currentName, requestedName) {
    const current = String(currentName || '').trim();
    const requested = String(requestedName || '').trim();
    if (!current || !requested) {
        throw new Error('O nome do formulario nao pode ficar vazio.');
    }
    if (current.toLocaleLowerCase() === requested.toLocaleLowerCase()) {
        throw new Error('Nao e possivel alterar somente maiusculas e minusculas do nome do formulario.');
    }
    return requested;
}

function renamedFormArtifactName(fileName, currentName, requestedName) {
    const name = String(fileName || '');
    const current = String(currentName || '');
    const requested = String(requestedName || '');
    const lowerName = name.toLocaleLowerCase();
    const candidates = [...new Set([
        current,
        current.replace(/^\d+\s*-\s*/, '')
    ].filter(Boolean))];
    for (const candidate of candidates) {
        const lowerCandidate = candidate.toLocaleLowerCase();
        if (lowerName === `${lowerCandidate}.html`) {
            return `${requested}.html`;
        }
        if (!lowerName.endsWith('.properties')) {
            continue;
        }
        const stem = name.slice(0, -'.properties'.length);
        const lowerStem = lowerName.slice(0, -'.properties'.length);
        if (lowerStem === lowerCandidate) {
            return `${requested}.properties`;
        }
        if (lowerStem.startsWith(`${lowerCandidate}_`)) {
            return `${requested}${stem.slice(candidate.length)}.properties`;
        }
    }
    return null;
}

function formRenameKey(oldPath, newPath) {
    return `${comparablePath(oldPath)}=>${comparablePath(newPath)}`;
}

function comparablePath(value) {
    const resolved = path.resolve(String(value || '')).replace(/\\/g, '/');
    return process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved;
}

module.exports = {
    assertDistinctFormName,
    formFolderRenameInfo,
    formRenameKey,
    renamedFormArtifactName
};
