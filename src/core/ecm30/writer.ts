// Serializador estilo XStream do ecm30.xml (09 §5-6) e tabelas de ordem de campos e cortes por versão.

export type Value = string | number | boolean | null | undefined | Entity | Value[];
export interface Entity { tag: string; [field: string]: Value }

// Ordem de declaração dos campos de cada entidade/PK (09 §5). PKs também são entidades.
const FIELDS = new Map<string, string[]>([
  ['ProcessDefinition', 'processDefinitionPK processDescription instruction active publicProcess volumeId categoryId managerEngineAllocationId managerEngineAllocationConfiguration snapshotFrequency baseDay baseMonth periodId processDescriptionConsult uniqueCardVersion keyWord complementsLevel notifyRequisitionerComplements notifyManagerComplements deadlineTime warningDeadlineTime icon processCategoryId notifyAuthorityComplements'.split(' ')],
  ['processDefinitionPK', 'companyId processId'.split(' ')],
  ['ProcessDefinitionVersion', 'processDefinitionVersionPK versionDescription formId formIdV2 editionMode updateAttachmentsVersion controlsAttachmentsSecurity active blockedVersion counterSign processDefinition openInstances bpmnVersion processStates favorito inheritFormSecurity authorName creationDate mobileReady'.split(' ')],
  ['processDefinitionVersionPK', 'companyId processId version'.split(' ')],
  ['ProcessState', 'processStatePK stateName stateDescription instruction deadlineTime deadlineFieldName joint agreementPercentage engineAllocationId engineAllocationConfiguration selectColleague initialState notifyAuthorityDelay notifyRequisitionerDelay allowanceAuthorityTime frequenceAuthorityTime allowanceRequisitionerTime frequenceRequisitionerTime transferAttachments subProcessId formFolder notifyAuthorityFollowUp notifyRequisitionerFollowUp automatic positionX positionY forecastedEffortType forecastedEffort notifyManagerFollowUp notifyManagerDelay allowanceManagerTime frequenceManagerTime inhibitTransfer periodId stateType bpmnType signalId counterSign openInstances noticeExpirationAuthorityTime noticeExpirationRequisitionerTime noticeExpirationManagerTime cancelSubProcess destinationStates digitalSignature parentSequence executionType sendToNextTaskInSubProcess'.split(' ')],
  ['processStatePK', 'companyId processId version sequence'.split(' ')],
  ['ConditionProcessState', 'conditionProcessStatePK conditionName condition destinationSequenceId engineAllocationConfiguration engineAllocationId conditionType'.split(' ')],
  ['conditionProcessStatePK', 'companyId processId expressionOrder version sequence'.split(' ')],
  ['ProcessLink', 'processLinkPK actionLabel returnPermited initialStateSequence finalStateSequence returnLabel name automaticLink defaultLink type expression movementTitle movementDescription movementAccessLinkDescription'.split(' ')],
  ['processLinkPK', 'companyId processId version linkSequence'.split(' ')],
  ['ProcessAttachmentSecurity', 'processAttachmentSecurityPK engineAllocationId engineAllocationConfiguration accessLevel editionMode'.split(' ')],
  ['processAttachmentSecurityPK', 'companyId processId version sequence'.split(' ')],
  ['WorkflowProcessEvent', 'workflowProcessEventPK eventDescription managedScript'.split(' ')],
  ['workflowProcessEventPK', 'companyId eventId processId version'.split(' ')],
  ['AdvancedProcessProperties', 'advancedProcessPropertiesPK propertieValue'.split(' ')],
  ['advancedProcessPropertiesPK', 'companyId processId propertyId version'.split(' ')],
  ['SwimLane', 'color height width positionX positionY stateName type parentSequence swimLanePK'.split(' ')],
  ['swimLanePK', 'companyId processId version sequence'.split(' ')],
  ['ProcessComponGraf', 'componType positionX positionY processComponGrafPK stateName'.split(' ')],
  ['processComponGrafPK', 'companyId processId version componGrafSequence'.split(' ')],
  ['ProcessLinkAssoc', 'processLinkAssocPK initialStateSequence finalStateSequence'.split(' ')],
  ['processLinkAssocPK', 'companyId processId version linkSequence'.split(' ')],
  ['ProcessLinkBend', 'processLinkBendPK positionX positionY'.split(' ')],
  ['processLinkBendPK', 'companyId processId version linkSequence bendSequence'.split(' ')],
  ['ProcessStateTrigger', 'processStateTriggerPK runType type value timeTrigger frequencia diaSemana jobName'.split(' ')],
  ['processStateTriggerPK', 'companyId processId version stateSequence triggerSequence'.split(' ')],
  ['ProcessStateConditionScript', 'processStateConditionPK script'.split(' ')],
  ['ProcessStateConditionSignal', 'processStateConditionPK signalId'.split(' ')],
  ['processStateConditionPK', 'companyId processId version stateSequence conditionSequence'.split(' ')],
  ['ExtendedPropertyField', 'extendedPropertyFieldPK propertyType propertyDescription propertyValue isDefaultProperty'.split(' ')],
  ['extendedPropertyFieldPK', 'companyId processId version stateSequence propertyName'.split(' ')],
  ['ProcessFormField', 'processFormFieldPK fieldDescription slotId'.split(' ')],
  ['processFormFieldPK', 'companyId processId fieldId'.split(' ')],
  ['ProcessStateService', 'id companyId processId version sequence attempts sucessFullMessage serviceName frequency frequencyType'.split(' ')],
  ['SubProcessFieldRelationship', 'formMapId tenantId processCode stateSequence version subProcessCode processField subProcessField mapFlow'.split(' ')],
  ['ProcessAppConfiguration', 'id tenantId processId processVersion stateSequence appKey appField description'.split(' ')],
  ['ProcessAttachmentRules', 'id tenantId processId processVersion stateSequence operator amount name message'.split(' ')],
  ['ConditionProcessAutomaticRules', 'sequence expressionOrder ruleOrder field value operator valueType'.split(' ')],
]);

