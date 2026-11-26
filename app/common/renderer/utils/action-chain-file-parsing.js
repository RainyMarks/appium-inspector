import {
  ACTION_CHAIN_CHECK_TYPES,
  ACTION_CHAIN_FAILURE_ACTIONS,
  ACTION_CHAIN_STEP_TYPES,
  DEFAULT_CHECK_TIMEOUT_MS,
} from '../constants/action-chains.js';
import {isPlainObject} from './common.js';
import {log} from './logger.js';
import {getRandomId} from './other.js';

const VALID_STEP_TYPES = new Set(Object.values(ACTION_CHAIN_STEP_TYPES));
const VALID_CHECK_TYPES = new Set(Object.values(ACTION_CHAIN_CHECK_TYPES));
const VALID_FAILURE_ACTIONS = new Set(Object.values(ACTION_CHAIN_FAILURE_ACTIONS));
const ELEMENT_CHECK_TYPES = new Set([
  ACTION_CHAIN_CHECK_TYPES.ELEMENT_EXISTS,
  ACTION_CHAIN_CHECK_TYPES.ELEMENT_NOT_EXISTS,
]);
const SOURCE_CHECK_TYPES = new Set([
  ACTION_CHAIN_CHECK_TYPES.SOURCE_CONTAINS,
  ACTION_CHAIN_CHECK_TYPES.SOURCE_NOT_CONTAINS,
]);

/**
 * Parse and validate an action chain JSON file string.
 *
 * @param {string} fileString Raw JSON file contents
 * @returns {object|null} Validated action chain object, or null if invalid
 */
export function parseActionChainFileContents(fileString) {
  let chainJSON;
  try {
    chainJSON = JSON.parse(fileString);
  } catch {
    log.error('Error parsing action chain file: file is not valid JSON');
    return null;
  }
  return validateActionChainJSON(chainJSON);
}

/**
 * Validate the structure of a parsed action chain JSON object.
 *
 * @param {unknown} chainJSON Parsed JSON value
 * @returns {object|null} Validated object, or null if validation failed
 */
export function validateActionChainJSON(chainJSON) {
  if (!isPlainObject(chainJSON)) {
    logValidationError('root value is not an object');
    return null;
  }
  if (!hasNonEmptyStringProperty(chainJSON, 'name')) {
    return null;
  }
  if (Object.hasOwn(chainJSON, 'description') && typeof chainJSON.description !== 'string') {
    logValidationError("'description' property is not a string");
    return null;
  }
  if (!Object.hasOwn(chainJSON, 'steps') || !Array.isArray(chainJSON.steps)) {
    logValidationError("'steps' property is missing or not an array");
    return null;
  }
  for (const step of chainJSON.steps) {
    if (!isStepValid(step)) {
      return null;
    }
  }
  return chainJSON;
}

/**
 * Normalize an action chain into a fresh object with UI IDs and clean defaults.
 *
 * @param {Object} chainJSON Validated or saved action chain
 * @returns {Object} Normalized action chain copy
 */
export function normalizeActionChain(chainJSON) {
  const normalized = {
    name: String(chainJSON.name ?? '').trim(),
    description: typeof chainJSON.description === 'string' ? chainJSON.description : '',
    steps: (chainJSON.steps || []).map((step) => normalizeStep(step)),
  };
  if (typeof chainJSON.id === 'string' && chainJSON.id.trim()) {
    normalized.id = chainJSON.id;
  }
  if (typeof chainJSON.date === 'number' && Number.isFinite(chainJSON.date)) {
    normalized.date = chainJSON.date;
  }
  return normalized;
}

/**
 * Prepare an action chain for JSON export by stripping internal metadata and UI-only IDs.
 *
 * @param {Object} chainJSON Saved action chain
 * @returns {Object} Clean export payload
 */
export function prepareActionChainForExport(chainJSON) {
  return {
    name: chainJSON.name,
    description: chainJSON.description ?? '',
    steps: (chainJSON.steps || []).map((step) => stripStepForExport(step)),
  };
}

function normalizeStep(step) {
  const id = typeof step.id === 'string' && step.id.trim() ? step.id : getRandomId();
  switch (step.type) {
    case ACTION_CHAIN_STEP_TYPES.COMMAND:
    case ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD:
      return {
        id,
        type: step.type,
        name: step.name.trim(),
        params: (step.params || []).map((param) => ({
          id: typeof param.id === 'string' && param.id.trim() ? param.id : getRandomId(),
          name: param.name.trim(),
          value: param.value === undefined || param.value === null ? '' : String(param.value),
          required: Boolean(param.required),
        })),
      };
    case ACTION_CHAIN_STEP_TYPES.WAIT:
      return {
        id,
        type: ACTION_CHAIN_STEP_TYPES.WAIT,
        duration: step.duration,
      };
    case ACTION_CHAIN_STEP_TYPES.CHECK:
      return {
        id,
        type: ACTION_CHAIN_STEP_TYPES.CHECK,
        checkType: step.checkType,
        strategy: typeof step.strategy === 'string' ? step.strategy : '',
        selector: typeof step.selector === 'string' ? step.selector : '',
        value: typeof step.value === 'string' ? step.value : '',
        timeout:
          typeof step.timeout === 'number' && Number.isFinite(step.timeout) ? step.timeout : DEFAULT_CHECK_TIMEOUT_MS,
        onFailure: VALID_FAILURE_ACTIONS.has(step.onFailure) ? step.onFailure : ACTION_CHAIN_FAILURE_ACTIONS.STOP,
      };
    default:
      return {id, ...step};
  }
}

