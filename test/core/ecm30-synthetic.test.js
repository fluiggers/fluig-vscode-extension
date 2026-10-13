"use strict";

// Tipos sem golden em nenhum corpus (subprocesso, sinais, timer, mensagem, gateway de evento, anotação,
// documento, grupo, segurança de anexos): confere as regras de docs/research/02 §6, sem oráculo.
const assert = require("node:assert/strict");
const test = require("node:test");

const { encodeXmlAttribute } = require("../../src/bpmn/xmlTokenizer");
const { generateEcm30 } = require("../../src/core/ecm30/generate");

const attributes = values => Object.entries(values).map(([name, value]) => `${name}="${encodeXmlAttribute(value)}"`).join(" ");
const xs = (root, body) => `<${root}>\n  ${body}\n</${root}>`;
const extended = (name, value) => xs("list", xs("org.eclipse.bpmn2.impl.ExtendedPropertyImpl",
    `<propertyName>${name}</propertyName><propertyType>0</propertyType><propertyDescription>d</propertyDescription>`
    + `<propertyValue>${value}</propertyValue><isDefaultProperty>false</isDefaultProperty>`));

const NODES = [
    ["BpmnPool", { id: "bpmnpool1", name: "P", cores: "FFFFFF" }, [0, 0, 900, 400]],
    ["BpmnSwimLane", { id: "bpmnswimlane2", name: "L" }, [30, 0, 870, 400], "bpmnpool1"],
    ["BpmnGroup", { id: "bpmngroup40", name: "G" }, [500, 300, 100, 50]],
    ["BpmnStartEvent", { id: "startsignal3", name: "S", type: "14", signalId: "7", extendedFields: extended("instruction", "via ext") }, [50, 50, 35, 35]],
    ["BpmnStartEvent", {
        id: "starttimer4", name: "T", type: "12", signalId: "0",
        trigger: xs("org.eclipse.bpmn2.documentacional.BpmnTriggerData", "<runType>WEEK_DAY</runType><timeTrigger>3:0:0</timeTrigger><diaSemana>MON,TUE</diaSemana><isCondition>false</isCondition>"),
        initializerConfiguration: xs("org.eclipse.bpmn2.impl.AssignmentControllerAssociated", "<type>AND</type><controllers>"
            + "<org.eclipse.bpmn2.impl.AssignmentControllerRole><roleId>admin</roleId><mechanismName>Papel</mechanismName></org.eclipse.bpmn2.impl.AssignmentControllerRole>"
            + "</controllers><mechanismName>Associado</mechanismName>"),
    }, [50, 150, 35, 35]],
    ["BpmnTask", { id: "manualtask5", name: "M", type: "85", outgoing: "flow20", selecionaColaboradores: "1", authNotify: "true" }, [150, 50, 106, 56]],
    ["BpmnTask", {
        id: "mailtask6", name: "Mail", type: "84",
        messageData: xs("org.eclipse.bpmn2.documentacional.BpmnMessageData", "<type>1</type><receiver>a@b</receiver><subject>s</subject><content>c</content>"),
    }, [300, 50, 106, 56]],
    ["BpmnSubProcess", {
        id: "subprocess7", name: "Sub", type: "100", process: "outroProc", selectColleague: "0", loopType: "0",
        formMaps: xs("list", xs("org.eclipse.bpmn2.impl.BpmnProcessFormMap", "<processField>a</processField><subProcessField>b</subProcessField><mapFlow>1</mapFlow>")),
    }, [450, 50, 106, 56]],
    ["BpmnGateway", { id: "exclusiveeventgateway9", name: "EG", type: "123", outgoing: "flow21" }, [150, 200, 60, 86]],
    ["BpmnGateway", { id: "eventgateway10", name: "EV", type: "122" }, [250, 200, 60, 86]],
    ["BpmnIntermediateEvent", { id: "intermediatesignal11", name: "IS", type: "37", signalId: "5", sequenceAttached: "0" }, [350, 200, 35, 35]],
    ["BpmnIntermediateEvent", {
        id: "intermediatesignalreceive12", name: "IR", type: "41", signalId: "0", sequenceAttached: "0",
        triggers: xs("list", "<org.eclipse.bpmn2.documentacional.BpmnSignalData><signalId>9</signalId></org.eclipse.bpmn2.documentacional.BpmnSignalData>"
            + "<org.eclipse.bpmn2.documentacional.BpmnTriggerData><scriptCondition>synth.intermediatesignalreceive12.js</scriptCondition><isCondition>true</isCondition></org.eclipse.bpmn2.documentacional.BpmnTriggerData>"),
    }, [450, 200, 35, 35]],
    ["BpmnEndEvent", { id: "endsignal13", name: "E1", type: "64", signalId: "3", incoming: "flow20" }, [700, 200, 35, 35]],
    ["BpmnEndEvent", { id: "enderror14", name: "E2", type: "63", signalId: "0" }, [700, 300, 35, 35]],
    ["BpmnAnnotation", { id: "annotationtask15", name: "nota" }, [50, 300, 100, 40]],
    ["BpmnDocument", { id: "documenttask16", name: "doc", documentId: "321" }, [200, 300, 40, 50]],
    ["BpmnProcess", {
        id: "synth", name: "Sintético", version: "3", extendedFields: extended("AutomaticTasks", "true"), cardIndex: "55", formType: "FORM_BUILDER",
        processAttachmentSecurity: xs("list", xs("org.eclipse.bpmn2.ECMProcessAttachmentSecurityImpl",
            '<sequence>2</sequence><engineAllocationId>Papel</engineAllocationId><engineAllocationConfiguration class="org.eclipse.bpmn2.impl.AssignmentControllerRole">'
            + "<roleId>r</roleId><mechanismName>Papel</mechanismName></engineAllocationConfiguration><accessLevel>1</accessLevel><editionMode>true</editionMode>")),
    }],
    ["SequenceFlow", { id: "flow20", name: "", sourceRef: "manualtask5", targetRef: "endsignal13", permiteRetorno: "true", atividadeFluxo: "Ir" }],
    ["SequenceFlow", { id: "flow21", name: "x", sourceRef: "exclusiveeventgateway9", targetRef: "intermediatesignal11" }],
    ["SequenceFlow", { id: "flow22", name: "", sourceRef: "annotationtask15", targetRef: "manualtask5" }],
];

