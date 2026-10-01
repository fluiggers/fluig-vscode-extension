'use strict';

const path = require('node:path');

function isWorkflowDiagramProcessPath(filePath) {
    const value = String(filePath ?? '').trim();
    if (!value || path.extname(value).toLowerCase() !== '.process') {
        return false;
    }

    const diagramsDirectory = path.dirname(path.resolve(value));
    const workflowDirectory = path.dirname(diagramsDirectory);
    return path.basename(diagramsDirectory).toLowerCase() === 'diagrams'
        && path.basename(workflowDirectory).toLowerCase() === 'workflow';
}

function ecm30PathForProcess(filePath) {
    if (!isWorkflowDiagramProcessPath(filePath)) {
        throw new Error(`Expected process under workflow/diagrams: ${filePath}`);
    }

    const diagramsDirectory = path.dirname(path.resolve(filePath));
    const processId = path.basename(filePath, path.extname(filePath));
    return path.join(path.dirname(diagramsDirectory), '.resources', `${processId}.ecm30.xml`);
}

function processImagePathForProcess(filePath) {
    const ecm30Path = ecm30PathForProcess(filePath);
    return path.join(path.dirname(ecm30Path), `${path.basename(filePath, path.extname(filePath))}.processimage.svg`);
}

module.exports = {
    ecm30PathForProcess,
    isWorkflowDiagramProcessPath,
    processImagePathForProcess,
};
