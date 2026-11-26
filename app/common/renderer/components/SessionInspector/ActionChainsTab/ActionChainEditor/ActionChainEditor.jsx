import {Divider} from 'antd';
import {useEffect, useMemo, useState} from 'react';

import {ACTION_CHAIN_STEP_TYPES} from '../../../../constants/action-chains.js';
import {createActionChainStep} from '../../../../utils/action-chain-editing.js';
import {normalizeActionChain} from '../../../../utils/action-chain-file-parsing.js';
import {getStaticCommandsList, transformCommandsMap, transformExecMethodsMap} from '../../../../utils/commands-tab.js';
import {isEmpty} from '../../../../utils/common.js';
import ActionChainResultModal from '../ActionChainResultModal.jsx';
import ActionChainEditorCard from './ActionChainEditorCard.jsx';
import ActionChainEditorHeader from './ActionChainEditorHeader.jsx';
import ActionChainStepList from './ActionChainStepList.jsx';

import styles from '../ActionChains.module.css';

/**
 * Contents of the action chain editor.
 */
const ActionChainEditor = (props) => {
  const {loadedActionChain, getSupportedSessionMethods, runningActionChain, actionChainRunResult} = props;

  const [steps, setSteps] = useState(() =>
    loadedActionChain
      ? normalizeActionChain(loadedActionChain).steps
      : [createActionChainStep(ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD)],
  );
  const [availableCommands, setAvailableCommands] = useState(() => getStaticCommandsList());
  const [availableExecuteMethods, setAvailableExecuteMethods] = useState([]);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!getSupportedSessionMethods) {
        return;
      }
      const {commands, executeMethods} = await getSupportedSessionMethods();
      if (!active) {
        return;
      }
      const dynamicCommands = transformCommandsMap(commands);
      const dynamicExecMethods = transformExecMethodsMap(executeMethods);
      if (!isEmpty(dynamicCommands)) {
        setAvailableCommands(dynamicCommands);
      }
      setAvailableExecuteMethods(dynamicExecMethods);
    })();
    return () => {
      active = false;
    };
  }, [getSupportedSessionMethods]);

  const stepResultsById = useMemo(() => {
    const map = new Map();
    if (runningActionChain?.stepResults) {
      for (const [stepId, res] of Object.entries(runningActionChain.stepResults)) {
        map.set(stepId, res);
      }
    } else if (actionChainRunResult?.stepResults) {
      for (const res of actionChainRunResult.stepResults) {
        map.set(res.stepId, res);
      }
    }
    return map;
  }, [actionChainRunResult, runningActionChain]);

  return (
    <ActionChainEditorCard>
      <ActionChainEditorHeader {...props} steps={steps} onOpenLastResult={() => setIsResultModalOpen(true)} />
      <Divider className={styles.actionChainEditorDivider} />
      <ActionChainStepList
        steps={steps}
        setSteps={setSteps}
        availableCommands={availableCommands}
        availableExecuteMethods={availableExecuteMethods}
        stepResultsById={stepResultsById}
        disabled={Boolean(runningActionChain)}
      />
      <ActionChainResultModal
        open={isResultModalOpen && Boolean(actionChainRunResult)}
        runResult={actionChainRunResult}
        onClose={() => setIsResultModalOpen(false)}
      />
    </ActionChainEditorCard>
  );
};

export default ActionChainEditor;
