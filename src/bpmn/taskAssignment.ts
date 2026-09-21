'use strict';

const { availableMechanisms, parseAssignmentController } = require('./gatewayConditions');

function taskAssignmentDefinition(element, businessById, formFields = [], mechanismCatalog = [], userCatalog = [], roleCatalog = []) {
  if (!supportsTaskAssignment(element)) return null;
  return {
    mechanisms: availableMechanisms([], businessById, mechanismCatalog),
    formFields: [...formFields],
    userCatalog: [...userCatalog],
    roleCatalog: [...roleCatalog],
    executorNodes: [...businessById.values()]
      .filter((item) => ['BpmnStartEvent', 'BpmnTask', 'BpmnSubProcess'].includes(item.tag))
      .map((item) => ({ id: item.id, name: item.name || item.typeLabel || item.id })),
    mechanism: String(element.attributes?.managerMechanism ?? '').trim(),
    mechanismConfiguration: parseAssignmentController(element.attributes?.managerAssignmentControllerString)
  };
}

function supportsTaskAssignment(element) {
  if (element?.tag === 'BpmnSubProcess') return String(element.type) === '101';
  if (element?.tag !== 'BpmnTask') return false;
  const type = String(element.type);
  if (['80', '81', '86', '87'].includes(type)) return true;
  if (type !== '82') return false;
  return !String(element.attributes?.executionType ?? '').trim();
}

module.exports = { supportsTaskAssignment, taskAssignmentDefinition };
