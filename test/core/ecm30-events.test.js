"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { readEcm30Events } = require("../../src/core/ecm30/events");

function project(t, files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ecm30-events-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const [name, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, "workflow", name)), { recursive: true });
        fs.writeFileSync(path.join(root, "workflow", name), content);
    }
    return path.join(root, "workflow", "diagrams", "proc.process");
}

test("lê scripts e literais do processo, ordenados por eventId, com o conteúdo exato", t => {
    const processPath = project(t, {
        "diagrams/proc.process": "",
        "scripts/proc.beforeTaskSave.js": "﻿function beforeTaskSave() {\r\n}\r\n",
        "scripts/proc.afterProcessFinish.js": "var a = \"Conclusão\";",
        "scripts/outro.afterProcessFinish.js": "ignorado",
        "literals/proc_pt_BR.properties": "titulo=Solicitação\n",
        "literals/proc_en_US.properties": Buffer.from("titulo=Solicitação\n", "latin1"),
    });
    assert.deepEqual(readEcm30Events(processPath), [
        { eventId: "ENG_LITERALS", content: "titulo=Solicitação\n" },
        { eventId: "POR_LITERALS", content: "titulo=Solicitação\n" },
        { eventId: "afterProcessFinish", content: "var a = \"Conclusão\";" },
        { eventId: "beforeTaskSave", content: "function beforeTaskSave() {\r\n}\r\n" },
    ]);
});

test("literal vence script de mesmo eventId e processo sem pastas não tem eventos", t => {
    const processPath = project(t, {
        "diagrams/proc.process": "",
        "scripts/proc.POR_LITERALS.js": "script",
        "literals/proc_pt_BR.properties": "literal",
    });
    assert.deepEqual(readEcm30Events(processPath), [{ eventId: "POR_LITERALS", content: "literal" }]);
    assert.deepEqual(readEcm30Events(project(t, { "diagrams/proc.process": "" })), []);
});