function syntheticProcess() {
    const shape = (id, [x, y, width, height], inner = "") => `<children xsi:type="pi:ContainerShape"><graphicsAlgorithm xsi:type="al:Rectangle" x="${x}" y="${y}" width="${width}" height="${height}"/><link businessObjects="${id}"/>${inner}</children>`;
    const lanes = NODES.filter(node => node[3]);
    const shapes = NODES.filter(node => node[2] && !node[3])
        .map(node => shape(node[1].id, node[2], lanes.filter(lane => lane[3] === node[1].id).map(lane => shape(lane[1].id, lane[2])).join("")))
        .join("");
    // Bendpoint negativo: o Studio desloca todas as posições exportadas (02 §6.1).
    const connections = NODES.filter(node => node[0] === "SequenceFlow")
        .map(node => `<connections xsi:type="pi:FreeFormConnection"><link businessObjects="${node[1].id}"/><bendpoints x="-20" y="5"/></connections>`)
        .join("");
    return '<?xml version="1.0" encoding="ASCII"?>\n<xmi:XMI xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI" xmlns:xsi="x" xmlns:al="a" xmlns:bpmn2="b" xmlns:pi="p">\n'
        + `<pi:Diagram name="synth">${shapes}${connections}</pi:Diagram>\n`
        + NODES.map(([tag, values]) => `<bpmn2:${tag} ${attributes(values)}/>`).join("\n")
        + "\n</xmi:XMI>";
}

const generate = version => generateEcm30({ processText: syntheticProcess(), baseName: "synth", events: [{ eventId: "beforeTaskSave", content: "a\r\nb\u0001" }] }, version);
const blocks = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g"))].map(match => match[0]);
const value = (block, name) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(block)?.[1];
const stateOf = (xml, sequence) => blocks(xml, "ProcessState").find(block => value(block, "sequence") === String(sequence));

test("gera os tipos sem fixture pelas regras da pesquisa", () => {
    const xml = generate("2.0.0").xml;
    // Deslocamento pelo bendpoint x=-20.
    assert.equal(value(stateOf(xml, 3), "positionX"), "70");
    // Início por sinal: descrição fixa, sinal e instrução vinda de campo estendido.
    assert.equal(value(stateOf(xml, 3), "stateDescription"), "Inicio Sinal 7");
    assert.equal(value(stateOf(xml, 3), "signalId"), "7");
    assert.equal(value(stateOf(xml, 3), "instruction"), "via ext");
    // Gateway de evento exclusivo sem entrada: estado e link de início fakes (02 §6.5).
    assert.equal(value(stateOf(xml, 17), "stateName"), "Inicio_17");
    assert.ok(blocks(xml, "ProcessLink").some(block => value(block, "initialStateSequence") === "17" && value(block, "finalStateSequence") === "9"));
    // Gateway de evento sem entrada: estado inicial.
    assert.equal(value(stateOf(xml, 10), "initialState"), "true");
    // Subprocesso, anotação, documento, associação e mapa de campos.
    assert.equal(value(stateOf(xml, 7), "subProcessId"), "outroProc");
    assert.deepEqual(blocks(xml, "ProcessComponGraf").map(block => [value(block, "componType"), value(block, "stateName")]), [["1", "nota"], ["2", "321"]]);
    assert.equal(blocks(xml, "ProcessLinkAssoc").length, 1);
    assert.equal(value(blocks(xml, "SubProcessFieldRelationship")[0], "mapFlow"), "1");
    // Condições de evento, mensagem e segurança de anexos.
    assert.equal(value(blocks(xml, "ProcessStateConditionSignal")[0], "signalId"), "9");
    assert.equal(value(blocks(xml, "ProcessStateConditionScript")[0], "script"), "intermediatesignalreceive12");
    assert.match(xml, /<value>&lt;BpmnMessageData&gt;&lt;Type&gt;1&lt;\/Type&gt;/);
    assert.match(blocks(xml, "ProcessAttachmentSecurity")[0], /<engineAllocationConfiguration>&lt;AssignmentController&gt;&lt;Role&gt;r&lt;\/Role&gt;/);
    assert.match(xml, /ConditionAssociated=&quot;AND&quot;/);
    // Form Builder (2.0.0), propriedades avançadas e escape de controles.
    assert.equal(value(blocks(xml, "ProcessDefinitionVersion")[0], "formIdV2"), "55");
    assert.equal(value(blocks(xml, "AdvancedProcessProperties")[0], "propertieValue"), "true");
    assert.match(xml, /<eventDescription>a&#xd;\nb&#x1;<\/eventDescription>/);
});

test("abaixo da 2.0.0 o formulário vai só em formId", () => {
    const definitionVersion = blocks(generate("1.8.2").xml, "ProcessDefinitionVersion")[0];
    assert.equal(value(definitionVersion, "formId"), "55");
    assert.equal(value(definitionVersion, "formIdV2"), undefined);
});
