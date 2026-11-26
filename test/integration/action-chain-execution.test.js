import path from 'node:path';

import {startServer as startAppiumFakeDriverServer} from '@appium/fake-driver';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {
  ACTION_CHAIN_CHECK_TYPES,
  ACTION_CHAIN_FAILURE_ACTIONS,
  ACTION_CHAIN_RUN_STATUS,
  ACTION_CHAIN_STEP_STATUS,
  ACTION_CHAIN_STEP_TYPES,
} from '../../app/common/renderer/constants/action-chains.js';
import InspectorDriver from '../../app/common/renderer/lib/appium/inspector-driver.js';
import WDSessionStarter from '../../app/common/renderer/lib/appium/session-starter.js';
import {executeActionChain} from '../../app/common/renderer/utils/action-chain-runner.js';

const FAKE_DRIVER_PORT = 12122;

const DEFAULT_CAPS = {
  platformName: 'Fake',
  'appium:deviceName': 'Fake',
  'appium:app': path.resolve(__dirname, '..', 'fixtures', 'fake-app.xml'),
};

describe('Action chain execution against FakeDriver', function () {
  let driver;
  let server;
  let inspectorDriver;

  beforeAll(async function () {
    server = await startAppiumFakeDriverServer(FAKE_DRIVER_PORT, '127.0.0.1');
    driver = await WDSessionStarter.newSession(
      {
        hostname: '127.0.0.1',
        port: FAKE_DRIVER_PORT,
        path: '/',
        connectionRetryCount: 0,
      },
      DEFAULT_CAPS,
    );
    InspectorDriver.clearInstance();
    inspectorDriver = InspectorDriver.instance(driver);
  });

  afterAll(async function () {
    InspectorDriver.clearInstance();
    try {
      await driver.deleteSession();
    } catch {}
    await server.close();
  });

  it('should execute chained commands, wait, and element/source checks against a live driver session', async function () {
    const chain = {
      name: 'Settings & UI Verification',
      steps: [
        {
          id: 'step-1',
          type: ACTION_CHAIN_STEP_TYPES.COMMAND,
          name: 'updateSettings',
          params: [{name: 'settings', value: '{"chainTestFlag":true,"chainCount":42}', required: true}],
        },
        {
          id: 'step-2',
          type: ACTION_CHAIN_STEP_TYPES.WAIT,
          duration: 10,
        },
        {
          id: 'step-3',
          type: ACTION_CHAIN_STEP_TYPES.COMMAND,
          name: 'getSettings',
          params: [],
        },
        {
          id: 'step-4',
          type: ACTION_CHAIN_STEP_TYPES.CHECK,
          checkType: ACTION_CHAIN_CHECK_TYPES.ELEMENT_EXISTS,
          strategy: 'xpath',
          selector: '//MockListItem',
          timeout: 0,
          onFailure: ACTION_CHAIN_FAILURE_ACTIONS.STOP,
        },
        {
          id: 'step-5',
          type: ACTION_CHAIN_STEP_TYPES.CHECK,
          checkType: ACTION_CHAIN_CHECK_TYPES.ELEMENT_NOT_EXISTS,
          strategy: 'xpath',
          selector: '//DoesNotExistNode',
          timeout: 0,
          onFailure: ACTION_CHAIN_FAILURE_ACTIONS.STOP,
        },
        {
          id: 'step-6',
          type: ACTION_CHAIN_STEP_TYPES.CHECK,
          checkType: ACTION_CHAIN_CHECK_TYPES.SOURCE_CONTAINS,
          value: 'MockListItem',
          timeout: 0,
          onFailure: ACTION_CHAIN_FAILURE_ACTIONS.STOP,
        },
        {
          id: 'step-7',
          type: ACTION_CHAIN_STEP_TYPES.CHECK,
          checkType: ACTION_CHAIN_CHECK_TYPES.SOURCE_NOT_CONTAINS,
          value: 'NonExistentMarkerText',
          timeout: 0,
          onFailure: ACTION_CHAIN_FAILURE_ACTIONS.STOP,
        },
      ],
    };

    const outcome = await executeActionChain(chain, {
      executeCommand: ({methodName, args}) =>
        inspectorDriver.run({
          methodName,
          args,
          skipRefresh: true,
        }),
      getPageSource: () => driver.getPageSource(),
    });

    expect(outcome.status).toBe(ACTION_CHAIN_RUN_STATUS.PASSED);
    expect(outcome.hasDriverCommands).toBe(true);
    expect(outcome.stepResults.map((r) => r.status)).toEqual(
      Array(chain.steps.length).fill(ACTION_CHAIN_STEP_STATUS.PASSED),
    );
    expect(outcome.stepResults[2].result).toMatchObject({
      chainTestFlag: true,
      chainCount: 42,
    });
  });
});
