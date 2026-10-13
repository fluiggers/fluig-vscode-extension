"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { TextDecoder } = require("node:util");
const sax = require("sax");
const { TOKEN_NAMESPACE, WORKFLOW_NAMESPACE, soapCall } = require("../core/fluig-client/soap");

const SOAP_ACTIONS = Object.freeze({
    getToken: "getToken",
    getAllProcessAvailableToExport: "getAllProcessAvailableToExport",
    createWorkFlowProcessVersion: "createWorkFlowProcessVersion",
    importProcess: "importProcess",
    releaseProcess: "relaseProcess",
    getWorkFlowProcessVersion: "getWorkFlowProcessVersion",
});

const ARTIFACT_TIMESTAMP_TOLERANCE_MS = 1000;

function requiredString(value, name) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`${name} deve ser informado.`);
    }
    return value;
}

function normalizeBaseUrl(baseUrl) {
    const parsed = new URL(requiredString(baseUrl, "baseUrl"));
    if (!/^https?:$/.test(parsed.protocol)) {
        throw new Error("baseUrl deve usar HTTP ou HTTPS.");
    }
    return parsed.toString().replace(/\/$/, "");
}

function decodeUtf8(buffer, filePath) {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch (error) {
        throw new Error(`${filePath} nao e texto UTF-8 valido.`, { cause: error });
    }
}

function normalizeStudioText(buffer, filePath = "arquivo") {
    const text = decodeUtf8(buffer, filePath);
    const lines = text.split(/\r\n|\r|\n/);
    if (/\r\n$|\r$|\n$/.test(text)) {
        lines.pop();
    }
    return Buffer.from(lines.join("\n"), "utf8");
}

function getXmlRoot(xmlBuffer, filePath = "arquivo") {
    let rootName = null;
    const parser = sax.parser(true, { xmlns: true, trim: false, normalize: false });
    parser.onopentag = node => {
        if (rootName === null) {
            rootName = node.local || node.name.replace(/^.*:/, "");
        }
    };
    try {
        parser.write(xmlBuffer.toString("utf8")).close();
    } catch (error) {
        throw new Error(`XML malformado em ${filePath}: ${error.message}`, { cause: error });
    }
    if (!rootName) {
        throw new Error(`XML vazio em ${filePath}.`);
    }
    return rootName;
}

function loadXmlArtifact(filePath, expectedRoot) {
    requiredString(filePath, "filePath");
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        throw new Error(`Arquivo nao encontrado: ${filePath}`);
    }
    const normalized = normalizeStudioText(fs.readFileSync(filePath), filePath);
    const root = getXmlRoot(normalized, filePath);
    if (root !== expectedRoot) {
        if (expectedRoot === "list" && root === "XMI") {
            throw new Error(
                "O arquivo informado e um .process/XMI. A API espera o " +
                "ecm30.xml gerado pelo Fluig Studio, cuja raiz e <list>."
            );
        }
        throw new Error(
            `Raiz invalida em ${filePath}: esperado <${expectedRoot}>, recebido <${root}>.`
        );
    }
    return {
        path: path.resolve(filePath),
        fileName: path.basename(filePath),
        content: normalized,
        root,
        sha256: crypto.createHash("sha256").update(normalized).digest("hex"),
    };
}

function assertGeneratedArtifactsFresh(processPath, ecm30Path, svgPath) {
    requiredString(processPath, "processPath");
    requiredString(ecm30Path, "ecm30Path");
    if (!fs.existsSync(processPath) || !fs.statSync(processPath).isFile()) {
        throw new Error(`Arquivo .process nao encontrado: ${processPath}`);
    }
    if (!fs.existsSync(ecm30Path) || !fs.statSync(ecm30Path).isFile()) {
        throw new Error(
            `O ecm30.xml ainda nao foi gerado para ${path.basename(processPath)}. ` +
            "Gere os artefatos de runtime antes de exportar."
        );
    }

    requiredString(svgPath, "Caminho da imagem do processo (processimage.svg)");
    if (!fs.existsSync(svgPath) || !fs.statSync(svgPath).isFile()) {
        throw new Error(
            `A imagem do processo (processimage.svg) ainda nao foi gerada para ${path.basename(processPath)}. ` +
            "Gere os artefatos de runtime antes de exportar."
        );
    }

    const processStat = fs.statSync(processPath);
    const generated = [
        { label: "ecm30.xml", filePath: ecm30Path },
        { label: "processimage.svg", filePath: svgPath },
    ];
    for (const artifact of generated) {
        if (!fs.existsSync(artifact.filePath) || !fs.statSync(artifact.filePath).isFile()) {
            throw new Error(`Artefato gerado nao encontrado: ${artifact.filePath}`);
        }
        const artifactStat = fs.statSync(artifact.filePath);
        if (artifactStat.mtimeMs + ARTIFACT_TIMESTAMP_TOLERANCE_MS < processStat.mtimeMs) {
            throw new Error(
                `${artifact.label} desatualizado para ${path.basename(processPath)}: ` +
                "o arquivo .process foi modificado depois do artefato de runtime. " +
                "Regenere os artefatos antes de validar ou exportar."
            );
        }
    }
}

