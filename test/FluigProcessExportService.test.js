"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
    FluigProcessExportService,
    SOAP_ACTIONS,
    loadXmlArtifact,
    normalizeStudioText,
    assertGeneratedArtifactsFresh,
} = require("../src/services/FluigProcessExportService");

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fluig-process-export-"));
    const ecm30Path = path.join(root, "PROC_TESTE.ecm30.xml");
    const processPath = path.join(root, "PROC_TESTE.process");
    const svgPath = path.join(root, "PROC_TESTE.processimage.svg");
    fs.writeFileSync(
        processPath,
        '<xmi:XMI xmlns:xmi="http://www.omg.org/XMI"></xmi:XMI>',
        "utf8"
    );
    fs.writeFileSync(
        ecm30Path,
        '<?xml version="1.0" encoding="UTF-8"?>\r\n<list>\r\n  <string>ok</string>\r\n</list>\r\n',
        "utf8"
    );
    fs.writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg">\r\n</svg>\r\n');
    const generatedAt = new Date(Date.now() + 2000);
    fs.utimesSync(ecm30Path, generatedAt, generatedAt);
    fs.utimesSync(svgPath, generatedAt, generatedAt);
    return { root, processPath, ecm30Path, svgPath };
}

function server(overrides = {}) {
    return {
        baseUrl: "http://fluig.example:8080",
        companyId: 1,
        username: "admin",
        password: "secret",
        userCode: "user.001",
        ...overrides,
    };
}

function options(files, overrides = {}) {
    return {
        processId: "PROC_TESTE",
        processPath: files.processPath,
        ecm30Path: files.ecm30Path,
        svgPath: files.svgPath,
        newProcess: false,
        release: true,
        dryRun: true,
        ...overrides,
    };
}

class FakeGateway {
    constructor() {
        this.calls = [];
    }

    async getToken(baseUrl, login, password) {
        this.calls.push({ operation: "getToken", baseUrl, login, password });
        return "TOKEN_TESTE";
    }

    async createWorkflowClient(baseUrl) {
        this.calls.push({ operation: "createWorkflowClient", baseUrl });
        return { fake: true };
    }

    async invoke(_client, operation, params) {
        this.calls.push({ operation, params });
        if (operation === "getWorkFlowProcessVersion") {
            return 7;
        }
        if (operation === "releaseProcess") {
            return "ok=true";
        }
        if (operation === "getAllProcessAvailableToExport") {
            return { item: [] };
        }
        return "OK";
    }
}

test("dry-run monta a sequencia existente sem acessar a rede", async t => {
    const files = fixture();
    t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
    const gateway = new FakeGateway();
    const service = new FluigProcessExportService(gateway);

    const result = await service.export(server(), options(files));

    assert.equal(result.dryRun, true);
    assert.equal(result.exportRequestsSent, false);
    assert.deepEqual(gateway.calls, []);
    assert.deepEqual(
        result.steps.map(step => step.name),
        [
            "getToken",
            "createWorkFlowProcessVersion",
            "importProcess",
            "releaseProcess",
            "getWorkFlowProcessVersion",
        ]
    );
    assert.equal(result.steps[3].soapAction, "relaseProcess");
    assert.equal(SOAP_ACTIONS.releaseProcess, "relaseProcess");
    assert.equal(result.artifacts[0].root, "list");
    assert.equal(result.artifacts[1].root, "svg");
});

