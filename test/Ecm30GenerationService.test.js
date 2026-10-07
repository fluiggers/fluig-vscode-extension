const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
    REQUIRED_BUNDLES,
    assertEcm30,
    assertMarshallerPreconditions,
    configuredJavaExecutable,
    findEclipsePluginsDirectory,
    generateEcm30Artifact,
    javaArguments,
    javaFromHome,
    parseJavaMajorVersion,
    resolveJavaExecutable,
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

function fakePlugins(directory) {
    fs.mkdirSync(directory, { recursive: true });
    for (const prefix of REQUIRED_BUNDLES) {
        fs.writeFileSync(path.join(directory, `${prefix}1.8.2.2.jar`), "jar");
    }
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

test("descobre a pasta plugins configurada ou no EclipsePortable", t => {
    const root = temporaryDirectory(t);
    const configured = path.join(root, "custom", "plugins");
    fakePlugins(configured);
    assert.equal(findEclipsePluginsDirectory({ configuredPath: configured }), configured);

    const portable = path.join(root, "EclipsePortable", "App", "eclipse", "plugins");
    fakePlugins(portable);
    assert.equal(findEclipsePluginsDirectory({ homeDirectory: root }), portable);
});

test("usa plugins empacotados antes do EclipsePortable", t => {
    const root = temporaryDirectory(t);
    const bundled = path.join(root, "extension", "runtime", "fluig-studio", "plugins");
    const portable = path.join(root, "EclipsePortable", "App", "eclipse", "plugins");
    fakePlugins(bundled);
    fakePlugins(portable);
    assert.equal(findEclipsePluginsDirectory({ bundledPath: bundled, homeDirectory: root }), bundled);
});

test("resolve Java configurado, JAVA_HOME e fallback do PATH", t => {
    const root = temporaryDirectory(t);
    const windowsHome = path.join(root, "jdk-windows");
    const windowsJava = path.join(windowsHome, "bin", "java.exe");
    fs.mkdirSync(path.dirname(windowsJava), { recursive: true });
    fs.writeFileSync(windowsJava, "java");

    assert.equal(
        javaFromHome(windowsHome, "win32"),
        windowsJava
    );
    assert.equal(
        resolveJavaExecutable({
            javaHome: windowsHome,
            platform: "win32",
        }),
        windowsJava
    );
    assert.equal(
        resolveJavaExecutable({
            configuredPath: "C:\\Java\\bin\\java.exe",
            javaHome: windowsHome,
            platform: "win32",
        }),
        "C:\\Java\\bin\\java.exe"
    );
    assert.equal(
        resolveJavaExecutable({
            javaHome: path.join(root, "missing"),
            platform: "win32",
        }),
        "java"
    );
});

test("aceita uma pasta JAVA_HOME na configuracao explicita", t => {
    const root = temporaryDirectory(t);
    const javaHome = path.join(root, "jdk");
    const java = path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");
    fs.mkdirSync(path.dirname(java), { recursive: true });
    fs.writeFileSync(java, "java");

    assert.equal(configuredJavaExecutable(`"${javaHome}"`, process.platform), java);
    assert.equal(resolveJavaExecutable({
        configuredPath: javaHome,
        javaHome: path.join(root, "outro-jdk"),
        platform: process.platform,
    }), java);
});

test("reconhece o bundle .jdk do macOS ao receber sua pasta externa", t => {
    const root = temporaryDirectory(t);
    const javaHome = path.join(root, "Temurin.jdk");
    const java = path.join(javaHome, "Contents", "Home", "bin", "java");
    fs.mkdirSync(path.dirname(java), { recursive: true });
    fs.writeFileSync(java, "java");

    assert.equal(javaFromHome(javaHome, "darwin"), java);
});

test("interpreta versoes Java antigas e modernas", () => {
    assert.equal(parseJavaMajorVersion('java version "1.8.0_401"'), 8);
    assert.equal(parseJavaMajorVersion('openjdk version "17.0.12"'), 17);
    assert.equal(parseJavaMajorVersion('openjdk version "21"'), 21);
});

test("adiciona --add-opens somente no Java 9 ou superior", () => {
    const base = {
        bridgeClassesDirectory: "classes",
        pluginsDirectory: "plugins",
        xstreamJar: "xstream.jar",
        processPath: "processo.process",
        temporaryOutput: "processo.ecm30.xml",
        serverVersion: "1.8.2",
    };
    assert.equal(javaArguments({ ...base, javaMajorVersion: 8 })[0], "-cp");
    assert.match(javaArguments({ ...base, javaMajorVersion: 17 })[0], /^--add-opens=/);
});

test("valida a estrutura minima do ECM30", () => {
    assert.doesNotThrow(() => assertEcm30(
        "<list><ProcessDefinition></ProcessDefinition><ProcessDefinitionVersion></ProcessDefinitionVersion></list>"
    ));
    assert.throws(() => assertEcm30("<xmi:XMI></xmi:XMI>"), /raiz <list>/);
    assert.throws(() => assertEcm30("<list></list>"), /definicao e a versao/);
});

test("explica a precondicao de saida das atividades manuais", t => {
    const root = temporaryDirectory(t);
    const processPath = path.join(root, "processo.process");
    fs.writeFileSync(processPath, [
        "<xmi:XMI xmlns:bpmn2=\"http://www.omg.org/spec/BPMN/20100524/MODEL-XMI\">",
        "<bpmn2:BpmnTask id=\"manualtask32\" type=\"85\"/>",
        "</xmi:XMI>",
    ].join(""));
    assert.throws(
        () => assertMarshallerPreconditions(processPath),
        /manualtask32 \(0 fluxos de saida\)/
    );
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

test("orquestra Java, ponte e validacao sem gravar o .process", async t => {
    const root = temporaryDirectory(t);
    const pluginsDirectory = path.join(root, "plugins");
    const bridgeClassesDirectory = path.join(root, "bridge");
    const cacheDirectory = path.join(root, "cache");
    const processPath = path.join(root, "workflow", "diagrams", "processo.process");
    fakePlugins(pluginsDirectory);
    fs.mkdirSync(path.join(bridgeClassesDirectory, "com", "fluig", "bpm", "utils"), { recursive: true });
    fs.writeFileSync(path.join(bridgeClassesDirectory, "Ecm30Bridge.class"), "class");
    fs.writeFileSync(
        path.join(bridgeClassesDirectory, "com", "fluig", "bpm", "utils", "ProjectUtils.class"),
        "class"
    );
    fs.mkdirSync(path.dirname(processPath), { recursive: true });
    fs.writeFileSync(processPath, "<xmi:XMI></xmi:XMI>");

    const valid = "<list><ProcessDefinition></ProcessDefinition><ProcessDefinitionVersion></ProcessDefinitionVersion></list>";
    const calls = [];
    const fakeExec = async (_file, args) => {
        calls.push(args);
        if (args[0] === "-version") {
            return { stdout: "", stderr: 'openjdk version "17.0.12"' };
        }
        fs.writeFileSync(args[args.length - 2], valid);
        return { stdout: "generated", stderr: "" };
    };

    const result = await generateEcm30Artifact({
        processPath,
        pluginsDirectory,
        bridgeClassesDirectory,
        cacheDirectory,
        javaExecutable: "java",
        serverVersion: "1.8.2",
    }, {
        execFile: fakeExec,
        ensureXStreamJar: async () => path.join(root, "xstream.jar"),
    });

    assert.equal(result.content.toString("utf8"), valid);
    assert.equal(fs.readFileSync(processPath, "utf8"), "<xmi:XMI></xmi:XMI>");
    assert.equal(calls.length, 2);
    assert.match(calls[1][0], /^--add-opens=/);
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
