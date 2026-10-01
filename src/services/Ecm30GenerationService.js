const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const JSZip = require("jszip");

const REQUIRED_BUNDLES = [
    "com.totvs.tds.ecm.designer.export.bpmn20_",
    "com.totvs.tds.ecm.designer.model_",
    "com.totvs.tds.ecm.designer.eclipse_",
    "com.totvs.tds.ecm_",
];

function javaExecutableName(platform = process.platform) {
    return platform === "win32" ? "java.exe" : "java";
}

function unquotePath(value) {
    const normalized = String(value || "").trim();
    if (normalized.length >= 2 && (
        (normalized.startsWith('"') && normalized.endsWith('"')) ||
        (normalized.startsWith("'") && normalized.endsWith("'"))
    )) {
        return normalized.slice(1, -1).trim();
    }
    return normalized;
}

function javaFromHome(javaHome, platform = process.platform, exists = fs.existsSync) {
    const home = unquotePath(javaHome);
    if (!home) {
        return undefined;
    }
    const executable = javaExecutableName(platform);
    const candidates = [
        path.join(home, "bin", executable),
        path.join(home, "Contents", "Home", "bin", executable),
    ];
    return candidates.find(candidate => exists(candidate));
}

function configuredJavaExecutable(configuredPath, platform = process.platform) {
    const configured = unquotePath(configuredPath);
    if (!configured || configured.toLowerCase() === "java") {
        return configured || undefined;
    }
    if (!existingDirectory(configured)) {
        return configured;
    }
    return javaFromHome(configured, platform) ||
        path.join(configured, "bin", javaExecutableName(platform));
}

function resolveJavaExecutable(options = {}) {
    const platform = options.platform || process.platform;
    const configured = configuredJavaExecutable(options.configuredPath, platform);
    if (configured) {
        return configured;
    }
    const javaHome = options.javaHome === undefined
        ? process.env.JAVA_HOME
        : options.javaHome;
    return javaFromHome(javaHome, platform, options.exists || fs.existsSync) || "java";
}

function existingDirectory(candidate) {
    try {
        return Boolean(candidate && fs.statSync(candidate).isDirectory());
    } catch (_error) {
        return false;
    }
}

function findBundle(pluginsDirectory, prefix) {
    if (!existingDirectory(pluginsDirectory)) {
        return undefined;
    }
    return fs.readdirSync(pluginsDirectory)
        .filter(name => name.startsWith(prefix) && name.endsWith(".jar"))
        .sort((left, right) => right.localeCompare(left, "en", { numeric: true }))
        .map(name => path.join(pluginsDirectory, name))[0];
}

function hasRequiredBundles(pluginsDirectory) {
    return REQUIRED_BUNDLES.every(prefix => Boolean(findBundle(pluginsDirectory, prefix)));
}

function normalizePluginsCandidate(candidate) {
    if (!candidate) {
        return undefined;
    }
    const resolved = path.resolve(candidate);
    const candidates = path.basename(resolved).toLowerCase() === "plugins"
        ? [resolved]
        : [path.join(resolved, "plugins"), resolved];
    return candidates.find(hasRequiredBundles);
}

function findEclipsePluginsDirectory(options = {}) {
    const homeDirectory = options.homeDirectory || os.homedir();
    const candidates = [
        options.configuredPath,
        options.environmentPath || process.env.FLUIG_ECLIPSE_PLUGINS,
        options.bundledPath,
        path.join(homeDirectory, "EclipsePortable", "App", "eclipse", "plugins"),
        path.join(homeDirectory, "eclipse", "plugins"),
    ];

    for (const candidate of candidates) {
        const pluginsDirectory = normalizePluginsCandidate(candidate);
        if (pluginsDirectory) {
            return pluginsDirectory;
        }
    }
    return undefined;
}

