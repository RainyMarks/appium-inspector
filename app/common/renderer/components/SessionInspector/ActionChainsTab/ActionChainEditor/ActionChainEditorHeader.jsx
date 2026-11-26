import {IconArrowLeft, IconListCheck, IconPlayerPlay, IconPlayerStop} from '@tabler/icons-react';
import {Button, Input, Space, Tooltip} from 'antd';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';

import {ACTION_CHAIN_CHECK_TYPES, ACTION_CHAIN_STEP_TYPES} from '../../../../constants/action-chains.js';
import {NOTIF} from '../../../../constants/antd-types.js';
import {notification} from '../../../../utils/notification.js';

import styles from '../ActionChains.module.css';

const ELEMENT_CHECK_TYPES = new Set([
  ACTION_CHAIN_CHECK_TYPES.ELEMENT_EXISTS,
  ACTION_CHAIN_CHECK_TYPES.ELEMENT_NOT_EXISTS,
]);

const displayNotificationMsg = (type, msg) => {
  notification[type]({
    title: msg,
    duration: 5,
  });
};

const findFirstIncompleteStepIndex = (steps) => {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type === ACTION_CHAIN_STEP_TYPES.COMMAND || step.type === ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD) {
      if (!step.name || !step.name.trim()) {
        return i;
      }
    } else if (step.type === ACTION_CHAIN_STEP_TYPES.WAIT) {
      if (typeof step.duration !== 'number' || !Number.isFinite(step.duration) || step.duration < 0) {
        return i;
      }
    } else if (step.type === ACTION_CHAIN_STEP_TYPES.CHECK) {
      if (ELEMENT_CHECK_TYPES.has(step.checkType)) {
        if (!step.strategy?.trim() || !step.selector?.trim()) {
          return i;
        }
      } else if (!step.value || !step.value.trim()) {
        return i;
      }
    }
  }
  return -1;
};

/**
 * Header controls shown in the action chain editor.
 */
const ActionChainEditorHeader = (props) => {
  const {
    steps,
    loadedActionChain,
    saveActionChain,
    hideActionChainEditor,
    removeLoadedActionChain,
    runActionChain,
    stopActionChain,
    runningActionChain,
    actionChainRunResult,
    onOpenLastResult,
  } = props;
  const {t} = useTranslation();

  const defaultName = t('Untitled Action Chain');
  const defaultDescription = t('Add Description');

  const [name, setName] = useState(loadedActionChain?.name ?? defaultName);
  const [description, setDescription] = useState(loadedActionChain?.description ?? defaultDescription);

  const isRunning = Boolean(runningActionChain);

  const validateChainForAction = ({requireSteps = false} = {}) => {
    if (!name || !name.trim()) {
      displayNotificationMsg(NOTIF.ERROR, t('actionChainNameRequired'));
      return false;
    }
    if (requireSteps && steps.length === 0) {
      displayNotificationMsg(NOTIF.WARNING, t('actionChainEmptyWarning'));
      return false;
    }
    const incompleteIndex = findFirstIncompleteStepIndex(steps);
    if (incompleteIndex >= 0) {
      displayNotificationMsg(NOTIF.ERROR, t('actionChainStepIncomplete', {stepNumber: incompleteIndex + 1}));
      return false;
    }
    return true;
  };

  const handleCloseEditor = () => {
    removeLoadedActionChain();
    hideActionChainEditor();
  };

  const handleSave = () => {
    if (!validateChainForAction()) {
      return;
    }
    const {id, date} = loadedActionChain;
    saveActionChain({
      id,
      date,
      name: name.trim(),
      description,
      steps,
    });
    displayNotificationMsg(NOTIF.SUCCESS, t('Action chain saved'));
  };

  const handleSaveAs = () => {
    if (!validateChainForAction()) {
      return;
    }
    saveActionChain({
      name: name.trim(),
      description,
      steps,
    });
    displayNotificationMsg(NOTIF.SUCCESS, t('Action chain saved as', {chainName: name.trim()}));
    handleCloseEditor();
  };

  const handlePlay = () => {
    if (!validateChainForAction({requireSteps: true})) {
      return;
    }
    runActionChain({
      id: loadedActionChain?.id ?? null,
      name: name.trim(),
      description,
      steps,
    });
  };

  const playLabel = t('Play');
  const stopLabel = t('Stop');

  return (
    <div style={{display: 'flex', gap: '8px', alignItems: 'flex-start'}}>
      <Button
        aria-label={t('Back')}
        type="text"
        disabled={isRunning}
        icon={<IconArrowLeft size={18} />}
        onClick={handleCloseEditor}
      />
      <Space.Compact style={{flex: 1}} orientation="vertical">
        <Tooltip title={t('Edit')}>
          <Input
            value={name}
            className={styles.actionChainHeaderTitle}
            onChange={(e) => setName(e.target.value)}
            size="small"
          />
        </Tooltip>
        <Tooltip title={t('Edit')}>
          <Input
            value={description}
            className={styles.actionChainHeaderDescriptionInput}
            onChange={(e) => setDescription(e.target.value)}
            size="small"
          />
        </Tooltip>
      </Space.Compact>
      <Space wrap style={{justifyContent: 'flex-end'}}>
        {actionChainRunResult && (
          <Tooltip title={t('View Last Result')}>
            <Button aria-label={t('View Last Result')} icon={<IconListCheck size={18} />} onClick={onOpenLastResult} />
          </Tooltip>
        )}
        {isRunning ? (
          <Tooltip title={stopLabel}>
            <Button
              aria-label={stopLabel}
              danger
              type="primary"
              icon={<IconPlayerStop size={18} />}
              onClick={() => stopActionChain()}
            />
          </Tooltip>
        ) : (
          <Tooltip title={playLabel}>
            <Button aria-label={playLabel} type="primary" icon={<IconPlayerPlay size={18} />} onClick={handlePlay} />
          </Tooltip>
        )}
        <Space.Compact>
          <Button disabled={isRunning} onClick={handleSaveAs}>
            {t('saveAs')}
          </Button>
          <Button onClick={handleSave} disabled={isRunning || !loadedActionChain}>
            {t('Save')}
          </Button>
        </Space.Compact>
      </Space>
    </div>
  );
};

export default ActionChainEditorHeader;
