const fs = require("fs");
const path = require("path");

// Gravação dos artefatos de runtime do processo (ECM30 e imagem). A geração do ECM30 fica em src/core/ecm30.

function assertEcm30(content) {
    const text = Buffer.isBuffer(content) ? content.toString("utf8") : String(content || "");
    if (!/^\s*<list(?:\s|>)/.test(text)) {
        throw new Error("O conversor nao produziu um ECM30 valido com raiz <list>.");
    }
    if (!text.includes("<ProcessDefinition>") || !text.includes("<ProcessDefinitionVersion>")) {
        throw new Error("O ECM30 gerado nao contem a definicao e a versao do processo.");
    }
    return text;
}

function backupName(filePath, now = new Date()) {
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    return `${path.basename(filePath)}.${stamp}.bak`;
}

function writeEcm30Artifact(filePath, content, now = new Date()) {
    assertEcm30(content);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    let backupPath;
    if (fs.existsSync(filePath)) {
        const previous = fs.readFileSync(filePath);
        if (!previous.equals(content)) {
            const backupDirectory = path.join(path.dirname(filePath), ".backups");
            fs.mkdirSync(backupDirectory, { recursive: true });
            backupPath = path.join(backupDirectory, backupName(filePath, now));
            fs.copyFileSync(filePath, backupPath);
        }
    }
    fs.writeFileSync(filePath, content);
    return { filePath, backupPath, bytes: content.length };
}

function writeProcessImageArtifact(filePath, content) {
    const text = String(content || "");
    if (!/^\s*(?:<\?xml[^>]*\?>\s*)?<svg(?:\s|>)/.test(text)) {
        throw new Error("A imagem do processo gerada nao possui raiz <svg>.");
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
    return { filePath, bytes: Buffer.byteLength(text) };
}

module.exports = {
    assertEcm30,
    writeEcm30Artifact,
    writeProcessImageArtifact,
};
