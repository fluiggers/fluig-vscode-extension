'use strict';

const SUPPORTED_TASK_TYPES = new Set(['80', '81']);
const DEFAULT_CONSENSUS = '100';

function supportsTaskJoint(element) {
  return element?.tag === 'BpmnTask' && SUPPORTED_TASK_TYPES.has(String(element.type));
}

function taskJointDefinition(element) {
  if (!supportsTaskJoint(element)) return null;
  const attributes = element.attributes ?? {};
  const selectionMode = String(attributes.selecionaColaboradores ?? '1');
  if (!['1', '2'].includes(selectionMode)) {
    return {
      supported: false,
      reason: `Modo selecionaColaboradores desconhecido: ${selectionMode}.`,
      joint: false,
      consensus: DEFAULT_CONSENSUS,
      neverSelectCollaborators: false
    };
  }
  const neverSelectCollaborators = selectionMode === '2';
  const joint = attributes.atividadeConjunta === 'true' || neverSelectCollaborators;
  const consensus = validConsensus(attributes.consenso)
    ? String(Number(attributes.consenso))
    : DEFAULT_CONSENSUS;
  return { supported: true, joint, consensus, neverSelectCollaborators };
}

function normalizeTaskJointConfiguration(configuration) {
  const requested = configuration ?? {};
  const neverSelectCollaborators = booleanValue(requested.neverSelectCollaborators);
  const joint = booleanValue(requested.joint) || neverSelectCollaborators;
  if (!joint) {
    return { joint: false, consensus: '', neverSelectCollaborators: false, selectionMode: '1' };
  }
  const rawConsensus = String(requested.consensus ?? '').trim();
  if (!validConsensus(rawConsensus)) {
    throw new Error('O consenso deve ser um número inteiro entre 1 e 100.');
  }
  return {
    joint: true,
    consensus: String(Number(rawConsensus)),
    neverSelectCollaborators,
    selectionMode: neverSelectCollaborators ? '2' : '1'
  };
}

function booleanValue(value) {
  return value === true || value === 'true';
}

function validConsensus(value) {
  const raw = String(value ?? '').trim();
  return /^\d{1,3}$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 100;
}

module.exports = {
  normalizeTaskJointConfiguration,
  supportsTaskJoint,
  taskJointDefinition
};
