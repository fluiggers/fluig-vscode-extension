// Gerador .process → ecm30.xml (regras de 02 §6 e 09). Sem vscode; só o processModel do fork.
import { convertAssignment, field, parseXs, Xs } from './assignment';
import type { Ecm30Event } from './events';
import { Entity, LIST_SINCE, pk, Value, versionLess, writeEcm30 } from './writer';
const { parseProcess } = require('../../bpmn/processModel');

/** `baseName` = nome do .process sem extensão (base dos scripts; pode diferir do BpmnProcess@id). */
export interface Ecm30Input { processText: string; baseName: string; events: Ecm30Event[] }
export interface Ecm30Result { xml: string; warnings: string[] }

interface Shape { x: number; y: number; width: number; height: number }
interface El { id: string; tag: string; attributes: Record<string, string>; shape: Shape | null }
interface Connection { businessObject: string; bendpoints: { x: number; y: number }[] }
type Attrs = Record<string, string>;

type Raw = string | null | undefined;
const str = (v: Raw): string | null => v ?? null;
const int = (v: Raw, def = 0): number => (v === null || v === undefined ? def : parseInt(v, 10));
const num = (v: Raw, def = 0): number => (v === null || v === undefined ? def : parseFloat(v));
const bool = (v: Raw, def = false): boolean => (v === null || v === undefined ? def : v === 'true');
const secs = (minutes: number): number => Math.trunc(minutes * 60); // 02 §2.15: minutos → segundos truncados
const ids = (v: string | undefined): string[] => (v ? v.split(' ').filter(Boolean) : []);
const items = (payload: string | undefined): Xs[] => parseXs(payload)?.children ?? [];

function seq(id: string): number {
  const match = /(\d+)$/.exec(id); // 02 §2.4: sequence = dígitos finais do id
  if (!match) {
    throw new Error(`O elemento "${id}" não tem número no id; não é possível calcular a sequence.`);
  }
  return parseInt(match[1], 10);
}

// Textos fixos de instruction por tipo (02 §6.4; textos completos observados nos goldens). Espaço final é do Studio.
const INSTRUCTION = new Map<number, string>([
  [10, 'Atividade inicial do processo'],
  [11, 'Atividade de inicio por mensagem. Aguardando envio do sinal '],
  [12, 'Atividade de inicio por mensagem. Aguardando envio do sinal '],
  [13, 'Atividade inicial do processo'],
  [14, 'Atividade de inicio por sinal. Aguardando envio do sinal '],
  [15, 'Atividade de inicio por múltiplas vias paralelas'], // sem fixture: inferido de 02 §6.4 "vias[ paralelas]"
  [16, 'Atividade de inicio por múltiplas vias'],
  [37, 'Evento intermediário por sinal. Aguardando envio do sinal '],
  [41, 'Evento intermediário por recebimento de sinal. Aguardando recebimento do sinal '],
  [63, 'Esta atividade indica que o processo foi terminado com erro.'],
  [68, 'Esta atividade indica que o processo terminado e que não ocorrerá nenhum tipo de pós processamento.'],
]);
const INTERMEDIATE_INSTRUCTION = 'Evento intermediário do processo';
const END_INSTRUCTION = 'Atividade final do processo';

// Campos estendidos que sobrescrevem o ProcessState (02 §3.6); `description` → stateDescription.
const EXT_BOOL = new Set(['initialState', 'counterSign', 'inhibitTransfer', 'joint', 'notifyAuthorityFollowUp', 'notifyRequisitionerFollowUp',
  'notifyManagerFollowUp', 'notifyAuthorityDelay', 'notifyRequisitionerDelay', 'notifyManagerDelay']);
const EXT_NUM = new Set(['deadlineTime', 'agreementPercentage', 'allowanceAuthorityTime', 'frequenceAuthorityTime', 'allowanceRequisitionerTime',
  'frequenceRequisitionerTime', 'allowanceManagerTime', 'frequenceManagerTime']);

