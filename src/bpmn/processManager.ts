'use strict';

const { availableMechanisms, parseAssignmentController } = require('./gatewayConditions');

function supportsProcessManager(element) {
  return element?.tag === 'BpmnProcess';
}

function processManagerDefinition(element, businessById, formFields = [], mechanismCatalog = [], userCatalog = [], roleCatalog = []) {
  if (!supportsProcessManager(element)) return null;
  return {
    mechanisms: availableMechanisms([], businessById, mechanismCatalog),
    formFields: [...formFields],
    userCatalog: [...userCatalog],
    roleCatalog: [...roleCatalog],
    executorNodes: [...businessById.values()]
      .filter((item) => ['BpmnStartEvent', 'BpmnTask', 'BpmnSubProcess'].includes(item.tag))
      .map((item) => ({ id: item.id, name: item.name || item.typeLabel || item.id })),
    mechanism: String(element.attributes?.managerMechanism ?? '').trim(),
    mechanismConfiguration: parseAssignmentController(element.attributes?.managerAssignmentController)
  };
}

module.exports = { processManagerDefinition, supportsProcessManager };