function stripStepForExport(step) {
  switch (step.type) {
    case ACTION_CHAIN_STEP_TYPES.COMMAND:
    case ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD: {
      const exported = {
        type: step.type,
        name: step.name,
      };
      const cleanParams = (step.params || [])
        .filter((p) => p && typeof p.name === 'string' && p.name.trim().length > 0)
        .map((p) => ({
          name: p.name.trim(),
          value: p.value === undefined || p.value === null ? '' : String(p.value),
          ...(p.required ? {required: true} : {}),
        }));
      if (cleanParams.length > 0) {
        exported.params = cleanParams;
      }
      return exported;
    }
    case ACTION_CHAIN_STEP_TYPES.WAIT:
      return {
        type: ACTION_CHAIN_STEP_TYPES.WAIT,
        duration: step.duration,
      };
    case ACTION_CHAIN_STEP_TYPES.CHECK: {
      const exported = {
        type: ACTION_CHAIN_STEP_TYPES.CHECK,
        checkType: step.checkType,
      };
      if (ELEMENT_CHECK_TYPES.has(step.checkType)) {
        exported.strategy = step.strategy;
        exported.selector = step.selector;
      } else {
        exported.value = step.value;
      }
      if (step.timeout) {
        exported.timeout = step.timeout;
      }
      if (step.onFailure && step.onFailure !== ACTION_CHAIN_FAILURE_ACTIONS.STOP) {
        exported.onFailure = step.onFailure;
      }
      return exported;
    }
    default:
      return {...step};
  }
}

function isStepValid(step) {
  if (!isPlainObject(step)) {
    return logValidationError(`step '${JSON.stringify(step)}' is not an object`);
  }
  if (!Object.hasOwn(step, 'type') || !VALID_STEP_TYPES.has(step.type)) {
    return logValidationError(`step '${JSON.stringify(step)}' has unsupported type '${step.type}'`);
  }
  if (Object.hasOwn(step, 'id') && !hasNonEmptyStringProperty(step, 'id', 'step ')) {
    return false;
  }

  switch (step.type) {
    case ACTION_CHAIN_STEP_TYPES.COMMAND:
    case ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD:
      return isCommandStepValid(step);
    case ACTION_CHAIN_STEP_TYPES.WAIT:
      return isWaitStepValid(step);
    case ACTION_CHAIN_STEP_TYPES.CHECK:
      return isCheckStepValid(step);
    default:
      return false;
  }
}

function isCommandStepValid(step) {
  if (!hasNonEmptyStringProperty(step, 'name', `step '${step.type}' `)) {
    return false;
  }
  if (!Object.hasOwn(step, 'params') || step.params === undefined) {
    return true;
  }
  if (!Array.isArray(step.params)) {
    return logValidationError(`step '${step.name}' 'params' property is not an array`);
  }
  for (const param of step.params) {
    if (!isPlainObject(param)) {
      return logValidationError(`step '${step.name}' contains a non-object parameter`);
    }
    if (!hasNonEmptyStringProperty(param, 'name', `step '${step.name}' parameter `)) {
      return false;
    }
    if (
      Object.hasOwn(param, 'value') &&
      param.value !== undefined &&
      param.value !== null &&
      !['string', 'number', 'boolean'].includes(typeof param.value)
    ) {
      return logValidationError(`step '${step.name}' parameter '${param.name}' has invalid value type`);
    }
    if (Object.hasOwn(param, 'required') && typeof param.required !== 'boolean') {
      return logValidationError(`step '${step.name}' parameter '${param.name}' 'required' property is not a boolean`);
    }
  }
  return true;
}

function isWaitStepValid(step) {
  if (!Object.hasOwn(step, 'duration') || !isNonNegativeFiniteNumber(step.duration)) {
    return logValidationError(`wait step 'duration' property must be a non-negative finite number`);
  }
  return true;
}

function isCheckStepValid(step) {
  if (!Object.hasOwn(step, 'checkType') || !VALID_CHECK_TYPES.has(step.checkType)) {
    return logValidationError(`check step has unsupported checkType '${step.checkType}'`);
  }
  if (ELEMENT_CHECK_TYPES.has(step.checkType)) {
    if (
      !hasNonEmptyStringProperty(step, 'strategy', 'check step ') ||
      !hasNonEmptyStringProperty(step, 'selector', 'check step ')
    ) {
      return false;
    }
  } else if (SOURCE_CHECK_TYPES.has(step.checkType)) {
    if (!hasNonEmptyStringProperty(step, 'value', 'check step ')) {
      return false;
    }
  }
  if (Object.hasOwn(step, 'timeout') && !isNonNegativeFiniteNumber(step.timeout)) {
    return logValidationError(`check step 'timeout' property must be a non-negative finite number`);
  }
  if (Object.hasOwn(step, 'onFailure') && !VALID_FAILURE_ACTIONS.has(step.onFailure)) {
    return logValidationError(`check step has unsupported onFailure value '${step.onFailure}'`);
  }
  return true;
}

function isNonNegativeFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0;
}

function hasNonEmptyStringProperty(object, propName, prefix = '') {
  if (!Object.hasOwn(object, propName) || typeof object[propName] !== 'string') {
    return logValidationError(`${prefix}'${propName}' property is missing or not a string`);
  }
  if (object[propName].trim().length === 0) {
    return logValidationError(`${prefix}'${propName}' property is empty or only whitespace`);
  }
  return true;
}

function logValidationError(text) {
  log.error(`Error validating action chain file: ${text}`);
  return false;
}
