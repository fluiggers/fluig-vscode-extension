'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { durationToMinutes, messageDataValues, patchLayout, patchProcess } = require('../../src/bpmn/processPatcher');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

test('mantem propriedades de esforco somente para leitura em todos os elementos', () => {
  for (const property of ['esforcoCalculo', 'esforcoPrevisto']) {
    assert.throws(
      () => patchProcess(fixture, 'task5', { [property]: '1' }),
      /pode ser editada/
    );
  }

  const task = parseProcess(fixture).elements.find((item) => item.id === 'task5');
  assert.equal(task.attributes.esforcoCalculo, '0');
  assert.equal(task.attributes.esforcoPrevisto, '563.0');
});

test('vincula intermediate link somente a um evento receptor de link', () => {
  const removed = patchProcess(fixture, 'intermediatelink26', { linkId: '' });
  const unlinked = removed.model.elements.find((item) => item.id === 'intermediatelink26');
  assert.equal(unlinked.attributes.linkId, undefined);
  assert.ok(removed.validation.warnings.some((item) => item.code === 'EVENT-LINK-001'));

  const restored = patchProcess(removed.text, 'intermediatelink26', {
    linkId: 'intermediatelinkreceive29'
  });
  assert.equal(
    restored.model.elements.find((item) => item.id === 'intermediatelink26').attributes.linkId,
    'intermediatelinkreceive29'
  );
  assert.equal(restored.validation.findings.some((item) => item.code.startsWith('EVENT-LINK-')), false);
  assert.match(restored.text, /linkId="intermediatelinkreceive29"/);

  assert.throws(
    () => patchProcess(fixture, 'intermediatelink26', { linkId: 'intermediateevent22' }),
    /receptor de link inv/
  );
  assert.throws(
    () => patchProcess(fixture, 'intermediatelinkreceive29', { linkId: 'intermediatelinkreceive29' }),
    /pode ser editada/
  );
});