// 09 §2: campo omitido se o servidor for menor que a versão mínima; [versão, padrão p/ aviso].
const FIELD_SINCE = new Map<string, [string, Value]>([
  ['ProcessState.digitalSignature', ['1.4.4', false]],
  ['ProcessDefinitionVersion.inheritFormSecurity', ['1.4.7', false]],
  ['ProcessDefinitionVersion.mobileReady', ['1.5.0', false]],
  ['ProcessDefinition.complementsLevel', ['1.5.8', 0]],
  ['ProcessDefinition.notifyRequisitionerComplements', ['1.5.8', false]],
  ['ProcessDefinition.notifyManagerComplements', ['1.5.8', false]],
  ['ProcessDefinition.notifyAuthorityComplements', ['1.5.8', false]],
  ['ProcessState.parentSequence', ['1.5.9', 0]],
  ['ProcessState.executionType', ['1.5.9', 0]],
  ['ProcessState.sendToNextTaskInSubProcess', ['1.5.12', false]],
  ['ProcessLink.defaultLink', ['1.6.0', false]],
  ['ProcessDefinition.deadlineTime', ['1.6.1', 0]],
  ['ProcessDefinition.warningDeadlineTime', ['1.6.1', 0]],
  ['ProcessState.deadlineFieldName', ['1.6.2', '']],
  ['ProcessLink.movementTitle', ['1.6.5', '']],
  ['ProcessLink.movementDescription', ['1.6.5', '']],
  ['ProcessLink.movementAccessLinkDescription', ['1.6.5', '']],
  ['ConditionProcessState.conditionType', ['1.6.5', '']], // padrão "" ⇒ sempre avisa
  // Ausente no WorkflowProcessEvent de 1.7.1 e 1.8.2 (javap nos servidores): o XStream rejeita o import inteiro
  // ("Erro durante a leitura do XML"). O Studio 2.0.0.9 grava sempre. Omitir o padrão false é inofensivo.
  ['WorkflowProcessEvent.managedScript', ['2.0.0', false]],
]);

// 09 §4: listas 16-20 (índices 13-17 dentro da raiz, depois de PD e PDV) só existem a partir de:
export const LIST_SINCE = new Map<string, string>([
  ['ProcessStateService', '1.5.9'],
  ['SubProcessFieldRelationship', '1.5.12'],
  ['ProcessAppConfiguration', '1.6.2'],
  ['ProcessAttachmentRules', '1.6.4'],
  ['ConditionProcessAutomaticRules', '1.6.5'],
]);

/** Compara `major.minor.micro` numericamente; qualificador ignorado (09 §1). */
export function versionLess(version: string, min: string): boolean {
  const parse = (v: string) => v.split('.').slice(0, 3).map((part) => parseInt(part, 10) || 0);
  const a = parse(version);
  const b = parse(min);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) {
      return (a[i] ?? 0) < (b[i] ?? 0);
    }
  }
  return false;
}

/** Monta uma PK (ou entidade pequena) com valores posicionais na ordem de FIELDS. */
export function pk(tag: string, ...values: Value[]): Entity {
  const entity: Entity = { tag };
  (FIELDS.get(tag) ?? []).forEach((field, i) => { entity[field] = values[i]; });
  return entity;
}

const ENTITIES = new Map([['&', '&amp;'], ['<', '&lt;'], ['>', '&gt;'], ['"', '&quot;'], ["'", '&apos;']]);

// Tab e \n crus; \r e demais controles viram &#x..; (PrettyPrintWriter do XStream em modo quirks; sem caso no corpus).
function escape(text: string): string {
  return text.replace(/[&<>"']|[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, (c) => ENTITIES.get(c) ?? `&#x${c.charCodeAt(0).toString(16)};`);
}

/**
 * Serializa a raiz (lista de entidades e listas) como o PrettyPrintWriter do XStream:
 * 2 espaços, LF, sem declaração e sem LF final; `null` omitido; campo de versão mais nova omitido.
 */
export function writeEcm30(root: Value[], serverVersion: string | undefined, warnings: Set<string>): string {
  const out: string[] = [];
  const write = (name: string, value: Value, indent: string): void => {
    if (value === null || value === undefined) {
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) { out.push(`${indent}<${name}/>`); return; }
      out.push(`${indent}<${name}>`);
      for (const item of value) {
        write(Array.isArray(item) ? 'list' : (item as Entity).tag, item, `${indent}  `);
      }
      out.push(`${indent}</${name}>`);
      return;
    }
    if (typeof value === 'object') {
      out.push(`${indent}<${name}>`);
      for (const field of FIELDS.get(value.tag) ?? []) {
        const since = FIELD_SINCE.get(`${value.tag}.${field}`);
        if (since && serverVersion && versionLess(serverVersion, since[0])) {
          if (value[field] !== null && value[field] !== undefined && value[field] !== since[1]) {
            warnings.add(`${value.tag}.${field} ignorado: exige Fluig ${since[0]} (servidor ${serverVersion}).`);
          }
          continue;
        }
        write(field, value[field], `${indent}  `);
      }
      out.push(`${indent}</${name}>`);
      return;
    }
    out.push(`${indent}<${name}>${escape(String(value))}</${name}>`);
  };
  write('list', root, '');
  return out.join('\n');
}
