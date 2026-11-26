import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';

const {savedSettings, downloadFileMock, readTextFromUploadedFilesMock, notificationMock, inspectorDriverRunMock} =
  vi.hoisted(() => ({
    savedSettings: new Map(),
    downloadFileMock: vi.fn(),
    readTextFromUploadedFilesMock: vi.fn(),
    notificationMock: {error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn()},
    inspectorDriverRunMock: vi.fn(),
  }));

vi.mock('../../app/common/renderer/utils/logger.js', () => ({
  log: {debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn()},
}));
vi.mock('../../app/common/renderer/utils/notification.js', () => ({
  notification: notificationMock,
}));
vi.mock('i18next', () => ({
  default: {
    isInitialized: true,
    use: vi.fn().mockReturnThis(),
    init: vi.fn(),
    t: (key) => key,
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key) => key}),
}));
vi.mock('../../app/common/renderer/polyfills.js', () => ({
  getSetting: vi.fn((key) => Promise.resolve(savedSettings.has(key) ? savedSettings.get(key) : null)),
  setSetting: vi.fn((key, value) => {
    savedSettings.set(key, value);
    return Promise.resolve();
  }),
  openLink: vi.fn(),
  setTheme: vi.fn(),
  updateLanguage: vi.fn(),
  localesPath: '',
  loadSessionFileIfOpened: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../app/common/renderer/utils/file-handling.js', () => ({
  downloadFile: downloadFileMock,
  readTextFromUploadedFiles: readTextFromUploadedFilesMock,
}));
vi.mock('../../app/common/renderer/lib/appium/inspector-driver.js', () => ({
  default: {
    instance: vi.fn(() => ({run: inspectorDriverRunMock})),
    clearInstance: vi.fn(),
  },
}));

function createInspectorStoreHarness(inspectorReducer, overrides = {}) {
  let state = {...inspectorReducer(undefined, {type: '@@INIT'}), ...overrides};
  const dispatch = (action) => {
    state = inspectorReducer(state, action);
  };
  const getState = () => ({inspector: state, builder: {}});
  return {
    dispatch,
    getState,
    getInspector: () => state,
    run: (thunk) => thunk(dispatch, getState),
  };
}

