"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");

const { generateEcm30 } = require("../../src/core/ecm30/generate");

// Goldens gerados pela ponte Java (JARs do Fluig Studio 2.0.0.9) sobre as fixtures públicas do upstream:
// 41 processos × 9 versões + "null" (servidor de versão desconhecida).
const bundle = JSON.parse(zlib.brotliDecompressSync(Buffer.from(
    fs.readFileSync(path.join(__dirname, "fixtures", "ecm30-public.json.br.b64"), "ascii").replace(/\s+/g, ""),
    "base64"
)).toString("utf8"));
const main = bundle.processes.toexportbpmnteste;

// A ponte grava WorkflowProcessEvent em ordem de tabela hash: compara a lista como conjunto.
function normalizeEvents(xml) {
    const blocks = [];
    const rest = xml.replace(/ {4}<WorkflowProcessEvent>[\s\S]*?<\/WorkflowProcessEvent>\n/g, block => {
        blocks.push(block);
        return "";
    });
    return `${rest}\n${blocks.sort().join("")}`;
}

function generate(name, version, processText = bundle.processes[name].processText) {
    return generateEcm30({ processText, baseName: name, events: bundle.processes[name].events }, version);
}

test("gera o ECM30 igual ao do Fluig Studio para as fixtures públicas em todas as versões", () => {
    const failures = [];
    let total = 0;
    for (const version of bundle.versions) {
        for (const name of Object.keys(bundle.processes)) {
            total += 1;
            const actual = generate(name, version === "null" ? undefined : version).xml;
            if (normalizeEvents(actual) !== normalizeEvents(bundle.goldens[version][name])) {
                failures.push(`${name} @ ${version}`);
            }
        }
    }
    assert.equal(total, 410);
    assert.deepEqual(failures, []);
});

test("WorkflowProcessEvent sai ordenado por eventId (a ponte usa ordem de tabela hash)", () => {
    const ids = [...generate("toexportbpmnteste", "2.0.0").xml.matchAll(/<eventId>([^<]+)<\/eventId>/g)].map(match => match[1]);
    assert.deepEqual(ids, [...ids].sort());
    assert.ok(ids.includes("POR_LITERALS"));
});

test("avisa o que o servidor antigo ignora e quando a versão é desconhecida", () => {
    const old = generate("toexportbpmnteste", "1.4.4").warnings;
    assert.ok(old.some(warning => /ProcessAppConfiguration ignorado: exige Fluig 1\.6\.2/.test(warning)), old.join("\n"));
    assert.ok(old.some(warning => /é automática, o que exige Fluig 1\.5\.9/.test(warning)), old.join("\n"));
    // A fixture vincula um formulário local ("t123"): vai como 0 e o servidor atribui o id.
    assert.deepEqual(generate("toexportbpmnteste", "2.0.0").warnings, [
        'Formulário "t123" não é um id numérico; formId vai como 0 (formulário local).',
    ]);
    assert.ok(generate("toexportbpmnteste", undefined).warnings.some(warning => /desconhecida/.test(warning)));
});

test("recusa processo sem evento inicial", () => {
    const text = main.processText.replace(/^\s*<bpmn2:BpmnStartEvent [^\n]*\n/gm, "");
    assert.throws(() => generate("toexportbpmnteste", "2.0.0", text), /não possui um evento inicial/);
});

test("recusa atividade manual sem exatamente uma saída", () => {
    const text = main.processText.replace(/(<bpmn2:BpmnTask id="manualtask52"[^>]*?) outgoing="flow54"/, "$1");
    assert.throws(() => generate("toexportbpmnteste", "2.0.0", text), /atividade manual .* precisa ter exatamente uma saída/);
});

test("recusa nó de fluxo sem forma no diagrama", () => {
    const text = main.processText.replace(/businessObjects="servicetask11"/g, 'businessObjects="naoexiste"');
    assert.throws(() => generate("toexportbpmnteste", "2.0.0", text), /"servicetask11" não tem forma no diagrama/);
});
