import {describe, expect, it, vi} from 'vitest';

import {
  ACTION_CHAIN_CHECK_TYPES,
  ACTION_CHAIN_FAILURE_ACTIONS,
  ACTION_CHAIN_RUN_STATUS,
  ACTION_CHAIN_STEP_STATUS,
  ACTION_CHAIN_STEP_TYPES,
} from '../../app/common/renderer/constants/action-chains.js';
import {
  createActionChainParam,
  createActionChainStep,
  duplicateActionChainStep,
  formatActionChainStepSummary,
  moveActionChainStep,
  prepareActionChainStepCall,
  syncStepParamsWithDefinition,
} from '../../app/common/renderer/utils/action-chain-editing.js';
import {
  normalizeActionChain,
  parseActionChainFileContents,
  prepareActionChainForExport,
  validateActionChainJSON,
} from '../../app/common/renderer/utils/action-chain-file-parsing.js';
import {executeActionChain, sleepWithSignal} from '../../app/common/renderer/utils/action-chain-runner.js';

describe('utils/action-chain-editing.js', function () {
  it('should create default steps for each supported type', function () {
    const cmdStep = createActionChainStep(ACTION_CHAIN_STEP_TYPES.COMMAND);
    const execStep = createActionChainStep(ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD);
    const waitStep = createActionChainStep(ACTION_CHAIN_STEP_TYPES.WAIT);
    const checkStep = createActionChainStep(ACTION_CHAIN_STEP_TYPES.CHECK);

    expect(cmdStep).toMatchObject({type: 'command', name: '', params: []});
    expect(execStep).toMatchObject({type: 'executeMethod', name: '', params: []});
    expect(waitStep).toMatchObject({type: 'wait', duration: 1000});
    expect(checkStep).toMatchObject({
      type: 'check',
      checkType: 'elementExists',
      strategy: 'accessibility id',
      selector: '',
      timeout: 0,
      onFailure: 'stop',
    });
  });

  it('should duplicate a step with fresh step and parameter IDs', function () {
    const original = createActionChainStep(ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD, {
      name: 'mobile: terminateApp',
      params: [createActionChainParam('bundleId', 'com.example.app', true)],
    });
    const copy = duplicateActionChainStep(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy.params[0].id).not.toBe(original.params[0].id);
    expect(copy.name).toBe('mobile: terminateApp');
    expect(copy.params[0].value).toBe('com.example.app');
  });

  it('should move steps immutably and ignore invalid indices', function () {
    const steps = [{id: '1'}, {id: '2'}, {id: '3'}];
    expect(moveActionChainStep(steps, 0, 2).map((s) => s.id)).toEqual(['2', '3', '1']);
    expect(steps.map((s) => s.id)).toEqual(['1', '2', '3']);
    expect(moveActionChainStep(steps, 1, 1)).toBe(steps);
    expect(moveActionChainStep(steps, -1, 1)).toBe(steps);
    expect(moveActionChainStep(steps, 0, 5)).toBe(steps);
  });

  it('should sync step parameters with a command definition while preserving existing values', function () {
    const existing = [
      {id: 'p1', name: 'bundleId', value: 'com.example.app', required: true},
      {id: 'p2', name: 'toString', value: 'safe-value', required: false},
    ];
    const synced = syncStepParamsWithDefinition(existing, [
      {name: 'bundleId', required: true},
      {name: 'timeout', required: false},
      {name: 'constructor', required: false},
    ]);

    expect(synced).toHaveLength(3);
    expect(synced[0]).toMatchObject({id: 'p1', name: 'bundleId', value: 'com.example.app', required: true});
    expect(synced[1]).toMatchObject({name: 'timeout', value: '', required: false});
    expect(synced[2]).toMatchObject({name: 'constructor', value: '', required: false});
  });

  it('should prepare command and executeMethod calls while omitting empty optional parameters', function () {
    const execCall = prepareActionChainStepCall({
      type: ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD,
      name: 'mobile: terminateApp',
      params: [
        {name: 'bundleId', value: 'com.example.app', required: true},
        {name: 'timeout', value: '', required: false},
        {name: '   ', value: 'ignored', required: false},
      ],
    });
    expect(execCall).toEqual({
      methodName: 'executeScript',
      args: ['mobile: terminateApp', [{bundleId: 'com.example.app'}]],
    });

    const cmdCall = prepareActionChainStepCall({
      type: ACTION_CHAIN_STEP_TYPES.COMMAND,
      name: 'activateApp',
      params: [{name: 'appId', value: 'com.apple.AppStore', required: true}],
    });
    expect(cmdCall).toEqual({
      methodName: 'activateApp',
      args: ['com.apple.AppStore'],
    });
  });

  it('should format concise step summaries for every step type', function () {
    expect(
      formatActionChainStepSummary({
        type: 'executeMethod',
        name: 'mobile: terminateApp',
        params: [{name: 'bundleId', value: 'com.example.app'}],
      }),
    ).toBe('mobile: terminateApp(bundleId=com.example.app)');
    expect(formatActionChainStepSummary({type: 'wait', duration: 1000})).toBe('wait 1000 ms');
    expect(
      formatActionChainStepSummary({
        type: 'check',
        checkType: 'elementExists',
        strategy: 'accessibility id',
        selector: 'Install',
      }),
    ).toBe('elementExists [accessibility id: Install]');
    expect(
      formatActionChainStepSummary({
        type: 'check',
        checkType: 'sourceContains',
        value: 'Version 2',
      }),
    ).toBe('sourceContains "Version 2"');
  });
});

