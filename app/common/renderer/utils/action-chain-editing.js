import {
  ACTION_CHAIN_CHECK_TYPES,
  ACTION_CHAIN_FAILURE_ACTIONS,
  ACTION_CHAIN_STEP_TYPES,
  DEFAULT_CHECK_STRATEGY,
  DEFAULT_CHECK_TIMEOUT_MS,
  DEFAULT_WAIT_DURATION_MS,
} from '../constants/action-chains.js';
import {prepareCommandForExecution} from './commands-tab.js';
import {getRandomId} from './other.js';

/**
 * Create a single parameter entry for a command or executeMethod step.
 *
 * @param {string} [name='']
 * @param {string} [value='']
 * @param {boolean} [required=false]
 * @returns {{id: string, name: string, value: string, required: boolean}}
 */
export function createActionChainParam(name = '', value = '', required = false) {
  return {
    id: getRandomId(),
    name,
    value,
    required: Boolean(required),
  };
}

/**
 * Create a new action chain step with defaults for the requested type.
 *
 * @param {string} [type=ACTION_CHAIN_STEP_TYPES.COMMAND]
 * @param {Object} [overrides={}]
 * @returns {Object}
 */
export function createActionChainStep(type = ACTION_CHAIN_STEP_TYPES.COMMAND, overrides = {}) {
  const id = overrides.id || getRandomId();
  switch (type) {
    case ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD:
      return {
        id,
        type: ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD,
        name: '',
        params: [],
        ...overrides,
      };
    case ACTION_CHAIN_STEP_TYPES.WAIT:
      return {
        id,
        type: ACTION_CHAIN_STEP_TYPES.WAIT,
        duration: DEFAULT_WAIT_DURATION_MS,
        ...overrides,
      };
    case ACTION_CHAIN_STEP_TYPES.CHECK:
      return {
        id,
        type: ACTION_CHAIN_STEP_TYPES.CHECK,
        checkType: ACTION_CHAIN_CHECK_TYPES.ELEMENT_EXISTS,
        strategy: DEFAULT_CHECK_STRATEGY,
        selector: '',
        value: '',
        timeout: DEFAULT_CHECK_TIMEOUT_MS,
        onFailure: ACTION_CHAIN_FAILURE_ACTIONS.STOP,
        ...overrides,
      };
    case ACTION_CHAIN_STEP_TYPES.COMMAND:
    default:
      return {
        id,
        type: ACTION_CHAIN_STEP_TYPES.COMMAND,
        name: '',
        params: [],
        ...overrides,
      };
  }
}

/**
 * Deep-clone an existing step and assign fresh UI identifiers.
 *
 * @param {Object} step
 * @returns {Object}
 */
export function duplicateActionChainStep(step) {
  const cloned = structuredClone(step);
  cloned.id = getRandomId();
  if (Array.isArray(cloned.params)) {
    cloned.params = cloned.params.map((param) => ({
      ...param,
      id: getRandomId(),
    }));
  }
  return cloned;
}

/**
 * Move one step from `fromIndex` to `toIndex` without mutating the input array.
 *
 * @param {Array<Object>} steps
 * @param {number} fromIndex
 * @param {number} toIndex
 * @returns {Array<Object>}
 */
export function moveActionChainStep(steps, fromIndex, toIndex) {
  if (
    !Array.isArray(steps) ||
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= steps.length ||
    toIndex >= steps.length
  ) {
    return steps;
  }
  const updatedSteps = [...steps];
  const [movedStep] = updatedSteps.splice(fromIndex, 1);
  updatedSteps.splice(toIndex, 0, movedStep);
  return updatedSteps;
}

/**
 * Align step parameter rows with a command/execute method's parameter definition list,
 * preserving existing values for parameters with matching names.
 *
 * @param {Array<{id?: string, name: string, value: string, required?: boolean}>} [existingParams=[]]
 * @param {Array<{name: string, required?: boolean}>} [paramDefs=[]]
 * @returns {Array<{id: string, name: string, value: string, required: boolean}>}
 */
export function syncStepParamsWithDefinition(existingParams = [], paramDefs = []) {
  const existingByName = new Map();
  for (const param of existingParams) {
    if (param && typeof param.name === 'string' && param.name.trim()) {
      existingByName.set(param.name.trim(), param);
    }
  }
  return (paramDefs || []).map((paramDef) => {
    const existing = existingByName.get(paramDef.name);
    return {
      id: existing?.id || getRandomId(),
      name: paramDef.name,
      value: existing ? String(existing.value ?? '') : '',
      required: Boolean(paramDef.required),
    };
  });
}

/**
 * Convert a command or executeMethod step into the WebdriverIO call payload.
 *
 * @param {Object} step
 * @returns {{methodName: string, args: Array<*>}}
 */
export function prepareActionChainStepCall(step) {
  const stepName = typeof step?.name === 'string' ? step.name.trim() : '';
  const isExecute = step?.type === ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD;
  const rawParams = Array.isArray(step?.params) ? step.params : [];
  const validParams = rawParams.filter((p) => p && typeof p.name === 'string' && p.name.trim().length > 0);
  const cmdParams = validParams.map((p) => ({
    name: p.name.trim(),
    required: Boolean(p.required),
  }));
  const rawValues = validParams.map((p) => p.value);
  const [methodName, args] = prepareCommandForExecution(stepName, cmdParams, rawValues, isExecute, {
    omitEmptyOptional: true,
  });
  return {methodName, args};
}

/**
 * Format a concise human-readable summary label for a step.
 *
 * @param {Object} step
 * @returns {string}
 */
export function formatActionChainStepSummary(step) {
  if (!step) {
    return '';
  }
  switch (step.type) {
    case ACTION_CHAIN_STEP_TYPES.COMMAND:
    case ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD: {
      const name = step.name?.trim() || '(unnamed)';
      const filledParams = (step.params || []).filter(
        (p) => p && typeof p.name === 'string' && p.name.trim() && p.value !== '' && p.value !== undefined,
      );
      if (filledParams.length === 0) {
        return name;
      }
      const paramSummary = filledParams.map((p) => `${p.name.trim()}=${String(p.value)}`).join(', ');
      return `${name}(${paramSummary})`;
    }
    case ACTION_CHAIN_STEP_TYPES.WAIT:
      return `wait ${step.duration ?? 0} ms`;
    case ACTION_CHAIN_STEP_TYPES.CHECK: {
      if (
        step.checkType === ACTION_CHAIN_CHECK_TYPES.ELEMENT_EXISTS ||
        step.checkType === ACTION_CHAIN_CHECK_TYPES.ELEMENT_NOT_EXISTS
      ) {
        return `${step.checkType} [${step.strategy || ''}: ${step.selector || ''}]`;
      }
      return `${step.checkType} "${step.value || ''}"`;
    }
    default:
      return String(step.type || '');
  }
}