export function generateEcm30(input: Ecm30Input, serverVersion?: string): Ecm30Result {
  const model = parseProcess(input.processText);
  if (!model.supported || !model.process) {
    throw new Error('Arquivo .process inválido: esperado XMI do Fluig Studio com um BpmnProcess.');
  }
  const warnings = new Set<string>();
  const below = (min: string) => !!serverVersion && versionLess(serverVersion, min);
  if (!serverVersion) {
    warnings.add('Versão do servidor desconhecida: nenhum campo foi omitido por versão.');
  }

  const P: Attrs = model.process.attributes;
  const pid = P.id;
  const pver = int(P.version);
  const all: El[] = model.elements.filter((e: El) => e.tag !== 'BpmnProcess');
  const flows: El[] = model.flows;
  const byId = new Map<string, El>([...all, ...flows].map((e) => [e.id, e]));
  const of = (...tags: string[]) => all.filter((e) => tags.includes(e.tag));
  const type = (e: El) => int(e.attributes.type);

  // 02 §6.1: deslocamento se houver coordenada negativa (shapes de topo e bendpoints).
  const connections: Connection[] = model.connections;
  const minimum = (axis: 'x' | 'y') => Math.min(0, ...model.shapes.filter((s: { depth: number }) => s.depth === 0).map((s: Shape) => s[axis]),
    ...connections.flatMap((c) => c.bendpoints.map((b) => b[axis])));
  const dx = -minimum('x');
  const dy = -minimum('y');

  // 02 §6.1 item 3: mapSequenceProcess (usado pelo Executor Atividade).
  const SEQ_TAGS = ['BpmnTask', 'BpmnSubProcess', 'BpmnEndEvent', 'BpmnIntermediateEvent', 'BpmnGateway', 'BpmnDocument', 'BpmnStartEvent'];
  const seqMap = new Map(of(...SEQ_TAGS).map((e) => [e.id, seq(e.id)]));
  const conv = (ctrl: Xs | null) => convertAssignment(ctrl, (id) => seqMap.get(id));
  const targetsOf = (e: El) => ids(e.attributes.outgoing).map((f) => byId.get(f)?.attributes.targetRef ?? '');
  const flowTargets = new Set(flows.map((f) => f.attributes.targetRef));

  const starts = of('BpmnStartEvent');
  const tasks = of('BpmnTask');
  const intermediates = of('BpmnIntermediateEvent');
  const subprocesses = of('BpmnSubProcess');
  const gateways = of('BpmnGateway');
  const ends = of('BpmnEndEvent');

  // 02 §6.1 item 4 e §4.4: validações que impedem o export.
  if (!starts.length) {
    throw new Error('O processo não possui um evento inicial.');
  }
  if (!ends.length && !subprocesses.length) {
    throw new Error('O processo não possui um evento final.');
  }
  for (const e of [...starts, ...tasks, ...subprocesses, ...gateways, ...ends]) {
    if (!e.shape) {
      throw new Error(`O elemento "${e.id}" não tem forma no diagrama (posição desconhecida).`);
    }
  }
  for (const f of flows) {
    if (!byId.has(f.attributes.sourceRef) || !byId.has(f.attributes.targetRef)) {
      throw new Error(`O fluxo "${f.id}" não tem origem ou destino válido.`);
    }
  }

  // ---------- [2] ProcessState (02 §6.4) ----------
  const state = (e: El, fields: Record<string, Value>): Entity => {
    const a = e.attributes;
    return {
      tag: 'ProcessState',
      processStatePK: pk('processStatePK', 1, pid, 1, seq(e.id)),
      stateName: str(a.name),
      stateDescription: str(a.name),
      transferAttachments: false,
      subProcessId: '',
      formFolder: 0,
      automatic: false,
      positionX: e.shape ? e.shape.x + dx : 0, // intermediário sem shape: o Studio não falha (02 §4.4)
      positionY: e.shape ? e.shape.y + dy : 0,
      stateType: 0,
      bpmnType: type(e),
      signalId: 0,
      openInstances: 0,
      destinationStates: [],
      ...fields,
    };
  };
  // Start 10 e tasks: campos de atividade de usuário (02 §2.8).
  const activity = (a: Attrs): Record<string, Value> => ({
    instruction: a.instrucoes ?? '',
    deadlineTime: secs(num(a.prazoConclusao)),
    joint: bool(a.atividadeConjunta),
    agreementPercentage: int(a.consenso),
    selectColleague: int(a.selecionaColaboradores),
    notifyAuthorityDelay: bool(a.emAtrasoNotificarResponsavel, true),
    notifyRequisitionerDelay: bool(a.emAtrasoNotificarRequisitante),
    allowanceAuthorityTime: secs(num(a.emAtrasoNotificarResponsavelTolerancia, 60)),
    frequenceAuthorityTime: secs(num(a.emAtrasoNotificarResponsavelFrequencia, 60)),
    allowanceRequisitionerTime: secs(num(a.emAtrasoNotificarRequisitanteTolerancia)),
    frequenceRequisitionerTime: secs(num(a.emAtrasoNotificarRequisitanteFrequencia)),
    notifyRequisitionerFollowUp: bool(a.notificaRequisitante),
    forecastedEffortType: int(a.esforcoCalculo),
    forecastedEffort: secs(num(a.esforcoPrevisto)),
    notifyManagerFollowUp: bool(a.notificaGestor),
    notifyManagerDelay: bool(a.emAtrasoNotificarGestor),
    allowanceManagerTime: secs(num(a.emAtrasoNotificarGestorTolerancia)),
    frequenceManagerTime: secs(num(a.emAtrasoNotificarGestorFrequencia)),
    inhibitTransfer: bool(a.inibeOpcaoTransferir),
    periodId: a.expediente ?? '',
    counterSign: bool(P.counterSign) || bool(a.confirmarSenha),
    noticeExpirationAuthorityTime: secs(num(a.noticeExpirationAuthorityTime)),
    noticeExpirationRequisitionerTime: secs(num(a.noticeExpirationRequisitionerTime)),
    noticeExpirationManagerTime: secs(num(a.noticeExpirationManagerTime)),
    digitalSignature: bool(a.digitalSignature),
  });
  // Starts 11-16 e intermediários: valores fixos (02 §6.4).
  const EVENT: Record<string, Value> = {
    deadlineTime: 0, joint: false, agreementPercentage: 0, engineAllocationId: '', engineAllocationConfiguration: '',
    selectColleague: 0, initialState: false, notifyAuthorityDelay: true, notifyRequisitionerDelay: false,
    allowanceAuthorityTime: 1, frequenceAuthorityTime: 1, allowanceRequisitionerTime: 0, frequenceRequisitionerTime: 0,
    notifyAuthorityFollowUp: true, notifyRequisitionerFollowUp: false, forecastedEffortType: 0, forecastedEffort: 0,
    notifyManagerFollowUp: false, notifyManagerDelay: false, frequenceManagerTime: 0, inhibitTransfer: false, periodId: '', counterSign: false,
  };
  const extended = (e: El, s: Entity): Entity => {
    for (const prop of items(e.attributes.extendedFields)) {
      const name = field(prop, 'propertyName') ?? '';
      const value = field(prop, 'propertyValue');
      if (!value) {
        continue;
      }
      const key = name === 'description' ? 'stateDescription' : name;
      if (EXT_BOOL.has(key)) {
        s[key] = value === 'true';
      }
      else if (EXT_NUM.has(key)) {
        s[key] = parseInt(value, 10);
      }
      else if (key === 'stateDescription' || key === 'instruction') {
        s[key] = value;
      }
    }
    return s;
  };

  const states: Entity[] = [];
  const conditions: Entity[] = [];
  for (const e of starts) {
    const a = e.attributes;
    const t = type(e);
    const init = parseXs(a.initializerConfiguration);
    if (t === 10) {
      states.push(state(e, {
        ...activity(a), initialState: true, notifyAuthorityFollowUp: bool(a.notificaResponsavel),
        engineAllocationId: init ? field(init, 'mechanismName') : '', engineAllocationConfiguration: init ? conv(init) : '',
      }));
      continue;
    }
    const description = new Map<number, string>([[12, 'Inicio Temporizador'], [13, e.id], [14, `Inicio Sinal ${int(a.signalId)}`], [15, 'Inicio'], [16, 'Inicio']]);
    states.push(extended(e, state(e, {
      ...EVENT, stateDescription: description.get(t) ?? str(a.name), instruction: INSTRUCTION.get(t) ?? INSTRUCTION.get(10), initialState: true,
      engineAllocationId: 'Usuário', engineAllocationConfiguration: conv(init), signalId: t === 14 ? int(a.signalId) : 0,
    })));
  }
  for (const e of tasks) {
    const a = e.attributes;
    if (type(e) === 85) {
      // 02 §6.9: task manual vira 1 condição "true" para a única saída.
      const targets = targetsOf(e);
      if (targets.length !== 1) {
        throw new Error(`A atividade manual "${a.name ?? e.id}" precisa ter exatamente uma saída.`);
      }
      states.push(extended(e, state(e, {
        automatic: true, engineAllocationId: '', engineAllocationConfiguration: '', inhibitTransfer: false, joint: false,
        selectColleague: int(a.selecionaColaboradores), notifyAuthorityFollowUp: bool(a.authNotify), initialState: false,
      })));
      conditions.push({
        tag: 'ConditionProcessState', conditionProcessStatePK: pk('conditionProcessStatePK', 1, pid, 1, 1, seq(e.id)),
        condition: 'true', destinationSequenceId: seq(targets[0]), engineAllocationConfiguration: '', engineAllocationId: '', conditionType: 0,
      });
      continue;
    }
    const executionType = int(a.executionType);
    if (executionType === 1 && below('1.5.9')) {
      warnings.add(`A atividade "${a.name ?? e.id}" é automática, o que exige Fluig 1.5.9.`);
    }
    states.push(state(e, {
      ...activity(a), initialState: false, notifyAuthorityFollowUp: bool(a.authNotify), deadlineFieldName: a.deadlineFieldName ?? '',
      engineAllocationId: str(a.managerMechanism), engineAllocationConfiguration: conv(parseXs(a.managerAssignmentControllerString)),
      executionType,
    }));
  }
  for (const e of intermediates) {
    const a = e.attributes;
    const t = type(e);
    const signal = int(a.signalId);
    const description = t === 37 ? `Intermediário Sinal ${signal}` : t === 41 ? `Intermediário Recebimento Sinal ${signal}` : str(a.name);
    states.push(extended(e, state(e, {
      ...EVENT, stateDescription: description, instruction: INSTRUCTION.get(t) ?? INTERMEDIATE_INSTRUCTION, automatic: t === 31 || t === 32,
      signalId: (t === 37 || t === 41) && signal > 0 ? signal : 0, parentSequence: int(a.sequenceAttached), digitalSignature: false,
    })));
  }
  for (const e of subprocesses) {
    const a = e.attributes;
    const adhoc = type(e) === 101;
    states.push(extended(e, state(e, {
      instruction: adhoc ? a.instructions ?? '' : '', stateType: adhoc ? 0 : 2, initialState: adhoc ? bool(a.initialTask) : false,
      engineAllocationId: adhoc ? str(a.managerMechanism) : '', engineAllocationConfiguration: adhoc ? conv(parseXs(a.managerAssignmentController)) : '',
      selectColleague: adhoc ? int(a.selectColleague) || 1 : null, // getter 0→1 (02 §2.2)
      deadlineTime: 0, counterSign: false, inhibitTransfer: false, joint: false, agreementPercentage: 0,
      notifyAuthorityFollowUp: false, notifyRequisitionerFollowUp: false, notifyManagerFollowUp: false,
      notifyAuthorityDelay: false, allowanceAuthorityTime: 0, frequenceAuthorityTime: 0,
      notifyRequisitionerDelay: false, allowanceRequisitionerTime: 0, frequenceRequisitionerTime: 0,
      notifyManagerDelay: true, allowanceManagerTime: 0, frequenceManagerTime: 0,
      noticeExpirationAuthorityTime: 0, noticeExpirationRequisitionerTime: 0, noticeExpirationManagerTime: 0,
      forecastedEffortType: 0, forecastedEffort: 0, digitalSignature: false, transferAttachments: bool(a.transferAttachments),
      subProcessId: str(a.process), cancelSubProcess: bool(a.cancelSubProcess), sendToNextTaskInSubProcess: bool(a.sendToNextTaskInSubProcess),
    })));
  }
  for (const e of gateways) {
    const t = type(e);
    const noIncoming = t === 122 && ids(e.attributes.incoming).length === 0;
    states.push(state(e, {
      joint: false, initialState: noIncoming, automatic: t === 120 || t === 123, inhibitTransfer: false, digitalSignature: false,
      stateType: t === 120 || t === 123 ? 1 : t === 127 ? 4 : noIncoming ? 0 : 3,
    }));
  }
  for (const e of ends) {
    const a = e.attributes;
    const t = type(e);
    const signal = int(a.signalId);
    states.push(extended(e, state(e, {
      ...EVENT, instruction: INSTRUCTION.get(t) ?? END_INSTRUCTION, stateType: 6,
      notifyAuthorityDelay: t !== 68, allowanceAuthorityTime: 0, allowanceManagerTime: 0, notifyAuthorityFollowUp: false,
      notifyRequisitionerFollowUp: bool(a.notificaRequisitante), notifyManagerFollowUp: bool(a.notificaGestor),
      digitalSignature: false, signalId: t === 64 && signal > 0 ? signal : 0,
    })));
  }

  // ---------- [3] ConditionProcessState + [19] regras automáticas (02 §6.9) ----------
  const rules: Entity[] = [];
  for (const e of gateways.filter((g) => [120, 121, 123].includes(type(g)))) {
    const targets = targetsOf(e);
    for (const c of items(e.attributes.condition)) {
      const order = int(field(c, 'order'));
      const target = field(c, 'targetTask');
      const conditionType = int(field(c, 'conditionType'));
      conditions.push({
        tag: 'ConditionProcessState',
        conditionProcessStatePK: pk('conditionProcessStatePK', 1, pid, order, pver, seq(e.id)),
        conditionName: serverVersion && !below('2.0.0') ? field(c, 'name') : null, // 09 §3
        condition: field(c, 'expression'),
        destinationSequenceId: target && targets.includes(target) ? seq(target) : 0,
        engineAllocationConfiguration: conv(c.children.find((x) => x.name === 'mecanismoAtribuicaoConfiguracao') ?? null),
        engineAllocationId: field(c, 'mechanism')?.replace('Campo FormulÃ¡rio', 'Campo Formulário') ?? null,
        conditionType,
      });
      if (conditionType !== 1) {
        continue;
      }
      for (const r of c.children.find((x) => x.name === 'rules')?.children ?? []) {
        rules.push({
          tag: 'ConditionProcessAutomaticRules', sequence: seq(e.id), expressionOrder: order,
          ruleOrder: int(field(r, 'ruleOrder')), field: field(r, 'field'), value: field(r, 'value'),
          operator: int(field(r, 'operator')), valueType: int(field(r, 'valueType')),
        });
      }
    }
  }

  // ---------- [4] ProcessLink (02 §6.7), links virtuais 36→42 (§6.6) ----------
  const isAssoc = (f: El) => ['BpmnAnnotation', 'BpmnDocument'].includes(byId.get(f.attributes.sourceRef)?.tag ?? '');
  const link = (linkSequence: number, from: number, to: number, f: Attrs, name: string | null, flags: Attrs = f): Entity => ({
    tag: 'ProcessLink', processLinkPK: pk('processLinkPK', 1, pid, 1, linkSequence),
    actionLabel: f.atividadeFluxo ?? '', returnPermited: bool(flags.permiteRetorno), initialStateSequence: from, finalStateSequence: to,
    returnLabel: f.atividadeRetorno ?? '', name, automaticLink: bool(flags.fluxoAutomatico), defaultLink: bool(flags.defaultLink),
    type: int(f.type), expression: str(f.expression), movementTitle: str(f.movementTitle), movementDescription: str(f.movementDescription),
    movementAccessLinkDescription: str(f.movementAccessLinkDescription),
  });
  const links = flows.filter((f) => !isAssoc(f)).map((f) => {
    const a = f.attributes;
    return link(seq(f.id), seq(a.sourceRef), seq(a.targetRef), a, str(a.name));
  });
  let linkSeq = Math.max(0, ...[...all, ...flows].map((e) => seq(e.id)));
  for (const thrower of intermediates.filter((e) => type(e) === 36)) {
    const receiver = byId.get(thrower.attributes.linkId ?? '');
    if (!receiver) {
      continue;
    }
    for (const incoming of flows.filter((f) => f.attributes.targetRef === thrower.id)) {
      for (const outgoing of flows.filter((f) => f.attributes.sourceRef === receiver.id)) {
        const flags: Attrs = {};
        for (const k of ['permiteRetorno', 'fluxoAutomatico', 'defaultLink']) {
          flags[k] = String(bool(incoming.attributes[k]) || bool(outgoing.attributes[k]));
        }
        links.push(link(++linkSeq, seq(thrower.id), seq(receiver.id), incoming.attributes, null, flags));
      }
    }
  }

  // 02 §6.5: estado (com defaults de Start 11-16) e link fake para gateway de evento sem entrada.
  let maxSeq = Math.max(0, ...seqMap.values());
  let maxLink = Math.max(0, ...links.map((l) => (l.processLinkPK as Entity).linkSequence as number));
  for (const g of gateways.filter((e) => [123, 124].includes(type(e)) && !flowTargets.has(e.id))) {
    const fake = ++maxSeq;
    states.push(state(g, {
      ...EVENT, processStatePK: pk('processStatePK', 1, pid, 1, fake), stateName: `Inicio_${fake}`, stateDescription: 'Inicio',
      instruction: INSTRUCTION.get(10), initialState: true, positionX: 0, positionY: 0, bpmnType: 10, engineAllocationConfiguration: null,
    }));
    links.push(link(++maxLink, fake, seq(g.id), {}, null));
  }

  // ---------- [8] SwimLane (02 §6.8): sequence = posição entre as raias, não o sufixo do id ----------
  const swimlanes = of('BpmnPool', 'BpmnSwimLane', 'BpmnGroup').map((e, i) => ({ e, sequence: i + 1, x: (e.shape?.x ?? 0) + dx, y: (e.shape?.y ?? 0) + dy }));
  const lanes = swimlanes.filter(({ e }) => e.shape).map(({ e, sequence, x, y }): Entity => {
    const { width, height } = e.shape as Shape;
    // Raia: primeiro pool cujo retângulo contém (x,y) da raia.
    const pool = e.tag === 'BpmnSwimLane' ? swimlanes.find((p) => p.e.tag === 'BpmnPool' && p.e.shape
      && y >= p.y && y < p.y + p.e.shape.height && x > p.x && x < p.x + p.e.shape.width) : undefined;
    return {
      tag: 'SwimLane', color: e.attributes.cores ?? (e.tag === 'BpmnPool' ? 'B9E9FE' : e.tag === 'BpmnSwimLane' ? '9fc1c6' : ''),
      height, width, positionX: x, positionY: y, stateName: str(e.attributes.name),
      type: e.tag === 'BpmnPool' ? 1 : e.tag === 'BpmnSwimLane' ? 2 : 3, parentSequence: pool?.sequence ?? 0,
      swimLanePK: pk('swimLanePK', 1, pid, 1, sequence),
    };
  });

  // ---------- [9] ProcessComponGraf e [10] ProcessLinkAssoc (02 §6.10) ----------
  const COMPON = new Map([['BpmnAnnotation', 1], ['BpmnDocument', 2], ['BpmnDatabase', 3]]);
  const compon = of('BpmnAnnotation', 'BpmnDocument', 'BpmnDatabase').filter((e) => e.shape).map((e): Entity => ({
    tag: 'ProcessComponGraf', componType: COMPON.get(e.tag), positionX: (e.shape as Shape).x + dx, positionY: (e.shape as Shape).y + dy,
    processComponGrafPK: pk('processComponGrafPK', 1, pid, 1, seq(e.id)),
    stateName: e.tag === 'BpmnDocument' ? e.attributes.documentId ?? '0' : str(e.attributes.name),
  }));
  const assocs = flows.filter(isAssoc).map((f): Entity => ({
    tag: 'ProcessLinkAssoc', processLinkAssocPK: pk('processLinkAssocPK', 1, pid, 1, seq(f.id)),
    initialStateSequence: seq(f.attributes.sourceRef), finalStateSequence: seq(f.attributes.targetRef),
  }));

  // ---------- [11] ProcessLinkBend: toda conexão de SequenceFlow, version = processo ----------
  const bends = connections.filter((c) => byId.get(c.businessObject)?.tag === 'SequenceFlow').flatMap((c) => c.bendpoints.map((b, i): Entity => ({
    tag: 'ProcessLinkBend', processLinkBendPK: pk('processLinkBendPK', 1, pid, pver, seq(c.businessObject), i + 1),
    positionX: b.x + dx, positionY: b.y + dy,
  })));

  // ---------- [12] ProcessStateTrigger e condições de evento (02 §6.10) ----------
  const triggers: Entity[] = [];
  const RUN_TYPES = ['MINUTE', 'HOUR', 'DAY', 'WORK_DAY', 'MONTH', 'WEEK_MONTH', 'WEEK_DAY'];
  const TRIGGER_TYPE = new Map([[14, 0], [37, 0], [13, 3], [35, 3], [16, 4], [39, 4], [15, 5], [38, 5]]);
  const eventIds = new Set(input.events.map((ev) => ev.eventId));
  const stateSeqOf = (e: El) => (e.tag === 'BpmnIntermediateEvent' && int(e.attributes.sequenceAttached) ? int(e.attributes.sequenceAttached) : seq(e.id));
  const trigger = (e: El, fields: Record<string, Value>): Entity => ({
    tag: 'ProcessStateTrigger', processStateTriggerPK: pk('processStateTriggerPK', 1, pid, pver, stateSeqOf(e), triggers.length), ...fields,
  });
  for (const e of [...starts, ...intermediates]) {
    const data = parseXs(e.attributes.trigger);
    if (!data) {
      continue;
    }
    const t = type(e);
    const runType = RUN_TYPES.indexOf(field(data, 'runType') ?? ''); // getter: null → HOUR
    let value = field(data, 'scriptCondition');
    // Condicional sem script declarado: usa <base>.<id>.js se o evento existir.
    if (!value && (t === 13 || t === 35) && eventIds.has(e.id)) {
      value = `${input.baseName}.${e.id}.js`;
    }
    triggers.push(trigger(e, {
      runType: runType < 0 ? 1 : runType, type: TRIGGER_TYPE.get(t) ?? 2, value,
      timeTrigger: field(data, 'timeTrigger'), frequencia: field(data, 'frequencia') || '01', diaSemana: field(data, 'diaSemana'),
    }));
  }
  // Trigger de mensagem: runType HOUR e frequencia "01" (padrões dos getters), type 0, sem timeTrigger (observado).
  const message = (e: El, m: Xs) => trigger(e, { runType: 1, type: 0, value: `<BpmnMessageData><Type>${field(m, 'type') ?? ''}</Type><Receiver>${field(m, 'receiver') ?? ''}</Receiver>`
    + `<Subject>${field(m, 'subject') ?? ''}</Subject><Content>${field(m, 'content') ?? ''}</Content></BpmnMessageData>`, frequencia: '01' });
  for (const e of [...starts, ...ends, ...intermediates, ...tasks]) {
    const data = parseXs(e.attributes.messageData);
    if (data) {
      triggers.push(message(e, data));
    }
  }
  for (const e of [...starts, ...intermediates, ...ends]) {
    for (const c of items(e.attributes.triggers ?? e.attributes.conditions)) {
      const conditionPK = () => pk('processStateConditionPK', 1, pid, pver, stateSeqOf(e), triggers.length);
      if (c.name.endsWith('BpmnSignalData')) {
        triggers.push({ tag: 'ProcessStateConditionSignal', processStateConditionPK: conditionPK(), signalId: int(field(c, 'signalId')) });
      } else if (c.name.endsWith('BpmnTriggerData')) {
        const script = (field(c, 'scriptCondition') ?? '').replace(`${pid}.`, '').replace(/\.js$/, '');
        triggers.push({ tag: 'ProcessStateConditionScript', processStateConditionPK: conditionPK(), script });
      } else if (c.name.endsWith('BpmnMessageData')) {
        triggers.push(message(e, c));
      }
    }
  }

  // ---------- [13] ExtendedPropertyField e [7] AdvancedProcessProperties ----------
  const extFields: Entity[] = [];
  for (const e of [model.process as El, ...of(...SEQ_TAGS, 'BpmnAnnotation', 'BpmnDatabase')]) {
    const stateSequence = e === model.process ? 0 : seq(e.id);
    for (const p of items(e.attributes.extendedFields)) {
      extFields.push({
        tag: 'ExtendedPropertyField', extendedPropertyFieldPK: pk('extendedPropertyFieldPK', 1, pid, pver, stateSequence, field(p, 'propertyName')),
        propertyType: int(field(p, 'propertyType')), propertyDescription: field(p, 'propertyDescription'),
        propertyValue: field(p, 'propertyValue'), isDefaultProperty: bool(field(p, 'isDefaultProperty')),
      });
    }
  }
  const advanced = items(P.extendedFields).map((p): Entity => ({
    tag: 'AdvancedProcessProperties',
    advancedProcessPropertiesPK: pk('advancedProcessPropertiesPK', 1, pid, field(p, 'propertyName'), pver),
    propertieValue: field(p, 'propertyValue'),
  }));

  // ---------- demais listas (02 §6.10) ----------
  const attachmentSecurity = items(P.processAttachmentSecurity).map((s): Entity => ({
    tag: 'ProcessAttachmentSecurity',
    processAttachmentSecurityPK: pk('processAttachmentSecurityPK', 1, pid, 1, int(field(s, 'sequence'))),
    engineAllocationId: field(s, 'engineAllocationId'),
    engineAllocationConfiguration: conv(s.children.find((x) => x.name === 'engineAllocationConfiguration') ?? null) ?? '',
    accessLevel: int(field(s, 'accessLevel')),
    editionMode: field(s, 'editionMode') === null ? null : field(s, 'editionMode') === 'true',
  }));
  const events = [...input.events].sort((x, y) => (x.eventId < y.eventId ? -1 : x.eventId > y.eventId ? 1 : 0)).map((ev): Entity => ({
    tag: 'WorkflowProcessEvent', workflowProcessEventPK: pk('workflowProcessEventPK', 1, ev.eventId, pid, 1),
    eventDescription: ev.content, managedScript: false,
  }));
  const formFields = items(P.descriptorFields).map((f, i): Entity => ({
    tag: 'ProcessFormField', processFormFieldPK: pk('processFormFieldPK', 1, pid, field(f, 'id')),
    fieldDescription: field(f, 'label'), slotId: i + 1,
  }));
  const services = tasks.filter((e) => type(e) === 82).map((e): Entity => {
    const a = e.attributes;
    return {
      tag: 'ProcessStateService', companyId: 1, processId: pid, version: 1, sequence: seq(e.id), attempts: int(a.executionAttempts),
      sucessFullMessage: a.executionSucessfulMessage ?? '', serviceName: str(a.serviceName), // ausente = "" do Studio (02 §3)
      frequency: int(a.frequency) || 1, // 0 → 1 (observado nos goldens)
      frequencyType: int(a.frequencyType),
    };
  });
  const formMaps = subprocesses.filter((e) => type(e) === 100).flatMap((e) => items(e.attributes.formMaps).map((m): Entity => ({
    tag: 'SubProcessFieldRelationship', formMapId: 0, tenantId: 1, processCode: pid, stateSequence: seq(e.id), version: 1,
    subProcessCode: str(e.attributes.process), processField: field(m, 'processField'), subProcessField: field(m, 'subProcessField'),
    mapFlow: int(field(m, 'mapFlow')),
  })));
  const apps = tasks.flatMap((e) => (parseXs(e.attributes.appsConfiguration)?.children ?? []).flatMap((entry) => {
    const appKey = field(entry, 'string');
    return (entry.children.find((x) => x.name === 'list')?.children ?? []).map((item): Entity => ({
      tag: 'ProcessAppConfiguration', id: 0, tenantId: 0, processId: pid, processVersion: pver, stateSequence: seq(e.id),
      appKey, appField: field(item, 'appField'), description: field(item, 'description'),
    }));
  }));
  const attachmentRules = [...tasks, ...starts].flatMap((e) => items(e.attributes.attachmentRules).map((r): Entity => ({
    tag: 'ProcessAttachmentRules', id: 0, tenantId: 0, processId: pid, processVersion: pver, stateSequence: seq(e.id),
    operator: int(field(r, 'operator')), amount: field(r, 'amount'), name: field(r, 'name'), message: field(r, 'message'),
  })));

  // ---------- [0] ProcessDefinition e [1] ProcessDefinitionVersion (02 §6.2-6.3, 09 §3) ----------
  const definition: Entity = {
    tag: 'ProcessDefinition', processDefinitionPK: pk('processDefinitionPK', 1, pid),
    processDescription: str(P.name), instruction: str(P.instruction), active: bool(P.activeProcess, true), publicProcess: bool(P.publicProcess),
    volumeId: str(P.volume), categoryId: str(P.category), managerEngineAllocationId: P.managerMechanism ?? '',
    managerEngineAllocationConfiguration: conv(parseXs(P.managerAssignmentController)),
    snapshotFrequency: int(P.snapShotFrequency), baseDay: int(P.baseDay), baseMonth: int(P.baseMonth), periodId: P.expedient ?? '',
    uniqueCardVersion: bool(P.uniquecardversion), keyWord: P.keyWord ?? '', complementsLevel: int(P.complementsLevel),
    notifyRequisitionerComplements: bool(P.notifyRequisitionerComplements), notifyManagerComplements: bool(P.notifyManagerComplements),
    deadlineTime: secs(num(P.deadlineTime)), warningDeadlineTime: secs(num(P.warningTime)),
    notifyAuthorityComplements: bool(P.notifyResponsibleComplements),
  };
  const card = /^-?\d+$/.test(P.cardIndex ?? '') ? parseInt(P.cardIndex, 10) : 0;
  if (P.cardIndex && !card) {
    warnings.add(`Formulário "${P.cardIndex}" não é um id numérico; formId vai como 0 (formulário local).`);
  }
  const formBuilder = !below('2.0.0') && P.formType === 'FORM_BUILDER';
  const bpmn2 = all.some((e) => ['BpmnPool', 'BpmnGroup'].includes(e.tag)
    || (e.attributes.type !== undefined && ![10, 60, 80, 100, 101, 120, 126, 127].includes(type(e)))); // 02 §6.3
  const definitionVersion: Entity = {
    tag: 'ProcessDefinitionVersion', processDefinitionVersionPK: pk('processDefinitionVersionPK', 1, str(P.name), pver), // 02 §6.3: nome, não id
    versionDescription: P.descriptionVersion ?? '', formId: formBuilder ? 0 : card, formIdV2: below('2.0.0') ? null : formBuilder ? card : 0,
    editionMode: true, updateAttachmentsVersion: bool(P.updateAttachment), controlsAttachmentsSecurity: bool(P.controlsAttachmentsSecurity),
    active: bool(P.activeProcess, true), blockedVersion: false, counterSign: bool(P.counterSign), openInstances: 0,
    bpmnVersion: bpmn2 ? 2 : 1, processStates: [], favorito: false, inheritFormSecurity: bool(P.inheritFormSecurity), mobileReady: bool(P.mobileReady),
  };

  // 09 §4: listas finais cortadas por versão.
  const gated = (tag: string, list: Entity[]): Entity[][] => {
    if (!below(LIST_SINCE.get(tag) ?? '0.0.0')) {
      return [list];
    }
    if (list.length) {
      warnings.add(`${tag} ignorado: exige Fluig ${LIST_SINCE.get(tag)} (servidor ${serverVersion}).`);
    }
    return [];
  };
  const root: Value[] = [
    definition, definitionVersion, states, conditions, links, attachmentSecurity, events, advanced, lanes, compon, assocs, bends,
    triggers, extFields, formFields,
    ...gated('ProcessStateService', services), ...gated('SubProcessFieldRelationship', formMaps),
    ...gated('ProcessAppConfiguration', apps), ...gated('ProcessAttachmentRules', attachmentRules),
    ...gated('ConditionProcessAutomaticRules', rules),
  ];
  const xml = writeEcm30(root, serverVersion, warnings);
  return { xml, warnings: [...warnings] };
}