describe('utils/action-chain-file-parsing.js', function () {
  const sampleChain = {
    name: 'App reinstall',
    description: 'Terminate, remove, wait, and open store',
    steps: [
      {
        type: 'executeMethod',
        name: 'mobile: terminateApp',
        params: [{name: 'bundleId', value: 'com.example.app', required: true}],
      },
      {
        type: 'executeMethod',
        name: 'mobile: removeApp',
        params: [{name: 'bundleId', value: 'com.example.app', required: true}],
      },
      {
        type: 'wait',
        duration: 1000,
      },
      {
        type: 'executeMethod',
        name: 'mobile: activateApp',
        params: [{name: 'bundleId', value: 'com.apple.AppStore', required: true}],
      },
      {
        type: 'check',
        checkType: 'elementExists',
        strategy: 'accessibility id',
        selector: 'Install',
        timeout: 3000,
        onFailure: 'stop',
      },
    ],
  };

  it('should parse and validate a complete action chain file', function () {
    const parsed = parseActionChainFileContents(JSON.stringify(sampleChain));
    expect(parsed).toEqual(sampleChain);
  });

  it('should return null for invalid JSON', function () {
    expect(parseActionChainFileContents('{not valid json')).toBeNull();
  });

  it.each([
    ['root is null', null],
    ['root is an array', []],
    ['name is missing', {description: 'd', steps: []}],
    ['name is blank', {name: '   ', description: 'd', steps: []}],
    ['description is not a string', {name: 'c', description: 42, steps: []}],
    ['steps is missing', {name: 'c', description: 'd'}],
    ['steps is not an array', {name: 'c', description: 'd', steps: {}}],
    ['step is not an object', {name: 'c', steps: ['bad']}],
    ['step has unknown type', {name: 'c', steps: [{type: 'bogus'}]}],
    ['command step misses name', {name: 'c', steps: [{type: 'command'}]}],
    ['executeMethod step has non-array params', {name: 'c', steps: [{type: 'executeMethod', name: 'm', params: {}}]}],
    [
      'command param has empty name',
      {name: 'c', steps: [{type: 'command', name: 'activateApp', params: [{name: ' ', value: 'x'}]}]},
    ],
    [
      'command param has invalid value type',
      {name: 'c', steps: [{type: 'command', name: 'activateApp', params: [{name: 'appId', value: {nested: 1}}]}]},
    ],
    ['wait step has negative duration', {name: 'c', steps: [{type: 'wait', duration: -10}]}],
    ['wait step has non-number duration', {name: 'c', steps: [{type: 'wait', duration: '1000'}]}],
    ['check step has unknown checkType', {name: 'c', steps: [{type: 'check', checkType: 'unknown'}]}],
    [
      'elementExists check misses selector',
      {name: 'c', steps: [{type: 'check', checkType: 'elementExists', strategy: 'id'}]},
    ],
    [
      'sourceContains check misses value',
      {name: 'c', steps: [{type: 'check', checkType: 'sourceContains', value: '   '}]},
    ],
    [
      'check step has negative timeout',
      {name: 'c', steps: [{type: 'check', checkType: 'sourceContains', value: 'ok', timeout: -1}]},
    ],
    [
      'check step has invalid onFailure',
      {name: 'c', steps: [{type: 'check', checkType: 'sourceContains', value: 'ok', onFailure: 'retry'}]},
    ],
  ])('should reject invalid action chain when %s', function (_desc, payload) {
    expect(validateActionChainJSON(payload)).toBeNull();
  });

  it('should round-trip through normalizeActionChain and prepareActionChainForExport', function () {
    const normalized = normalizeActionChain({...sampleChain, id: 'chain-1', date: 1700000000000});
    expect(normalized.id).toBe('chain-1');
    expect(normalized.steps.every((s) => typeof s.id === 'string' && s.id.length > 0)).toBe(true);

    const exported = prepareActionChainForExport(normalized);
    expect(exported).not.toHaveProperty('id');
    expect(exported).not.toHaveProperty('date');
    expect(exported.steps[0]).not.toHaveProperty('id');
    expect(exported.steps[0].params[0]).not.toHaveProperty('id');
    expect(validateActionChainJSON(exported)).toEqual(exported);
  });
});

