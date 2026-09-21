'use strict';

const SUPPORTED_TASK_TYPES = new Set(['80', '81']);

function supportsTaskNotifications(element) {
  return element?.tag === 'BpmnTask' && SUPPORTED_TASK_TYPES.has(String(element.type));
}

function taskNotificationsDefinition(element) {
  if (!supportsTaskNotifications(element)) return null;
  const attributes = element.attributes ?? {};
  const responsibleTimingPresent = [
    'emAtrasoNotificarResponsavelTolerancia',
    'emAtrasoNotificarResponsavelFrequencia',
    'noticeExpirationAuthorityTime'
  ].some((name) => attributes[name] !== undefined);
  return {
    notifyResponsible: attributes.authNotify === 'true',
    notifyRequester: attributes.notificaRequisitante === 'true',
    lateResponsible: attributes.emAtrasoNotificarResponsavel === 'true'
      || (attributes.emAtrasoNotificarResponsavel !== 'false' && responsibleTimingPresent),
    lateResponsibleTolerance: minutesToDuration(attributes.emAtrasoNotificarResponsavelTolerancia),
    lateResponsibleFrequency: minutesToDuration(attributes.emAtrasoNotificarResponsavelFrequencia),
    lateResponsibleExpiration: minutesToDuration(attributes.noticeExpirationAuthorityTime),
    lateRequester: attributes.emAtrasoNotificarRequisitante === 'true',
    lateRequesterTolerance: minutesToDuration(attributes.emAtrasoNotificarRequisitanteTolerancia),
    lateRequesterFrequency: minutesToDuration(attributes.emAtrasoNotificarRequisitanteFrequencia),
    lateRequesterExpiration: minutesToDuration(attributes.noticeExpirationRequisitionerTime)
  };
}

function minutesToDuration(rawValue) {
  const total = Number.parseFloat(rawValue ?? '0');
  if (!Number.isFinite(total) || total < 0) return '000:00';
  const minutes = Math.round(total);
  return `${String(Math.floor(minutes / 60)).padStart(3, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

module.exports = { supportsTaskNotifications, taskNotificationsDefinition };
