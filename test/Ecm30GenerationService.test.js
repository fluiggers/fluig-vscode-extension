const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
    assertEcm30,
    writeEcm30Artifact,
    writeProcessImageArtifact,
} = require("../src/services/Ecm30GenerationService");
const {
    ecm30PathForProcess,
    isWorkflowDiagramProcessPath,
    processImagePathForProcess,
} = require("../src/services/workflowProcessPath");
const { assertGeneratedArtifactsFresh } = require("../src/services/FluigProcessExportService");

function temporaryDirectory(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ecm30-generation-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}

test("aceita somente processos diretamente em workflow/diagrams", () => {
    assert.equal(
        isWorkflowDiagramProcessPath(path.join("projeto", "workflow", "diagrams", "processo.process")),
        true
    );
    assert.equal(
        isWorkflowDiagramProcessPath(path.join("projeto", ".fluig-bpmn", "backups", "processo.process")),
        false
    );
    assert.equal(
        isWorkflowDiagramProcessPath(path.join("projeto", "test", "fixtures", "processo.process")),
        false
    );
    assert.equal(
        isWorkflowDiagramProcessPath(path.join("projeto", "workflow", "diagrams", "processo.txt")),
        false
    );
});

test("calcula o ECM30 correspondente sem aceitar arquivos de backup", () => {
    const processPath = path.resolve("projeto", "workflow", "diagrams", "processo.process");
    assert.equal(
        ecm30PathForProcess(processPath),
        path.resolve("projeto", "workflow", ".resources", "processo.ecm30.xml")
    );
    assert.throws(
        () => ecm30PathForProcess(path.resolve("projeto", ".fluig-bpmn", "backups", "processo.process")),
        /Expected process under workflow\/diagrams/
    );
});

test("valida a estrutura minima do ECM30", () => {
    assert.doesNotThrow(() => assertEcm30(
        "<list><ProcessDefinition></ProcessDefinition><ProcessDefinitionVersion></ProcessDefinitionVersion></list>"
    ));
    assert.throws(() => assertEcm30("<xmi:XMI></xmi:XMI>"), /raiz <list>/);
    assert.throws(() => assertEcm30("<list></list>"), /definicao e a versao/);
});

test("preserva backup quando substitui um ECM30 diferente", t => {
    const root = temporaryDirectory(t);
    const target = path.join(root, "workflow", ".resources", "processo.ecm30.xml");
    const oldContent = Buffer.from(
        "<list><ProcessDefinition>old</ProcessDefinition><ProcessDefinitionVersion>1</ProcessDefinitionVersion></list>"
    );
    const newContent = Buffer.from(
        "<list><ProcessDefinition>new</ProcessDefinition><ProcessDefinitionVersion>1</ProcessDefinitionVersion></list>"
    );
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, oldContent);

    const result = writeEcm30Artifact(target, newContent, new Date("2026-09-10T12:00:00Z"));
    assert.equal(fs.readFileSync(target, "utf8"), newContent.toString("utf8"));
    assert.ok(result.backupPath);
    assert.equal(fs.readFileSync(result.backupPath, "utf8"), oldContent.toString("utf8"));
});

test("grava a imagem do processo ao lado do ECM30 para a exportacao", t => {
    const root = temporaryDirectory(t);
    const processPath = path.join(root, "workflow", "diagrams", "processo.process");
    fs.mkdirSync(path.dirname(processPath), { recursive: true });
    fs.writeFileSync(processPath, "<xmi:XMI></xmi:XMI>");
    const ecm30Path = ecm30PathForProcess(processPath);
    const svgPath = processImagePathForProcess(processPath);
    const svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>\n';

    assert.equal(svgPath, path.join(root, "workflow", ".resources", "processo.processimage.svg"));
    assert.throws(() => processImagePathForProcess(path.join(root, "processo.process")), /workflow\/diagrams/);
    assert.throws(() => writeProcessImageArtifact(svgPath, "<list></list>"), /<svg>/);
    assert.equal(fs.existsSync(svgPath), false);

    writeEcm30Artifact(ecm30Path, Buffer.from(
        "<list><ProcessDefinition></ProcessDefinition><ProcessDefinitionVersion></ProcessDefinitionVersion></list>"
    ));
    const written = writeProcessImageArtifact(svgPath, svg);

    assert.equal(written.filePath, svgPath);
    assert.equal(written.bytes, Buffer.byteLength(svg));
    assert.equal(fs.readFileSync(svgPath, "utf8"), svg);
    assert.doesNotThrow(() => assertGeneratedArtifactsFresh(processPath, ecm30Path, svgPath));
});
