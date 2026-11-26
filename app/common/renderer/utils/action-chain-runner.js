import {
  ACTION_CHAIN_CHECK_TYPES,
  ACTION_CHAIN_FAILURE_ACTIONS,
  ACTION_CHAIN_RUN_STATUS,
  ACTION_CHAIN_STEP_STATUS,
  ACTION_CHAIN_STEP_TYPES,
  CHECK_POLL_INTERVAL_MS,
} from '../constants/action-chains.js';
import {formatActionChainStepSummary, prepareActionChainStepCall} from './action-chain-editing.js';

/**
 * Sleep for `ms` milliseconds, resolving immediately if `signal` is aborted.
 *
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export function sleepWithSignal(ms, signal) {
  if (ms <= 0 || signal?.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, {once: true});
  });
}

/**
 * Evaluate a single check step condition once against the active session.
 *
 * @param {Object} step
 * @param {{executeCommand: Function, getPageSource: Function}} context
 * @returns {Promise<{passed: boolean, detail: string}>}
 */
async function evaluateCheckOnce(step, {executeCommand, getPageSource}) {
  switch (step.checkType) {
    case ACTION_CHAIN_CHECK_TYPES.ELEMENT_EXISTS:
    case ACTION_CHAIN_CHECK_TYPES.ELEMENT_NOT_EXISTS: {
      const strategy = step.strategy?.trim();
      const selector = step.selector?.trim();
      if (!strategy || !selector) {
        throw new Error('Check step requires both a locator strategy and selector');
      }
      const response = await executeCommand({
        methodName: 'findElements',
        args: [strategy, selector],
      });
      const elements = response?.commandRes;
      const count = Array.isArray(elements) ? elements.length : 0;
      const expectExists = step.checkType === ACTION_CHAIN_CHECK_TYPES.ELEMENT_EXISTS;
      const passed = expectExists ? count > 0 : count === 0;
      const detail = expectExists
        ? `Expected element (${strategy}: ${selector}) to exist; found ${count}`
        : `Expected element (${strategy}: ${selector}) not to exist; found ${count}`;
      return {passed, detail};
    }
    case ACTION_CHAIN_CHECK_TYPES.SOURCE_CONTAINS:
    case ACTION_CHAIN_CHECK_TYPES.SOURCE_NOT_CONTAINS: {
      const expectedText = step.value;
      if (typeof expectedText !== 'string' || expectedText.length === 0) {
        throw new Error('Check step requires a non-empty text value');
      }
      const source = await getPageSource();
      const sourceText = typeof source === 'string' ? source : '';
      const contains = sourceText.includes(expectedText);
      const expectContains = step.checkType === ACTION_CHAIN_CHECK_TYPES.SOURCE_CONTAINS;
      const passed = expectContains ? contains : !contains;
      const detail = expectContains
        ? `Expected page source to contain "${expectedText}"`
        : `Expected page source not to contain "${expectedText}"`;
      return {passed, detail};
    }
    default:
      throw new Error(`Unsupported check type: ${step.checkType}`);
  }
}

/**
 * Execute an action chain sequentially with support for commands, execute methods, waits,
 * checks (with optional polling timeout), and cancellation.
 *
 * @param {Object} chain Action chain containing `name` and `steps`
 * @param {Object} context Execution callbacks
 * @param {Function} context.executeCommand Executes `{methodName, args}` against the driver
 * @param {Function} context.getPageSource Retrieves raw page source string from the driver
 * @param {Function} [context.sleep] Optional custom sleep implementation `(ms, signal) => Promise<void>`
 * @param {AbortSignal} [context.signal] Optional abort signal to cancel execution
 * @param {Function} [context.onStepStart] Callback `(stepIndex, stepResult)`
 * @param {Function} [context.onStepComplete] Callback `(stepIndex, stepResult)`
 * @param {number} [context.pollIntervalMs] Polling interval for check timeouts
 * @param {Function} [context.now] Timestamp provider in milliseconds
 * @returns {Promise<{
 *   status: string,
 *   hasDriverCommands: boolean,
 *   stepResults: Array<Object>,
 *   failedStepIndex: number|null,
 *   error: string|null,
 * }>}
 */
