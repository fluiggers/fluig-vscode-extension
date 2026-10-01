"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(projectRoot, "runtime");
const creationTemplateSource = path.join(
    projectRoot,
    "test",
    "bpmn",
    "fixtures",
    "toexportbpmnteste.process.gz.b64"
);
const creationTemplateTarget = path.join(runtimeRoot, "bpmn", "creation-template.process.gz.b64");

const studioBundlePrefixes = [
    "com.totvs.tds.ecm.designer.export.bpmn20_",
    "com.totvs.tds.ecm.designer.model_",
    "com.totvs.tds.ecm.designer.eclipse_",
    "com.totvs.tds.ecm_",
    "com.ibm.icu_",
    "org.apache.felix.gogo.command_",
    "org.apache.xerces_",
    "org.eclipse.core.runtime_",
    "org.eclipse.emf.common_",
    "org.eclipse.emf.ecore.xmi_",
    "org.eclipse.emf.ecore_",
    "org.eclipse.equinox.common_",
    "org.eclipse.graphiti.mm_",
    "org.eclipse.osgi_",
];

function parseArguments(argv) {
    const options = {
        check: false,
        eclipsePlugins: process.env.FLUIG_ECLIPSE_PLUGINS || "",
    };
    for (const argument of argv) {
        if (argument === "--check") options.check = true;
        else if (argument.startsWith("--eclipse-plugins=")) options.eclipsePlugins = argument.slice(18);
        else throw new Error(`Argumento desconhecido: ${argument}`);
    }
    return options;
}

function sha256(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
}

function selectLatestBundle(pluginsDirectory, prefix) {
    if (!fs.existsSync(pluginsDirectory)) return undefined;
    return fs.readdirSync(pluginsDirectory)
        .filter(name => name.startsWith(prefix) && name.endsWith(".jar"))
        .sort((left, right) => right.localeCompare(left, "en", { numeric: true }))[0];
}

function findPluginsDirectory(configuredPath) {
    const configuredCandidates = configuredPath
        ? (path.basename(path.resolve(configuredPath)).toLowerCase() === "plugins"
            ? [configuredPath]
            : [path.join(configuredPath, "plugins"), configuredPath])
        : [];
    const candidates = [
        ...configuredCandidates,
        path.join(os.homedir(), "EclipsePortable", "App", "eclipse", "plugins"),
        path.join(os.homedir(), "eclipse", "plugins"),
    ];
    return candidates.find(candidate => {
        try {
            return fs.statSync(candidate).isDirectory() &&
                studioBundlePrefixes.slice(0, 4).every(prefix => (
                    Boolean(selectLatestBundle(candidate, prefix))
                ));
        } catch (_error) {
            return false;
        }
    });
}

function prepareStudio(options) {
    const pluginsDirectory = findPluginsDirectory(options.eclipsePlugins);
    if (!pluginsDirectory) {
        throw new Error(
            "Plugins do Fluig Studio nao encontrados. Informe FLUIG_ECLIPSE_PLUGINS " +
            "ou --eclipse-plugins=<pasta>."
        );
    }
    const selected = studioBundlePrefixes.map(prefix => {
        const name = selectLatestBundle(pluginsDirectory, prefix);
        if (!name) throw new Error(`Dependencia do Fluig Studio nao encontrada: ${prefix}*.jar`);
        return name;
    });

    const destination = path.join(runtimeRoot, "fluig-studio", "plugins");
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(destination, { recursive: true });
    const files = selected.map(name => {
        const source = path.join(pluginsDirectory, name);
        const target = path.join(destination, name);
        fs.copyFileSync(source, target);
        return { name, sha256: sha256(fs.readFileSync(target)), bytes: fs.statSync(target).size };
    });
    fs.writeFileSync(path.join(runtimeRoot, "fluig-studio", "runtime.json"), JSON.stringify({
        sourceDirectory: pluginsDirectory,
        files,
    }, null, 2));
    fs.writeFileSync(
        path.join(runtimeRoot, "fluig-studio", "REDISTRIBUTION-NOTICE.txt"),
        [
            "This folder contains files copied from a locally installed TOTVS Fluig Studio.",
            "Confirm that your TOTVS license permits redistribution before sharing the VSIX.",
            "The build does not download TOTVS proprietary artifacts from the internet.",
            "A Java runtime is not included in this extension.",
            "",
        ].join("\n")
    );
    const total = files.reduce((sum, file) => sum + file.bytes, 0);
    fs.mkdirSync(path.dirname(creationTemplateTarget), { recursive: true });
    fs.copyFileSync(creationTemplateSource, creationTemplateTarget);
    console.log(`Fluig Studio preparado: ${files.length} JARs, ${(total / 1024 / 1024).toFixed(2)} MB.`);
}

function checkRuntime() {
    const plugins = path.join(runtimeRoot, "fluig-studio", "plugins");
    for (const prefix of studioBundlePrefixes) {
        if (!selectLatestBundle(plugins, prefix)) {
            throw new Error(`JAR empacotado ausente: ${prefix}*.jar`);
        }
    }
    const javaDirectory = path.join(runtimeRoot, "java");
    if (fs.existsSync(javaDirectory)) {
        throw new Error(`Runtime Java portatil nao deve ser empacotado: ${javaDirectory}`);
    }
    if (!fs.existsSync(creationTemplateTarget) || !fs.statSync(creationTemplateTarget).size) {
        throw new Error(`Template visual BPMN empacotado ausente: ${creationTemplateTarget}`);
    }
    console.log("Runtime Fluig Studio valido e sem Java portatil.");
}

function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.check) checkRuntime();
    else prepareStudio(options);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error?.stack || error);
        process.exitCode = 1;
    }
}

module.exports = {
    findPluginsDirectory,
    parseArguments,
    selectLatestBundle,
    studioBundlePrefixes,
};
