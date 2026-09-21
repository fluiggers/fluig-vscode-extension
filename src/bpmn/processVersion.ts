'use strict';

function supportsProcessVersion(element) {
  return element?.tag === 'BpmnProcess';
}

function processVersionDefinition(element) {
  if (!supportsProcessVersion(element)) return null;
  const attributes = element.attributes ?? {};
  return {
    supported: true,
    version: String(attributes.version ?? ''),
    instructions: String(attributes.descriptionVersion ?? ''),
    updateAttachment: isTrue(attributes.updateAttachment),
    confirmPassword: isTrue(attributes.counterSign),
    mobileProcess: isTrue(attributes.mobileReady)
  };
}

function normalizeProcessVersionConfiguration(configuration) {
  const requested = configuration ?? {};
  return {
    instructions: String(requested.instructions ?? '').replace(/\r\n|\r|\n/g, '\r\n'),
    updateAttachment: requested.updateAttachment === true,
    confirmPassword: requested.confirmPassword === true,
    mobileProcess: requested.mobileProcess === true
  };
}

function isTrue(value) {
  return value === true || String(value ?? '').toLowerCase() === 'true';
}

module.exports = {
  normalizeProcessVersionConfiguration,
  processVersionDefinition,
  supportsProcessVersion
};