describe('SessionInspector action chains', function () {
  let actions;
  let inspectorReducer;
  let SavedActionChains;
  let ActionChainEditor;
  let ActionChainResultModal;

  beforeAll(async () => {
    actions = await import('../../app/common/renderer/actions/SessionInspector.js');
    inspectorReducer = (await import('../../app/common/renderer/reducers/SessionInspector.js')).default;
    SavedActionChains = (
      await import('../../app/common/renderer/components/SessionInspector/ActionChainsTab/SavedActionChains.jsx')
    ).default;
    ActionChainEditor = (
      await import('../../app/common/renderer/components/SessionInspector/ActionChainsTab/ActionChainEditor/ActionChainEditor.jsx')
    ).default;
    ActionChainResultModal = (
      await import('../../app/common/renderer/components/SessionInspector/ActionChainsTab/ActionChainResultModal.jsx')
    ).default;
  }, 60_000);

  beforeEach(() => {
    savedSettings.clear();
    downloadFileMock.mockReset();
    readTextFromUploadedFilesMock.mockReset();
    inspectorDriverRunMock.mockReset();
    notificationMock.error.mockReset();
    notificationMock.info.mockReset();
    notificationMock.success.mockReset();
    notificationMock.warning.mockReset();
  });

  it('persists, updates, and deletes saved action chains', async function () {
    const store = createInspectorStoreHarness(inspectorReducer);

    const created = await store.run(
      actions.saveActionChain({
        name: 'App Reinstall',
        description: 'Reinstall flow',
        steps: [
          {
            type: 'executeMethod',
            name: 'mobile: terminateApp',
            params: [{name: 'bundleId', value: 'com.example.app', required: true}],
          },
          {type: 'wait', duration: 500},
        ],
      }),
    );

    expect(store.getInspector().savedActionChains).toHaveLength(1);
    expect(store.getInspector().savedActionChains[0].name).toBe('App Reinstall');
    expect(store.getInspector().savedActionChains[0].id).toBe(created.id);

    await store.run(
      actions.saveActionChain({
        id: created.id,
        date: created.date,
        name: 'App Reinstall v2',
        description: 'Updated flow',
        steps: [{type: 'wait', duration: 250}],
      }),
    );

    expect(store.getInspector().savedActionChains).toHaveLength(1);
    expect(store.getInspector().savedActionChains[0].name).toBe('App Reinstall v2');
    expect(store.getInspector().savedActionChains[0].steps).toHaveLength(1);

    await store.run(actions.deleteSavedActionChain(created.id));
    expect(store.getInspector().savedActionChains).toEqual([]);
  });

  it('exports and imports action chain files and reports invalid files', async function () {
    const store = createInspectorStoreHarness(inspectorReducer);

    await store.run(
      actions.exportSavedActionChain({
        id: 'chain-1',
        date: 1700000000000,
        name: 'Reinstall App',
        description: 'Switch to store',
        steps: [
          {
            id: 's1',
            type: 'executeMethod',
            name: 'mobile: terminateApp',
            params: [{id: 'p1', name: 'bundleId', value: 'com.example.app', required: true}],
          },
        ],
      }),
    );

    expect(downloadFileMock).toHaveBeenCalledTimes(1);
    const [href, fileName] = downloadFileMock.mock.calls[0];
    expect(fileName).toBe('action-chain-Reinstall App.json');
    const exportedJson = decodeURIComponent(href.replace(/^data:text\/json;charset=utf-8,/, ''));

    readTextFromUploadedFilesMock.mockResolvedValue([
      {fileName, content: exportedJson},
      {fileName: 'broken.json', content: '{"name": "Broken", "steps": [{"type": "invalid"}]}'},
    ]);

    await store.run(actions.importActionChainFiles([{}, {}]));

    expect(store.getInspector().savedActionChains).toHaveLength(1);
    expect(store.getInspector().savedActionChains[0].name).toBe('Reinstall App');
    expect(store.getInspector().isUploadingActionChainFiles).toBe(false);
    expect(notificationMock.error).toHaveBeenCalledTimes(1);
  });

  it('runs an action chain sequentially and refreshes source once at the end', async function () {
    const driver = {
      getPageSource: vi.fn().mockResolvedValue('<App><Text>Store Ready</Text></App>'),
    };
    const store = createInspectorStoreHarness(inspectorReducer, {
      driver,
      isSourceRefreshOn: true,
    });
    const originalWindow = globalThis.window;
    globalThis.window = {dispatchEvent: vi.fn()};

    try {
      inspectorDriverRunMock.mockImplementation(async (params) => {
        if (params.methodName === 'getPageSource') {
          return {
            source: '<App><Text>Store Ready</Text></App>',
            screenshot: 'base64-shot',
            windowSize: {width: 400, height: 800},
          };
        }
        return {commandRes: true};
      });

      const runResult = await store.run(
        actions.runActionChain({
          id: 'reinstall-1',
          name: 'App Reinstall',
          steps: [
            {
              id: 's1',
              type: 'executeMethod',
              name: 'mobile: terminateApp',
              params: [{id: 'p1', name: 'bundleId', value: 'com.example.app', required: true}],
            },
            {id: 's2', type: 'wait', duration: 0},
            {
              id: 's3',
              type: 'check',
              checkType: 'sourceContains',
              value: 'Store Ready',
              timeout: 0,
              onFailure: 'stop',
            },
          ],
        }),
      );

      expect(runResult.status).toBe('passed');
      expect(store.getInspector().runningActionChain).toBeNull();
      expect(store.getInspector().actionChainRunResult.status).toBe('passed');
      expect(inspectorDriverRunMock).toHaveBeenCalledTimes(2);
      expect(inspectorDriverRunMock.mock.calls[0][0]).toMatchObject({
        methodName: 'executeScript',
        args: ['mobile: terminateApp', [{bundleId: 'com.example.app'}]],
        skipRefresh: true,
      });
      expect(inspectorDriverRunMock.mock.calls[1][0]).toMatchObject({
        methodName: 'getPageSource',
      });
      expect(notificationMock.success).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('warns and skips execution when running an empty action chain', async function () {
    const store = createInspectorStoreHarness(inspectorReducer);
    const result = await store.run(actions.runActionChain({name: 'Empty', steps: []}));

    expect(result).toBeNull();
    expect(notificationMock.warning).toHaveBeenCalledTimes(1);
  });

  it('renders SavedActionChains, ActionChainEditor, and ActionChainResultModal markup cleanly', function () {
    const savedHtml = renderToStaticMarkup(
      createElement(SavedActionChains, {
        savedActionChains: [
          {
            id: 'c1',
            name: 'App Reinstall',
            description: 'Reset A/B state',
            date: 1700000000000,
            steps: [{id: 's1', type: 'wait', duration: 1000}],
          },
        ],
        showActionChainEditor: vi.fn(),
        getSavedActionChains: vi.fn(),
        importActionChainFiles: vi.fn(),
        isUploadingActionChainFiles: false,
        runningActionChain: null,
        actionChainRunResult: null,
        runActionChain: vi.fn(),
        stopActionChain: vi.fn(),
        setLoadedActionChain: vi.fn(),
        exportSavedActionChain: vi.fn(),
        deleteSavedActionChain: vi.fn(),
      }),
    );

    expect(savedHtml).toContain('App Reinstall');
    expect(savedHtml).toContain('Create New Action Chain');

    const editorHtml = renderToStaticMarkup(
      createElement(ActionChainEditor, {
        loadedActionChain: {
          id: 'c1',
          name: 'App Reinstall',
          description: 'Reset A/B state',
          date: 1700000000000,
          steps: [
            {
              id: 's1',
              type: 'executeMethod',
              name: 'mobile: terminateApp',
              params: [{id: 'p1', name: 'bundleId', value: 'com.example.app', required: true}],
            },
            {id: 's2', type: 'wait', duration: 1000},
          ],
        },
        getSupportedSessionMethods: vi.fn().mockResolvedValue({commands: {}, executeMethods: {}}),
        saveActionChain: vi.fn(),
        hideActionChainEditor: vi.fn(),
        removeLoadedActionChain: vi.fn(),
        runActionChain: vi.fn(),
        stopActionChain: vi.fn(),
        runningActionChain: null,
        actionChainRunResult: null,
      }),
    );

    expect(editorHtml).toContain('Action Chain Builder');
    expect(editorHtml).toContain('Add Execute Method');
    expect(editorHtml).toContain('Add Wait');
    expect(editorHtml).toContain('Add Check');

    const resultHtml = renderToStaticMarkup(
      createElement(ActionChainResultModal, {
        open: false,
        onClose: vi.fn(),
        runResult: {
          chainName: 'App Reinstall',
          status: 'passed',
          stepResults: [
            {
              stepIndex: 0,
              stepId: 's1',
              label: 'wait 1000 ms',
              status: 'passed',
              durationMs: 1000,
              error: null,
            },
          ],
        },
      }),
    );
    expect(resultHtml).toBe('');

    const savedWithResultHtml = renderToStaticMarkup(
      createElement(SavedActionChains, {
        savedActionChains: [],
        showActionChainEditor: vi.fn(),
        getSavedActionChains: vi.fn(),
        importActionChainFiles: vi.fn(),
        isUploadingActionChainFiles: false,
        runningActionChain: null,
        actionChainRunResult: {
          chainName: 'App Reinstall',
          status: 'passed',
          stepResults: [],
        },
        runActionChain: vi.fn(),
        stopActionChain: vi.fn(),
        setLoadedActionChain: vi.fn(),
        exportSavedActionChain: vi.fn(),
        deleteSavedActionChain: vi.fn(),
      }),
    );
    expect(savedWithResultHtml).toContain('View Last Result');
  });
});
