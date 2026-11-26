import {Feedback} from '@dnd-kit/dom';
import {SortableKeyboardPlugin} from '@dnd-kit/dom/sortable';
import {DragDropProvider} from '@dnd-kit/react';
import {useSortable} from '@dnd-kit/react/sortable';
import {IconCheckbox, IconClock, IconCode, IconTerminal} from '@tabler/icons-react';
import {Button, Flex, Space, Typography} from 'antd';
import {useTranslation} from 'react-i18next';

import {ACTION_CHAIN_STEP_TYPES} from '../../../../constants/action-chains.js';
import {
  createActionChainStep,
  duplicateActionChainStep,
  moveActionChainStep,
} from '../../../../utils/action-chain-editing.js';
import ActionChainStepCard from './ActionChainStepCard.jsx';

import styles from '../ActionChains.module.css';

/**
 * Sortable wrapper around a single ActionChainStepCard.
 */
const SortableActionChainStep = (props) => {
  const {step, index, totalSteps, disabled} = props;
  const dragDisabled = disabled || totalSteps < 2;
  const {ref, handleRef, isDropTarget} = useSortable({
    id: step.id,
    index,
    disabled: dragDisabled,
    plugins: [SortableKeyboardPlugin, Feedback.configure({dropAnimation: null})],
  });

  return (
    <div ref={ref}>
      <ActionChainStepCard
        {...props}
        dragHandleRef={handleRef}
        dragDisabled={dragDisabled}
        isDropTarget={isDropTarget}
      />
    </div>
  );
};

/**
 * Ordered list of steps in the action chain editor with drag-and-drop reordering and step creation controls.
 */
const ActionChainStepList = ({
  steps,
  setSteps,
  availableCommands,
  availableExecuteMethods,
  stepResultsById,
  disabled,
}) => {
  const {t} = useTranslation();

  const handleAddStep = (type) => {
    setSteps((prev) => [...prev, createActionChainStep(type)]);
  };

  const handleUpdateStep = (stepId, updatedStep) => {
    setSteps((prev) => prev.map((step) => (step.id === stepId ? updatedStep : step)));
  };

  const handleMoveStep = (fromIndex, toIndex) => {
    setSteps((prev) => moveActionChainStep(prev, fromIndex, toIndex));
  };

  const handleDuplicateStep = (stepId) => {
    setSteps((prev) => {
      const idx = prev.findIndex((step) => step.id === stepId);
      if (idx < 0) {
        return prev;
      }
      const next = [...prev];
      next.splice(idx + 1, 0, duplicateActionChainStep(prev[idx]));
      return next;
    });
  };

  const handleDeleteStep = (stepId) => {
    setSteps((prev) => prev.filter((step) => step.id !== stepId));
  };

  const handleDragEnd = (event) => {
    const {source, target, activatorEvent} = event.operation;
    if (!event.canceled && Number.isInteger(target?.index) && target.index !== source.index) {
      setSteps((prev) => moveActionChainStep(prev, source.index, target.index));
      if (activatorEvent instanceof KeyboardEvent) {
        const handle = target.sortable.draggable.handle;
        requestAnimationFrame(() => handle?.focus());
      }
    }
  };

  return (
    <>
      <div className={styles.actionChainStepsScroll}>
        {steps.length === 0 ? (
          <div className={styles.emptyStepsHint}>
            <Typography.Text type="secondary">{t('noStepsAdded')}</Typography.Text>
          </div>
        ) : (
          <DragDropProvider onDragEnd={handleDragEnd}>
            <Flex gap={8} orientation="vertical">
              {steps.map((step, index) => (
                <SortableActionChainStep
                  key={step.id}
                  step={step}
                  index={index}
                  totalSteps={steps.length}
                  availableCommands={availableCommands}
                  availableExecuteMethods={availableExecuteMethods}
                  stepRunResult={stepResultsById.get(step.id)}
                  disabled={disabled}
                  onUpdateStep={handleUpdateStep}
                  onMoveStep={handleMoveStep}
                  onDuplicateStep={handleDuplicateStep}
                  onDeleteStep={handleDeleteStep}
                />
              ))}
            </Flex>
          </DragDropProvider>
        )}
      </div>
      <Space wrap style={{marginTop: '10px'}}>
        <Button
          disabled={disabled}
          icon={<IconTerminal size={16} />}
          onClick={() => handleAddStep(ACTION_CHAIN_STEP_TYPES.COMMAND)}
        >
          {t('Add Command')}
        </Button>
        <Button
          disabled={disabled}
          icon={<IconCode size={16} />}
          onClick={() => handleAddStep(ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD)}
        >
          {t('Add Execute Method')}
        </Button>
        <Button
          disabled={disabled}
          icon={<IconClock size={16} />}
          onClick={() => handleAddStep(ACTION_CHAIN_STEP_TYPES.WAIT)}
        >
          {t('Add Wait')}
        </Button>
        <Button
          disabled={disabled}
          icon={<IconCheckbox size={16} />}
          onClick={() => handleAddStep(ACTION_CHAIN_STEP_TYPES.CHECK)}
        >
          {t('Add Check')}
        </Button>
      </Space>
    </>
  );
};

export default ActionChainStepList;
