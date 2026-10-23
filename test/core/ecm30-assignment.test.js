"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { convertAssignment, parseXs } = require("../../src/core/ecm30/assignment");

const controller = (cls, body) => parseXs(`<org.eclipse.bpmn2.impl.AssignmentController${cls}>\n  ${body}\n</org.eclipse.bpmn2.impl.AssignmentController${cls}>`);
const seqOf = id => ({ task5: 5 })[id];

test("converte os mecanismos de atribuição para a configuração do servidor", () => {
    assert.equal(convertAssignment(controller("Group", "<groupId>G1</groupId>\n  <mechanismName>Grupo</mechanismName>"), seqOf),
        "<AssignmentController><Group>G1</Group></AssignmentController>");
    assert.equal(convertAssignment(controller("PoolRole", "<roleId>gestor</roleId>"), seqOf),
        "<AssignmentController><Role>gestor</Role></AssignmentController>");
    assert.equal(convertAssignment(controller("Colleague", "<colleagueId>u1</colleagueId>"), seqOf),
        "<AssignmentController><User>u1</User></AssignmentController>");
    assert.equal(convertAssignment(controller("FormField", "<formField>responsavel</formField>"), seqOf),
        "<AssignmentController><FormField>responsavel</FormField></AssignmentController>");
    assert.equal(convertAssignment(controller("ColleagueGroup", "<colleagueId>u1</colleagueId><onlyWorkGroup>true</onlyWorkGroup>"), seqOf),
        "<AssignmentController><GroupsOf>u1</GroupsOf><OnlyWorkGroup>ON</OnlyWorkGroup><IncludeCommunityGroups>OFF</IncludeCommunityGroups></AssignmentController>");
});

test("Grupo sem groupId gera configuração vazia (02 §3.3)", () => {
    assert.equal(convertAssignment(controller("Group", "<mechanismName>Grupo</mechanismName>"), seqOf), "");
    assert.equal(convertAssignment(controller("PoolGroup", "<mechanismName>Pool Grupo</mechanismName>"), seqOf), "");
});

test("Executor Atividade usa a sequence do nó e grava null quando o nó não existe", () => {
    assert.equal(convertAssignment(controller("ExecutorMechanism", "<idNode>task5</idNode><returns>1</returns>"), seqOf),
        "<AssignmentController><BaseActivity>5</BaseActivity><Returns>Last</Returns></AssignmentController>");
    assert.equal(convertAssignment(controller("ExecutorMechanism", "<idNode>sumiu9</idNode><returns>2</returns>"), seqOf),
        "<AssignmentController><BaseActivity>null</BaseActivity><Returns>All</Returns></AssignmentController>");
});

test("Associado aninha os mecanismos e mecanismo customizado vira configuração vazia", () => {
    const associated = controller("Associated", [
        "<type>AND</type>",
        '<controllers class="list">',
        "<org.eclipse.bpmn2.impl.AssignmentControllerRole><roleId>gestor</roleId><mechanismName>Papel</mechanismName></org.eclipse.bpmn2.impl.AssignmentControllerRole>",
        "<org.eclipse.bpmn2.impl.AssignmentControllerColleague><colleagueId>u1</colleagueId><mechanismName>Usuário</mechanismName></org.eclipse.bpmn2.impl.AssignmentControllerColleague>",
        "</controllers>",
    ].join(""));
    assert.equal(convertAssignment(associated, seqOf),
        '<AssociatedController ConditionAssociated="AND">'
        + '<ControlXML TypeAssociated="Papel"><AssignmentController><Role>gestor</Role></AssignmentController></ControlXML>'
        + '<ControlXML TypeAssociated="Usuário"><AssignmentController><User>u1</User></AssignmentController></ControlXML>'
        + "</AssociatedController>");
    assert.equal(convertAssignment(controller("Custom", "<mechanismName>mec_area</mechanismName>"), seqOf), "");
    assert.equal(convertAssignment(null, seqOf), null);
});

test("recusa payload no formato antigo do java.beans.XMLDecoder com mensagem clara", () => {
    assert.throws(() => parseXs('<?xml version="1.0"?><java version="1.6"/>'), /XMLDecoder .* não suportado/);
    assert.equal(parseXs(""), null);
});