describe('utils/action-chain-runner.js', function () {
  it('should execute a reinstall flow with execute methods, wait, and checks in order', async function () {
    const calls = [];
    const sleepCalls = [];
    const executeCommand = vi.fn(async ({methodName, args}) => {
      calls.push([methodName, args]);
      if (methodName === 'findElements') {
        return {commandRes: [{elementId: 'el-1'}]};
      }
      return {commandRes: true};
    });
    const getPageSource = vi.fn(async () => '<App><Button name="Install" /></App>');
    const sleep = vi.fn(async (ms) => {
      sleepCalls.push(ms);
    });

    const chain = {
      name: 'App reinstall',
      steps: [
        {
          id: 's1',
          type: ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD,
          name: 'mobile: terminateApp',
          params: [{name: 'bundleId', value: 'com.example.app', required: true}],
        },
        {
          id: 's2',
          type: ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD,
          name: 'mobile: removeApp',
          params: [{name: 'bundleId', value: 'com.example.app', required: true}],
        },
        {
          id: 's3',
          type: ACTION_CHAIN_STEP_TYPES.WAIT,
          duration: 1000,
        },
        {
          id: 's4',
          type: ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD,
          name: 'mobile: activateApp',
          params: [{name: 'bundleId', value: 'com.apple.AppStore', required: true}],
        },
        {
          id: 's5',
          type: ACTION_CHAIN_STEP_TYPES.CHECK,
          checkType: ACTION_CHAIN_CHECK_TYPES.ELEMENT_EXISTS,
          strategy: 'accessibility id',
          selector: 'Install',
          timeout: 0,
          onFailure: ACTION_CHAIN_FAILURE_ACTIONS.STOP,
        },
        {
          id: 's6',
          type: ACTION_CHAIN_STEP_TYPES.CHECK,
          checkType: ACTION_CHAIN_CHECK_TYPES.SOURCE_CONTAINS,
          value: 'Install',
          timeout: 0,
          onFailure: ACTION_CHAIN_FAILURE_ACTIONS.STOP,
        },
      ],
    };

    const outcome = await executeActionChain(chain, {executeCommand, getPageSource, sleep});

    expect(outcome.status).toBe(ACTION_CHAIN_RUN_STATUS.PASSED);
    expect(outcome.hasDriverCommands).toBe(true);
    expect(outcome.failedStepIndex).toBeNull();
    expect(outcome.stepResults.map((r) => r.status)).toEqual([
      ACTION_CHAIN_STEP_STATUS.PASSED,
      ACTION_CHAIN_STEP_STATUS.PASSED,
      ACTION_CHAIN_STEP_STATUS.PASSED,
      ACTION_CHAIN_STEP_STATUS.PASSED,
      ACTION_CHAIN_STEP_STATUS.PASSED,
      ACTION_CHAIN_STEP_STATUS.PASSED,
    ]);
    expect(calls).toEqual([
      ['executeScript', ['mobile: terminateApp', [{bundleId: 'com.example.app'}]]],
      ['executeScript', ['mobile: removeApp', [{bundleId: 'com.example.app'}]]],
      ['executeScript', ['mobile: activateApp', [{bundleId: 'com.apple.AppStore'}]]],
      ['findElements', ['accessibility id', 'Install']],
    ]);
    expect(sleepCalls).toEqual([1000]);
  });

  it('should poll a check step until timeout expires or condition passes', async function () {
    let clock = 1000;
    let attempts = 0;
    const executeCommand = vi.fn(async () => {
      attempts += 1;
      return {commandRes: attempts >= 3 ? [{elementId: 'ready'}] : []};
    });
    const sleep = vi.fn(async (ms) => {
      clock += ms;
    });

    const outcome = await executeActionChain(
      {
        name: 'Wait for ready element',
        steps: [
          {
            id: 'c1',
            type: ACTION_CHAIN_STEP_TYPES.CHECK,
            checkType: ACTION_CHAIN_CHECK_TYPES.ELEMENT_EXISTS,
            strategy: 'id',
            selector: 'ready-btn',
            timeout: 600,
            onFailure: ACTION_CHAIN_FAILURE_ACTIONS.STOP,
          },
        ],
      },
      {
        executeCommand,
        getPageSource: vi.fn(),
        sleep,
        pollIntervalMs: 250,
        now: () => clock,
      },
    );

    expect(outcome.status).toBe(ACTION_CHAIN_RUN_STATUS.PASSED);
    expect(attempts).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('should stop and mark remaining steps skipped when a check fails with onFailure=stop', async function () {
    const executeCommand = vi.fn(async () => ({commandRes: []}));
    const outcome = await executeActionChain(
      {
        name: 'Stop on check failure',
        steps: [
          {
            id: 'c1',
            type: ACTION_CHAIN_STEP_TYPES.CHECK,
            checkType: ACTION_CHAIN_CHECK_TYPES.ELEMENT_EXISTS,
            strategy: 'id',
            selector: 'missing',
            timeout: 0,
            onFailure: ACTION_CHAIN_FAILURE_ACTIONS.STOP,
          },
          {
            id: 's2',
            type: ACTION_CHAIN_STEP_TYPES.COMMAND,
            name: 'activateApp',
            params: [{name: 'appId', value: 'com.example.app', required: true}],
          },
        ],
      },
      {executeCommand, getPageSource: vi.fn()},
    );

    expect(outcome.status).toBe(ACTION_CHAIN_RUN_STATUS.FAILED);
    expect(outcome.failedStepIndex).toBe(0);
    expect(outcome.stepResults[0].status).toBe(ACTION_CHAIN_STEP_STATUS.FAILED);
    expect(outcome.stepResults[1].status).toBe(ACTION_CHAIN_STEP_STATUS.SKIPPED);
    expect(executeCommand).toHaveBeenCalledTimes(1);
  });

  it('should continue remaining steps when a check fails with onFailure=continue', async function () {
    const executeCommand = vi.fn(async () => ({commandRes: 'ok'}));
    const getPageSource = vi.fn(async () => '<App>Hello</App>');

    const outcome = await executeActionChain(
      {
        name: 'Continue on check failure',
        steps: [
          {
            id: 'c1',
            type: ACTION_CHAIN_STEP_TYPES.CHECK,
            checkType: ACTION_CHAIN_CHECK_TYPES.SOURCE_NOT_CONTAINS,
            value: 'Hello',
            timeout: 0,
            onFailure: ACTION_CHAIN_FAILURE_ACTIONS.CONTINUE,
          },
          {
            id: 's2',
            type: ACTION_CHAIN_STEP_TYPES.COMMAND,
            name: 'hideKeyboard',
            params: [],
          },
        ],
      },
      {executeCommand, getPageSource},
    );

    expect(outcome.status).toBe(ACTION_CHAIN_RUN_STATUS.FAILED);
    expect(outcome.failedStepIndex).toBe(0);
    expect(outcome.stepResults[0].status).toBe(ACTION_CHAIN_STEP_STATUS.FAILED);
    expect(outcome.stepResults[1].status).toBe(ACTION_CHAIN_STEP_STATUS.PASSED);
    expect(executeCommand).toHaveBeenCalledWith({methodName: 'hideKeyboard', args: []});
  });

  it('should abort promptly during a wait step when the AbortSignal fires', async function () {
    const controller = new AbortController();
    const executeCommand = vi.fn();

    const runPromise = executeActionChain(
      {
        name: 'Abortable chain',
        steps: [
          {id: 'w1', type: ACTION_CHAIN_STEP_TYPES.WAIT, duration: 5000},
          {id: 's2', type: ACTION_CHAIN_STEP_TYPES.COMMAND, name: 'hideKeyboard', params: []},
        ],
      },
      {
        executeCommand,
        getPageSource: vi.fn(),
        signal: controller.signal,
        sleep: sleepWithSignal,
      },
    );

    controller.abort();
    const outcome = await runPromise;

    expect(outcome.status).toBe(ACTION_CHAIN_RUN_STATUS.CANCELLED);
    expect(outcome.stepResults[0].status).toBe(ACTION_CHAIN_STEP_STATUS.SKIPPED);
    expect(outcome.stepResults[1].status).toBe(ACTION_CHAIN_STEP_STATUS.SKIPPED);
    expect(executeCommand).not.toHaveBeenCalled();
  });
});