test('renomeia fluxo e label visual sem perder ASCII/CRLF', () => {
  const result = patchProcess(fixture, 'flow47', { name: 'Fluxo ação 47' });
  const model = parseProcess(result.text);
  const flow = model.flows.find((item) => item.id === 'flow47');
  assert.equal(flow.name, 'Fluxo ação 47');
  assert.equal(flow.connection.labelNode.attributeMap.value.value, 'Fluxo ação 47');
  assert.match(result.text, /Fluxo a&#xe7;&#xe3;o 47/);
  assert.equal(/[^\x00-\x7F]/.test(result.text), false);
  assert.equal(result.text.includes('\r\n'), true);
  assert.equal(result.patches.length, 2);
});

test('edita propriedades de movimento e remove boolean falso', () => {
  const movement = patchProcess(fixture, 'flow47', {
    movementTitle: 'Título teste',
    movementDescription: 'Linha 1\r\nLinha 2'
  });
  const flow = movement.model.flows.find((item) => item.id === 'flow47');
  assert.equal(flow.attributes.movementTitle, 'Título teste');
  assert.equal(flow.attributes.movementDescription, 'Linha 1\r\nLinha 2');

  const removed = patchProcess(movement.text, 'flow49', { defaultLink: false });
  const updated = removed.model.flows.find((item) => item.id === 'flow49');
  assert.equal(updated.attributes.defaultLink, undefined);
  const restored = patchProcess(removed.text, 'flow49', { defaultLink: true });
  assert.equal(restored.model.flows.find((item) => item.id === 'flow49').attributes.defaultLink, 'true');
});

test('recusa edição estrutural', () => {
  assert.throws(
    () => patchProcess(fixture, 'flow47', { targetRef: 'enderror17' }),
    /não pode ser editada/
  );
});

test('converte duração visual HHH:mm para minutos do Fluig', () => {
  assert.equal(durationToMinutes('024:00'), '1440.0');
  assert.equal(durationToMinutes('009:23'), '563.0');
  assert.throws(() => durationToMinutes('24 horas'), /Duração inválida/);
});

test('edita propriedades diretas específicas por subtipo', () => {
  const service = patchProcess(fixture, 'servicetask11', {
    executionType: '1',
    executionAttempts: '4',
    frequency: '8',
    frequencyType: '2',
    executionSucessfulMessage: 'Integração concluída'
  }).model.elements.find((item) => item.id === 'servicetask11');
  assert.equal(service.attributes.executionType, '1');
  assert.equal(service.attributes.executionAttempts, '4');
  assert.equal(service.attributes.frequency, '8');
  assert.equal(service.attributes.frequencyType, '2');
  assert.equal(service.attributes.executionSucessfulMessage, 'Integração concluída');

  const subprocess = patchProcess(fixture, 'subprocess35', { process: 'processoFilho' })
    .model.elements.find((item) => item.id === 'subprocess35');
  assert.equal(subprocess.attributes.process, 'processoFilho');

  const adhoc = patchProcess(fixture, 'adhocsubprocess36', {
    instructions: 'Escolha uma atividade',
    initialTask: false
  }).model.elements.find((item) => item.id === 'adhocsubprocess36');
  assert.equal(adhoc.attributes.instructions, 'Escolha uma atividade');
  assert.equal(adhoc.attributes.initialTask, undefined);

  assert.throws(
    () => patchProcess(fixture, 'mailtask31', { executionType: '1' }),
    /não pode ser editada/
  );
});

test('edita somente o signalId nos eventos de sinal compatíveis', () => {
  for (const eventId of ['startsignal13', 'endsignal19', 'intermediatesignal25', 'intermediatesignalreceive28']) {
    const changed = patchProcess(fixture, eventId, { signalId: '0' });
    assert.equal(changed.model.elements.find((item) => item.id === eventId).attributes.signalId, '0');
  }
  assert.throws(() => patchProcess(fixture, 'endevent12', { signalId: '1' }), /não pode ser editada/);
  assert.throws(() => patchProcess(fixture, 'startsignal13', { signalId: '-1' }), /Sinal inválido/);
});

test('edita messageData da atividade de e-mail sem reconstruir o bloco XStream', () => {
  const result = patchProcess(fixture, 'mailtask31', {
    messageType: '1',
    messageReceiver: 'teste&destino@example.com',
    messageSubject: 'Assunto <especial>',
    messageContent: 'Primeira linha\nSegunda linha'
  });
  const mail = result.model.elements.find((item) => item.id === 'mailtask31');
  const values = messageDataValues(mail.attributes.messageData);
  assert.deepEqual(values, {
    messageType: '1',
    messageReceiver: 'teste&destino@example.com',
    messageSubject: 'Assunto <especial>',
    messageContent: 'Primeira linha\r\nSegunda linha'
  });
  assert.match(mail.attributes.messageData, /^<org\.eclipse\.bpmn2\.documentacional\.BpmnMessageData>/);
  assert.match(result.text, /&lt;receiver>teste&amp;amp;destino@example\.com&lt;\/receiver>/);
  assert.match(result.text, /&lt;subject>Assunto &amp;lt;especial&amp;gt;&lt;\/subject>/);
  assert.match(result.text, /Primeira linha&amp;#xd;&#xA;Segunda linha/);
  assert.equal(result.patches.length, 1);
  assert.equal(/[^\x00-\x7F]/.test(result.text), false);
  assert.equal(result.text.includes('\r\n'), true);
});

test('recusa edição de e-mail quando messageData não possui a estrutura esperada', () => {
  const broken = fixture.replace(/ messageData="[^"]*"/, ' messageData="&lt;invalido/>"');
  assert.throws(
    () => patchProcess(broken, 'mailtask31', { messageSubject: 'Novo assunto' }),
    /messageData inválido/
  );
});

test('persiste posição e expansão do canvas sem reserializar o Graphiti', () => {
  const original = parseProcess(fixture);
  const shape = original.shapeById.get('manualtask32');
  const result = patchLayout(fixture, {
    moves: [{ id: 'manualtask32', x: shape.x + 40, y: shape.y + 60 }],
    canvas: { width: 1800, height: 1200 }
  });
  const moved = result.model.shapeById.get('manualtask32');
  const requiredHeight = Math.ceil(Math.max(...original.shapes.map((item) => {
    const y = item.businessObject === 'manualtask32' ? shape.y + 60 : item.y;
    return y + item.height + 120;
  })));
  assert.equal(moved.x, shape.x + 40);
  assert.equal(moved.y, shape.y + 60);
  assert.equal(result.model.canvas.width, 1800);
  assert.equal(result.model.canvas.height, Math.max(1200, requiredHeight));
  assert.equal(result.validation.ok, true);
  assert.equal(result.text.includes('\r\n'), true);
  assert.equal(/[^\x00-\x7F]/.test(result.text), false);
  assert.equal(result.model.elements.find((item) => item.id === 'manualtask32').id, 'manualtask32');
  const repeated = patchLayout(result.text, {
    moves: [{ id: 'manualtask32', x: moved.x, y: moved.y }],
    canvas: { width: 1800, height: 1200 }
  });
  assert.equal(repeated.changed, false);
  assert.equal(repeated.patches.length, 0);
});

test('reduz sobra do canvas sem cortar os elementos existentes', () => {
  const enlarged = patchLayout(fixture, {
    moves: [],
    canvas: { width: 2400, height: 1800 }
  });
  const fitted = patchLayout(enlarged.text, {
    moves: [],
    canvas: { width: 1600, height: 1000 }
  });
  assert.equal(fitted.model.canvas.width, 1600);
  const fittedBottommost = Math.max(...fitted.model.shapes.map((shape) => shape.y + shape.height));
  assert.equal(fitted.model.canvas.height, Math.max(1000, fittedBottommost + 120));

  const protectedExtent = patchLayout(enlarged.text, {
    moves: [],
    canvas: { width: 1000, height: 800 }
  });
  const rightmost = Math.max(...protectedExtent.model.shapes.map((shape) => shape.x + shape.width));
  const bottommost = Math.max(...protectedExtent.model.shapes.map((shape) => shape.y + shape.height));
  assert.ok(protectedExtent.model.canvas.width >= rightmost + 120);
  assert.ok(protectedExtent.model.canvas.height >= bottommost + 120);
});

test('desloca bendpoints quando as duas extremidades são movidas juntas', () => {
  const withBendpoint = fixture.replace(
    '<link businessObjects="flow47"/>',
    '<bendpoints x="700" y="70"/>\r\n      <link businessObjects="flow47"/>'
  );
  const original = parseProcess(withBendpoint);
  const source = original.shapeById.get('task5');
  const target = original.shapeById.get('exclusivegateway39');
  const result = patchLayout(withBendpoint, {
    moves: [
      { id: 'task5', x: source.x + 20, y: source.y + 30 },
      { id: 'exclusivegateway39', x: target.x + 20, y: target.y + 30 }
    ]
  });
  const flow = result.model.connections.find((item) => item.businessObject === 'flow47');
  const originalFlow = original.connections.find((item) => item.businessObject === 'flow47');
  assert.deepEqual(
    flow.bendpoints,
    originalFlow.bendpoints.map((point) => ({ x: point.x + 20, y: point.y + 30 }))
  );
  assert.equal(result.validation.ok, true);
});

test('persiste movimento em coordenadas negativas e recusa valores fora do limite', () => {
  const result = patchLayout(fixture, {
    moves: [{ id: 'manualtask32', x: -310, y: -40 }]
  });
  const moved = result.model.shapeById.get('manualtask32');
  assert.equal(moved.x, -310);
  assert.equal(moved.y, -40);
  assert.equal(result.validation.ok, true);

  const movedAgain = patchLayout(result.text, {
    moves: [{ id: 'manualtask32', x: -250, y: 30 }]
  });
  assert.equal(movedAgain.model.shapeById.get('manualtask32').x, -250);
  assert.equal(movedAgain.model.shapeById.get('manualtask32').y, 30);

  assert.throws(() => patchLayout(fixture, {
    moves: [{ id: 'manualtask32', x: -10000001, y: 20 }]
  }), /Coordenada inválida/);
  assert.throws(() => patchLayout(fixture, {
    moves: [{ id: 'manualtask32', x: Number.NaN, y: 20 }]
  }), /Coordenada inválida/);
});

test('recusa elementos não movimentáveis', () => {
  const processId = parseProcess(fixture).elements.find((item) => item.tag === 'BpmnProcess').id;
  assert.throws(() => patchLayout(fixture, {
    moves: [{ id: processId, x: 20, y: 20 }]
  }), /ainda não pode ser movimentado/);
});