function parseJavaMajorVersion(output) {
    const match = String(output || "").match(/version\s+"(\d+)(?:\.(\d+))?/i);
    if (!match) {
        throw new Error("Nao foi possivel identificar a versao do Java.");
    }
    return Number(match[1]) === 1 ? Number(match[2]) : Number(match[1]);
}

function execFile(file, args, options = {}) {
    return new Promise((resolve, reject) => {
        childProcess.execFile(file, args, {
            windowsHide: true,
            timeout: 120000,
            maxBuffer: 16 * 1024 * 1024,
            ...options,
        }, (error, stdout, stderr) => {
            if (error) {
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

async function getJavaMajorVersion(javaExecutable, run = execFile) {
    const result = await run(javaExecutable, ["-version"]);
    return parseJavaMajorVersion(`${result.stdout || ""}\n${result.stderr || ""}`);
}

async function ensureXStreamJar(exportBundle, cacheDirectory) {
    const stat = fs.statSync(exportBundle);
    const targetDirectory = path.join(cacheDirectory, "ecm30-bridge");
    const target = path.join(targetDirectory, "xstream.jar");
    fs.mkdirSync(targetDirectory, { recursive: true });

    if (fs.existsSync(target) && fs.statSync(target).mtimeMs >= stat.mtimeMs) {
        return target;
    }

    const archive = await JSZip.loadAsync(fs.readFileSync(exportBundle));
    const entry = archive.file("META-INF/lib/xstream.jar");
    if (!entry) {
        throw new Error(`xstream.jar nao encontrado em ${path.basename(exportBundle)}.`);
    }
    fs.writeFileSync(target, await entry.async("nodebuffer"));
    return target;
}

function javaArguments(options) {
    const args = [];
    if (options.javaMajorVersion >= 9) {
        args.push(
            "--add-opens=java.base/java.util=ALL-UNNAMED",
            "--add-opens=java.base/java.lang.reflect=ALL-UNNAMED",
            "--add-opens=java.base/java.text=ALL-UNNAMED",
            "--add-opens=java.desktop/java.awt.font=ALL-UNNAMED"
        );
    }
    args.push(
        "-cp",
        [
            options.bridgeClassesDirectory,
            path.join(options.pluginsDirectory, "*"),
            options.xstreamJar,
        ].join(path.delimiter),
        "Ecm30Bridge",
        options.processPath,
        options.temporaryOutput,
        options.serverVersion
    );
    return args;
}

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

function xmlAttribute(tag, name) {
    const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
    return match ? match[1] : "";
}

function assertMarshallerPreconditions(processPath) {
    const source = fs.readFileSync(processPath, "utf8");
    const invalidManualTasks = [];
    for (const match of source.matchAll(/<bpmn2:BpmnTask\b[^>]*>/g)) {
        const tag = match[0];
        if (xmlAttribute(tag, "type") !== "85") {
            continue;
        }
        const outgoing = xmlAttribute(tag, "outgoing").trim().split(/\s+/).filter(Boolean);
        if (outgoing.length !== 1) {
            invalidManualTasks.push({
                id: xmlAttribute(tag, "id") || "sem-id",
                outgoing: outgoing.length,
            });
        }
    }

    if (invalidManualTasks.length) {
        const details = invalidManualTasks
            .map(task => `${task.id} (${task.outgoing} fluxos de saida)`)
            .join(", ");
        throw new Error(
            "O conversor do Fluig Studio exige exatamente um fluxo de saida em cada atividade manual. " +
            `Corrija: ${details}.`
        );
    }
}

async function generateEcm30Artifact(options, dependencies = {}) {
    const run = dependencies.execFile || execFile;
    const javaExecutable = options.javaExecutable || "java";
    const exportBundle = findBundle(
        options.pluginsDirectory,
        "com.totvs.tds.ecm.designer.export.bpmn20_"
    );
    if (!exportBundle) {
        throw new Error("Conversor BPMN2ECM30 do Fluig Studio nao encontrado.");
    }
    if (!hasRequiredBundles(options.pluginsDirectory)) {
        throw new Error("A pasta informada nao contem todos os plugins necessarios do Fluig Studio.");
    }
    assertMarshallerPreconditions(options.processPath);

    const bridgeMain = path.join(options.bridgeClassesDirectory, "Ecm30Bridge.class");
    const bridgeShim = path.join(
        options.bridgeClassesDirectory,
        "com", "fluig", "bpm", "utils", "ProjectUtils.class"
    );
    if (!fs.existsSync(bridgeMain) || !fs.existsSync(bridgeShim)) {
        throw new Error("Ponte ECM30 nao encontrada no pacote da extensao.");
    }

    const xstreamJar = await (dependencies.ensureXStreamJar || ensureXStreamJar)(
        exportBundle,
        options.cacheDirectory
    );
    const javaMajorVersion = options.javaMajorVersion || await getJavaMajorVersion(javaExecutable, run);
    const temporaryOutput = path.join(
        os.tmpdir(),
        `${path.basename(options.processPath, ".process")}.${process.pid}.${Date.now()}.ecm30.xml`
    );

    try {
        const result = await run(javaExecutable, javaArguments({
            ...options,
            javaMajorVersion,
            temporaryOutput,
            xstreamJar,
        }));
        const content = fs.readFileSync(temporaryOutput);
        assertEcm30(content);
        return {
            content,
            exportBundle,
            javaMajorVersion,
            stdout: result.stdout || "",
            stderr: result.stderr || "",
        };
    } catch (error) {
        const details = [error?.message, error?.stderr, error?.stdout]
            .filter(Boolean)
            .join("\n")
            .trim();
        throw new Error(`Falha ao gerar ECM30 pelo conversor do Fluig Studio.\n${details}`);
    } finally {
        try {
            fs.rmSync(temporaryOutput, { force: true });
        } catch (_error) {
            // Temporary cleanup must not hide the conversion result.
        }
    }
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
    REQUIRED_BUNDLES,
    assertEcm30,
    assertMarshallerPreconditions,
    configuredJavaExecutable,
    findBundle,
    findEclipsePluginsDirectory,
    generateEcm30Artifact,
    getJavaMajorVersion,
    hasRequiredBundles,
    javaArguments,
    javaExecutableName,
    javaFromHome,
    parseJavaMajorVersion,
    resolveJavaExecutable,
    writeEcm30Artifact,
    writeProcessImageArtifact,
};