export async function executeActionChain(chain, context) {
  const {
    executeCommand,
    getPageSource,
    sleep = sleepWithSignal,
    signal,
    onStepStart,
    onStepComplete,
    pollIntervalMs = CHECK_POLL_INTERVAL_MS,
    now = () => Date.now(),
  } = context;

  const steps = Array.isArray(chain?.steps) ? chain.steps : [];
  const stepResults = steps.map((step, index) => ({
    stepIndex: index,
    stepId: step.id ?? String(index + 1),
    type: step.type,
    label: formatActionChainStepSummary(step),
    status: ACTION_CHAIN_STEP_STATUS.PENDING,
    durationMs: 0,
    result: undefined,
    error: null,
  }));

  let hasDriverCommands = false;
  let failedStepIndex = null;
  let firstError = null;
  let aborted = false;

  const markRemainingSkipped = (startIndex) => {
    for (let j = startIndex; j < stepResults.length; j++) {
      stepResults[j] = {
        ...stepResults[j],
        status: ACTION_CHAIN_STEP_STATUS.SKIPPED,
      };
      onStepComplete?.(j, stepResults[j]);
    }
  };

  for (let i = 0; i < steps.length; i++) {
    if (signal?.aborted) {
      aborted = true;
      markRemainingSkipped(i);
      break;
    }

    const step = steps[i];
    const startedAt = now();
    stepResults[i] = {
      ...stepResults[i],
      status: ACTION_CHAIN_STEP_STATUS.RUNNING,
    };
    onStepStart?.(i, stepResults[i]);

    try {
      if (step.type === ACTION_CHAIN_STEP_TYPES.COMMAND || step.type === ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD) {
        if (!step.name || !step.name.trim()) {
          throw new Error('Command name is required');
        }
        const {methodName, args} = prepareActionChainStepCall(step);
        hasDriverCommands = true;
        const response =
          methodName === 'getPageSource' && step.type === ACTION_CHAIN_STEP_TYPES.COMMAND
            ? {commandRes: await getPageSource()}
            : await executeCommand({methodName, args});

        if (signal?.aborted) {
          aborted = true;
          stepResults[i] = {
            ...stepResults[i],
            status: ACTION_CHAIN_STEP_STATUS.SKIPPED,
            durationMs: Math.max(0, now() - startedAt),
          };
          onStepComplete?.(i, stepResults[i]);
          markRemainingSkipped(i + 1);
          break;
        }

        stepResults[i] = {
          ...stepResults[i],
          status: ACTION_CHAIN_STEP_STATUS.PASSED,
          result: response?.commandRes,
          durationMs: Math.max(0, now() - startedAt),
        };
        onStepComplete?.(i, stepResults[i]);
      } else if (step.type === ACTION_CHAIN_STEP_TYPES.WAIT) {
        const duration = Number(step.duration);
        if (!Number.isFinite(duration) || duration < 0) {
          throw new Error('Wait duration must be a non-negative number');
        }
        await sleep(duration, signal);
        if (signal?.aborted) {
          aborted = true;
          stepResults[i] = {
            ...stepResults[i],
            status: ACTION_CHAIN_STEP_STATUS.SKIPPED,
            durationMs: Math.max(0, now() - startedAt),
          };
          onStepComplete?.(i, stepResults[i]);
          markRemainingSkipped(i + 1);
          break;
        }
        stepResults[i] = {
          ...stepResults[i],
          status: ACTION_CHAIN_STEP_STATUS.PASSED,
          durationMs: Math.max(0, now() - startedAt),
        };
        onStepComplete?.(i, stepResults[i]);
      } else if (step.type === ACTION_CHAIN_STEP_TYPES.CHECK) {
        const timeoutMs = Number.isFinite(Number(step.timeout)) ? Math.max(0, Number(step.timeout)) : 0;
        const deadline = startedAt + timeoutMs;
        let checkOutcome = null;
        let lastCheckError = null;

        while (true) {
          if (signal?.aborted) {
            aborted = true;
            break;
          }
          try {
            checkOutcome = await evaluateCheckOnce(step, {executeCommand, getPageSource});
            lastCheckError = null;
            if (checkOutcome.passed) {
              break;
            }
          } catch (err) {
            lastCheckError = err;
          }

          const remaining = deadline - now();
          if (remaining <= 0) {
            break;
          }
          await sleep(Math.min(pollIntervalMs, remaining), signal);
        }

        if (aborted || signal?.aborted) {
          aborted = true;
          stepResults[i] = {
            ...stepResults[i],
            status: ACTION_CHAIN_STEP_STATUS.SKIPPED,
            durationMs: Math.max(0, now() - startedAt),
          };
          onStepComplete?.(i, stepResults[i]);
          markRemainingSkipped(i + 1);
          break;
        }

        if (checkOutcome?.passed) {
          stepResults[i] = {
            ...stepResults[i],
            status: ACTION_CHAIN_STEP_STATUS.PASSED,
            result: checkOutcome.detail,
            durationMs: Math.max(0, now() - startedAt),
          };
          onStepComplete?.(i, stepResults[i]);
        } else {
          const failureMessage = lastCheckError
            ? lastCheckError.message || String(lastCheckError)
            : checkOutcome?.detail || 'Check failed';
          if (failedStepIndex === null) {
            failedStepIndex = i;
            firstError = failureMessage;
          }
          stepResults[i] = {
            ...stepResults[i],
            status: ACTION_CHAIN_STEP_STATUS.FAILED,
            error: failureMessage,
            durationMs: Math.max(0, now() - startedAt),
          };
          onStepComplete?.(i, stepResults[i]);

          if (step.onFailure !== ACTION_CHAIN_FAILURE_ACTIONS.CONTINUE) {
            markRemainingSkipped(i + 1);
            break;
          }
        }
      } else {
        throw new Error(`Unsupported step type: ${step.type}`);
      }
    } catch (err) {
      const errorMessage = err?.message || String(err);
      if (failedStepIndex === null) {
        failedStepIndex = i;
        firstError = errorMessage;
      }
      stepResults[i] = {
        ...stepResults[i],
        status: ACTION_CHAIN_STEP_STATUS.FAILED,
        error: errorMessage,
        durationMs: Math.max(0, now() - startedAt),
      };
      onStepComplete?.(i, stepResults[i]);
      markRemainingSkipped(i + 1);
      break;
    }
  }

  let status = ACTION_CHAIN_RUN_STATUS.PASSED;
  if (aborted) {
    status = ACTION_CHAIN_RUN_STATUS.CANCELLED;
  } else if (failedStepIndex !== null) {
    status = ACTION_CHAIN_RUN_STATUS.FAILED;
  }

  return {
    status,
    hasDriverCommands,
    stepResults,
    failedStepIndex,
    error: firstError,
  };
}
