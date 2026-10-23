"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { pk, versionLess, writeEcm30 } = require("../../src/core/ecm30/writer");

test("serializa como o XStream: 2 espaços, LF, sem declaração, nulo omitido e lista vazia fechada", () => {
    const warnings = new Set();
    const xml = writeEcm30([
        { tag: "ProcessFormField", processFormFieldPK: pk("processFormFieldPK", 1, "P", "campo"), fieldDescription: "", slotId: 1 },
        [],
        [{ tag: "WorkflowProcessEvent", workflowProcessEventPK: pk("workflowProcessEventPK", 1, "ev", "P", 1), eventDescription: null, managedScript: false }],
    ], "2.0.0", warnings);
    assert.equal(xml, [
        "<list>",
        "  <ProcessFormField>",
        "    <processFormFieldPK>",
        "      <companyId>1</companyId>",
        "      <processId>P</processId>",
        "      <fieldId>campo</fieldId>",
        "    </processFormFieldPK>",
        "    <fieldDescription></fieldDescription>",
        "    <slotId>1</slotId>",
        "  </ProcessFormField>",
        "  <list/>",
        "  <list>",
        "    <WorkflowProcessEvent>",
        "      <workflowProcessEventPK>",
        "        <companyId>1</companyId>",
        "        <eventId>ev</eventId>",
        "        <processId>P</processId>",
        "        <version>1</version>",
        "      </workflowProcessEventPK>",
        "      <managedScript>false</managedScript>",
        "    </WorkflowProcessEvent>",
        "  </list>",
        "</list>",
    ].join("\n"));
    assert.deepEqual([...warnings], []);
});

test("escapa como o XStream: aspas, apóstrofo e \\r viram entidade; tab e \\n ficam crus", () => {
    const xml = writeEcm30([{ tag: "ProcessFormField", processFormFieldPK: null, fieldDescription: "a&<b> \"c\" 'd'\r\n\te", slotId: 1 }], "2.0.0", new Set());
    assert.match(xml, /<fieldDescription>a&amp;&lt;b&gt; &quot;c&quot; &apos;d&apos;&#xd;\n\te<\/fieldDescription>/);
});

test("omite campo de versão mais nova e avisa só quando ele tinha valor", () => {
    const link = defaultLink => ({ tag: "ProcessLink", processLinkPK: null, actionLabel: "", defaultLink, type: 0 });
    const warnings = new Set();
    assert.doesNotMatch(writeEcm30([link(true), link(false)], "1.5.9", warnings), /defaultLink/);
    assert.deepEqual([...warnings], ["ProcessLink.defaultLink ignorado: exige Fluig 1.6.0 (servidor 1.5.9)."]);
    assert.match(writeEcm30([link(true)], "1.6.0", new Set()), /<defaultLink>true<\/defaultLink>/);
    const unknown = new Set();
    assert.match(writeEcm30([link(true)], undefined, unknown), /<defaultLink>true<\/defaultLink>/);
    assert.deepEqual([...unknown], []);
});

test("compara versões numericamente", () => {
    assert.equal(versionLess("1.5.9", "1.5.12"), true);
    assert.equal(versionLess("1.5.12", "1.5.9"), false);
    assert.equal(versionLess("1.6.5", "1.6.5"), false);
    assert.equal(versionLess("1.8.2", "2.0.0"), true);
});
