import {LOCATOR_STRATEGIES} from './session-inspector.js';

export const SAVED_ACTION_CHAINS_TABLE_VALUES = {
  STEPS_COLUMN_WIDTH: '75px',
  DATE_COLUMN_WIDTH: '105px',
  ACTIONS_COLUMN_WIDTH: '150px',
};

export const ACTION_CHAIN_STEP_TYPES = {
  COMMAND: 'command',
  EXECUTE_METHOD: 'executeMethod',
  WAIT: 'wait',
  CHECK: 'check',
};

export const ACTION_CHAIN_CHECK_TYPES = {
  ELEMENT_EXISTS: 'elementExists',
  ELEMENT_NOT_EXISTS: 'elementNotExists',
  SOURCE_CONTAINS: 'sourceContains',
  SOURCE_NOT_CONTAINS: 'sourceNotContains',
};

export const ACTION_CHAIN_FAILURE_ACTIONS = {
  STOP: 'stop',
  CONTINUE: 'continue',
};

export const ACTION_CHAIN_STEP_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

export const ACTION_CHAIN_RUN_STATUS = {
  PASSED: 'passed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export const DEFAULT_WAIT_DURATION_MS = 1000;
export const DEFAULT_CHECK_TIMEOUT_MS = 0;
export const CHECK_POLL_INTERVAL_MS = 250;
export const DEFAULT_CHECK_STRATEGY = LOCATOR_STRATEGIES.ACCESSIBILITY_ID;