function buildAttachment(artifact, principal, attach) {
    // Mesma ordem de elementos do Attachment do servidor: attach vem antes de fileName.
    return {
        ...(attach ? { attach: true } : {}),
        fileName: artifact.fileName,
        fileSize: 0,
        filecontent: artifact.content.toString("base64"),
        principal,
    };
}

function containsFailure(result) {
    if (Array.isArray(result)) {
        return result.some(containsFailure);
    }
    if (result && typeof result === "object") {
        return Object.values(result).some(containsFailure);
    }
    return /(?:^|[,;\s])ok=false(?:$|[,;\s])/i.test(String(result));
}

function isProcessVersionNotFoundMessage(value) {
    const message = String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    return [
        /\bprocess version (?:was )?not found\b/,
        /\b(?:workflow )?process (?:was )?not found\b/,
        /\bprocess(?: version)? (?:does not|doesn't) exist\b/,
        /\bprocesso nao (?:foi )?encontrad[oa]\b/,
        /\bversao (?:do |de )?processo nao (?:foi )?encontrad[oa]\b/,
        /\bprocesso(?: de workflow)? nao existe\b/,
    ].some(pattern => pattern.test(message));
}

function containsProcessVersionNotFound(value, seen = new Set()) {
    if (value === null || value === undefined) {
        return false;
    }
    if (typeof value !== "object") {
        return isProcessVersionNotFoundMessage(value);
    }
    if (seen.has(value)) {
        return false;
    }
    seen.add(value);

    for (const property of Object.getOwnPropertyNames(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, property);
        if (descriptor && "value" in descriptor && containsProcessVersionNotFound(descriptor.value, seen)) {
            return true;
        }
    }
    return false;
}

// POST direto nos endpoints fixos (core/fluig-client/soap), sem baixar o WSDL a cada chamada.
class FetchSoapGateway {
    constructor(fetchImpl) {
        this.fetchImpl = fetchImpl;
    }

    async getToken(baseUrl, login, password) {
        return soapCall({
            baseUrl,
            service: "TokenService",
            namespace: TOKEN_NAMESPACE,
            operation: "getToken",
            parts: { login, password },
            fetchImpl: this.fetchImpl,
        });
    }

    async createWorkflowClient(baseUrl) {
        return { baseUrl };
    }

    async invoke(client, operation, params) {
        return soapCall({
            baseUrl: client.baseUrl,
            service: "WorkflowEngineService",
            namespace: WORKFLOW_NAMESPACE,
            operation,
            soapAction: SOAP_ACTIONS[operation],
            parts: params,
            fetchImpl: this.fetchImpl,
        });
    }
}

class FluigProcessExportService {
    constructor(gateway = new FetchSoapGateway()) {
        this.gateway = gateway;
    }

    prepare(server, options) {
        const baseUrl = normalizeBaseUrl(server.baseUrl);
        const companyId = Number(server.companyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            throw new Error("companyId deve ser um inteiro positivo.");
        }
        const processId = requiredString(options.processId, "processId");
        const colleagueId = requiredString(server.userCode, "userCode/colleagueId");
        assertGeneratedArtifactsFresh(options.processPath, options.ecm30Path, options.svgPath);
        const ecm30 = loadXmlArtifact(options.ecm30Path, "list");
        const svg = loadXmlArtifact(options.svgPath, "svg");
        const newProcess = options.newProcess === true;
        const release = options.release !== false;
        const attachments = [buildAttachment(ecm30, true, false), buildAttachment(svg, false, true)];

        const operationNames = ["getToken"];
        if (!newProcess) {
            operationNames.push("createWorkFlowProcessVersion");
        }
        operationNames.push("importProcess");
        if (release) {
            operationNames.push("releaseProcess");
        }
        if (newProcess) {
            operationNames.push("getAllProcessAvailableToExport");
        }
        operationNames.push("getWorkFlowProcessVersion");

        return {
            baseUrl,
            companyId,
            processId,
            colleagueId,
            newProcess,
            release,
            attachments,
            artifacts: [ecm30, svg].map(artifact => ({
                path: artifact.path,
                fileName: artifact.fileName,
                root: artifact.root,
                normalizedSize: artifact.content.length,
                sha256: artifact.sha256,
            })),
            steps: operationNames.map((name, index) => ({
                order: index + 1,
                name,
                soapAction: SOAP_ACTIONS[name],
                mutating: [
                    "createWorkFlowProcessVersion",
                    "importProcess",
                    "releaseProcess",
                ].includes(name),
            })),
        };
    }

    async export(server, options) {
        const prepared = this.prepare(server, options);
        if (options.dryRun !== false) {
            return {
                dryRun: true,
                exportRequestsSent: false,
                ...prepared,
                attachments: undefined,
            };
        }

        const login = requiredString(server.username, "username");
        const password = requiredString(server.password, "password");
        const token = await this.gateway.getToken(prepared.baseUrl, login, password);
        if (typeof token !== "string" || token.trim() === "" || token.includes("UT010031")) {
            throw new Error("TokenService nao retornou um token valido.");
        }

        const client = await this.gateway.createWorkflowClient(prepared.baseUrl);
        const common = {
            username: token,
            password: "",
            companyId: prepared.companyId,
            processId: prepared.processId,
        };
        const results = [{ name: "getToken", result: "TOKEN_REDACTED" }];

        let effectiveNewProcess = prepared.newProcess;
        let modeAdjusted = false;
        if (!effectiveNewProcess) {
            try {
                const createVersionResult = await this.gateway.invoke(
                    client,
                    "createWorkFlowProcessVersion",
                    common
                );
                if (containsProcessVersionNotFound(createVersionResult)) {
                    effectiveNewProcess = true;
                    modeAdjusted = true;
                } else {
                    if (containsFailure(createVersionResult)) {
                        throw new Error(
                            `Falha ao criar nova versao do processo: ${JSON.stringify(createVersionResult)}`
                        );
                    }
                    results.push({
                        name: "createWorkFlowProcessVersion",
                        result: createVersionResult,
                    });
                }
            } catch (error) {
                if (!containsProcessVersionNotFound(error)) {
                    throw error;
                }
                effectiveNewProcess = true;
                modeAdjusted = true;
            }
        }
        if (modeAdjusted) {
            results.push({
                name: "detectProcessMode",
                result: "PROCESS_NOT_FOUND; importing as new process",
            });
        }

        const importResult = await this.gateway.invoke(client, "importProcess", {
            ...common,
            attachments: { item: prepared.attachments },
            newProcess: effectiveNewProcess,
            overWrite: true,
            colleagueId: prepared.colleagueId,
        });
        if (containsFailure(importResult)) {
            throw new Error(`Falha ao importar processo: ${JSON.stringify(importResult)}`);
        }
        results.push({ name: "importProcess", result: importResult });

        if (prepared.release) {
            const releaseResult = await this.gateway.invoke(client, "releaseProcess", common);
            if (containsFailure(releaseResult)) {
                throw new Error(`Falha ao liberar processo: ${JSON.stringify(releaseResult)}`);
            }
            results.push({ name: "releaseProcess", result: releaseResult });
        }

        if (effectiveNewProcess) {
            results.push({
                name: "getAllProcessAvailableToExport",
                result: await this.gateway.invoke(
                    client,
                    "getAllProcessAvailableToExport",
                    {
                        username: token,
                        password: "",
                        companyId: prepared.companyId,
                    }
                ),
            });
        }

        const versionResult = await this.gateway.invoke(
            client,
            "getWorkFlowProcessVersion",
            common
        );
        const version = Number(versionResult);
        if (!Number.isInteger(version) || version < 1) {
            throw new Error(`Versao invalida retornada pelo Fluig: ${versionResult}`);
        }
        results.push({ name: "getWorkFlowProcessVersion", result: version });

        return {
            dryRun: false,
            exportRequestsSent: true,
            processId: prepared.processId,
            version,
            newProcess: effectiveNewProcess,
            modeAdjusted,
            results,
        };
    }
}

module.exports = {
    ARTIFACT_TIMESTAMP_TOLERANCE_MS,
    FluigProcessExportService,
    FetchSoapGateway,
    SOAP_ACTIONS,
    assertGeneratedArtifactsFresh,
    buildAttachment,
    containsFailure,
    containsProcessVersionNotFound,
    getXmlRoot,
    loadXmlArtifact,
    normalizeStudioText,
};