test("execucao usa token, senha vazia e parametros observados no Eclipse", async t => {
    const files = fixture();
    t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
    const gateway = new FakeGateway();
    const service = new FluigProcessExportService(gateway);

    const result = await service.export(server(), options(files, { dryRun: false }));

    assert.equal(result.version, 7);
    assert.deepEqual(
        gateway.calls.map(call => call.operation),
        [
            "getToken",
            "createWorkflowClient",
            "createWorkFlowProcessVersion",
            "importProcess",
            "releaseProcess",
            "getWorkFlowProcessVersion",
        ]
    );
    const importCall = gateway.calls.find(call => call.operation === "importProcess");
    assert.equal(importCall.params.username, "TOKEN_TESTE");
    assert.equal(importCall.params.password, "");
    assert.equal(importCall.params.companyId, 1);
    assert.equal(importCall.params.processId, "PROC_TESTE");
    assert.equal(importCall.params.newProcess, false);
    assert.equal(importCall.params.overWrite, true);
    assert.equal(importCall.params.colleagueId, "user.001");
    assert.equal(importCall.params.attachments.item.length, 2);
    assert.equal(importCall.params.attachments.item[0].principal, true);
    assert.equal(importCall.params.attachments.item[1].attach, true);
    assert.equal(importCall.params.attachments.item[1].principal, false);
});

test("processo novo pula criacao de versao e recarrega a lista", async t => {
    const files = fixture();
    t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
    const gateway = new FakeGateway();
    const service = new FluigProcessExportService(gateway);

    await service.export(
        server(),
        options(files, { dryRun: false, newProcess: true, release: false })
    );

    assert.deepEqual(
        gateway.calls.map(call => call.operation),
        [
            "getToken",
            "createWorkflowClient",
            "importProcess",
            "getAllProcessAvailableToExport",
            "getWorkFlowProcessVersion",
        ]
    );
});

test("falha quando importProcess retorna ok=false", async t => {
    const files = fixture();
    t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
    const gateway = new FakeGateway();
    gateway.invoke = async function (_client, operation, params) {
        this.calls.push({ operation, params });
        if (operation === "importProcess") {
            return { item: ["processo=PROC_TESTE,ok=false,erro=validacao"] };
        }
        return "OK";
    };
    const service = new FluigProcessExportService(gateway);

    await assert.rejects(
        service.export(server(), options(files, { dryRun: false })),
        /Falha ao importar processo/
    );
});

test("falha quando releaseProcess retorna ok=false", async t => {
    const files = fixture();
    t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
    const gateway = new FakeGateway();
    gateway.invoke = async function (_client, operation, params) {
        this.calls.push({ operation, params });
        if (operation === "releaseProcess") {
            return "processo=PROC_TESTE,ok=false,erro=validacao";
        }
        if (operation === "getWorkFlowProcessVersion") {
            return 7;
        }
        return "OK";
    };
    const service = new FluigProcessExportService(gateway);

    await assert.rejects(
        service.export(server(), options(files, { dryRun: false })),
        /Falha ao liberar processo/
    );
});

test("rejeita arquivo .process XMI no lugar do ecm30", t => {
    const files = fixture();
    t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
    const processPath = path.join(files.root, "PROC_TESTE.process");
    fs.writeFileSync(
        processPath,
        '<xmi:XMI xmlns:xmi="http://www.omg.org/XMI"></xmi:XMI>',
        "utf8"
    );

    assert.throws(() => loadXmlArtifact(processPath, "list"), /\.process\/XMI/);
});

test("normaliza quebras de linha como o Fluig Studio", () => {
    const normalized = normalizeStudioText(Buffer.from("a\r\n\r\nb\r\n", "utf8"));
    assert.equal(normalized.toString("utf8"), "a\n\nb");
});

test("recusa ecm30 ausente ou mais antigo que o arquivo process", t => {
    const files = fixture();
    t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));

    const changedAt = new Date(Date.now() + 5000);
    fs.utimesSync(files.processPath, changedAt, changedAt);
    assert.throws(
        () => assertGeneratedArtifactsFresh(files.processPath, files.ecm30Path, files.svgPath),
        /ecm30\.xml desatualizado/
    );

    fs.rmSync(files.ecm30Path);
    assert.throws(
        () => assertGeneratedArtifactsFresh(files.processPath, files.ecm30Path),
        /ainda nao foi gerado/
    );
});

test("aceita artefatos gerados depois do process", t => {
    const files = fixture();
    t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
    assert.doesNotThrow(() => (
        assertGeneratedArtifactsFresh(files.processPath, files.ecm30Path, files.svgPath)
    ));
});
