import {IconArrowDown, IconArrowUp, IconCopy, IconGripVertical, IconPlus, IconX} from '@tabler/icons-react';
import {AutoComplete, Button, Card, Flex, Input, InputNumber, Select, Space, Tag, Tooltip, Typography} from 'antd';
import {useTranslation} from 'react-i18next';

import {
  ACTION_CHAIN_CHECK_TYPES,
  ACTION_CHAIN_FAILURE_ACTIONS,
  ACTION_CHAIN_STEP_STATUS,
  ACTION_CHAIN_STEP_TYPES,
} from '../../../../constants/action-chains.js';
import {
  NATIVE_COMMON_LOCATOR_STRATEGY_MAP,
  NATIVE_DRIVER_LOCATOR_STRATEGY_MAP,
  WEB_LOCATOR_STRATEGY_MAP,
} from '../../../../constants/session-inspector.js';
import {
  createActionChainParam,
  createActionChainStep,
  syncStepParamsWithDefinition,
} from '../../../../utils/action-chain-editing.js';

import inspectorStyles from '../../SessionInspector.module.css';
import styles from '../ActionChains.module.css';

const STATUS_TAG_COLORS = {
  [ACTION_CHAIN_STEP_STATUS.PASSED]: 'success',
  [ACTION_CHAIN_STEP_STATUS.FAILED]: 'error',
  [ACTION_CHAIN_STEP_STATUS.RUNNING]: 'processing',
  [ACTION_CHAIN_STEP_STATUS.SKIPPED]: 'default',
  [ACTION_CHAIN_STEP_STATUS.PENDING]: 'default',
};

const STATUS_LABEL_KEYS = {
  [ACTION_CHAIN_STEP_STATUS.PASSED]: 'Passed',
  [ACTION_CHAIN_STEP_STATUS.FAILED]: 'Failed',
  [ACTION_CHAIN_STEP_STATUS.RUNNING]: 'Running',
  [ACTION_CHAIN_STEP_STATUS.SKIPPED]: 'Skipped',
  [ACTION_CHAIN_STEP_STATUS.PENDING]: 'Pending',
};

const ELEMENT_CHECK_TYPES = new Set([
  ACTION_CHAIN_CHECK_TYPES.ELEMENT_EXISTS,
  ACTION_CHAIN_CHECK_TYPES.ELEMENT_NOT_EXISTS,
]);

const buildLocatorStrategyOptions = () => {
  const seen = new Set();
  const options = [];
  for (const map of [
    NATIVE_COMMON_LOCATOR_STRATEGY_MAP,
    WEB_LOCATOR_STRATEGY_MAP,
    NATIVE_DRIVER_LOCATOR_STRATEGY_MAP,
  ]) {
    for (const [value, label] of Object.values(map)) {
      if (!seen.has(value)) {
        seen.add(value);
        options.push({value, label: `${label} (${value})`});
      }
    }
  }
  return options;
};

const LOCATOR_STRATEGY_OPTIONS = buildLocatorStrategyOptions();

/**
 * Editable parameter list for a command or executeMethod step.
 */
const StepParametersEditor = ({params, onUpdateParams, disabled}) => {
  const {t} = useTranslation();

  const handleParamChange = (paramId, field, value) => {
    onUpdateParams(params.map((p) => (p.id === paramId ? {...p, [field]: value} : p)));
  };

  const handleAddParam = () => {
    onUpdateParams([...params, createActionChainParam()]);
  };

  const handleRemoveParam = (paramId) => {
    onUpdateParams(params.filter((p) => p.id !== paramId));
  };

  return (
    <Flex gap={6} orientation="vertical">
      {params.map((param) => (
        <div key={param.id} className={styles.paramRow}>
          <Input
            size="small"
            disabled={disabled}
            placeholder={t('Parameter Name')}
            className={inspectorStyles.monoFont}
            style={{flex: '0 0 38%'}}
            prefix={param.required ? <Typography.Text type="danger">*</Typography.Text> : null}
            value={param.name}
            onChange={(e) => handleParamChange(param.id, 'name', e.target.value)}
          />
          <Input
            size="small"
            disabled={disabled}
            placeholder={t('Parameter Value')}
            className={inspectorStyles.monoFont}
            style={{flex: 1}}
            value={param.value}
            onChange={(e) => handleParamChange(param.id, 'value', e.target.value)}
          />
          <Tooltip title={t('Delete')}>
            <Button
              aria-label={t('Delete')}
              size="small"
              type="text"
              disabled={disabled}
              icon={<IconX size={16} />}
              onClick={() => handleRemoveParam(param.id)}
            />
          </Tooltip>
        </div>
      ))}
      <div>
        <Button size="small" type="dashed" disabled={disabled} icon={<IconPlus size={14} />} onClick={handleAddParam}>
          {t('Add Parameter')}
        </Button>
      </div>
    </Flex>
  );
};

/**
 * Card representing a single editable step inside the action chain editor.
 */
const ActionChainStepCard = ({
  step,
  index,
  totalSteps,
  availableCommands,
  availableExecuteMethods,
  stepRunResult,
  disabled,
  dragHandleRef,
  dragDisabled,
  isDropTarget,
  onUpdateStep,
  onMoveStep,
  onDuplicateStep,
  onDeleteStep,
}) => {
  const {t} = useTranslation();

  const commandMap = new Map(availableCommands);
  const executeMethodMap = new Map(availableExecuteMethods);

  const stepTypeOptions = [
    {value: ACTION_CHAIN_STEP_TYPES.COMMAND, label: t('Command')},
    {value: ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD, label: t('Execute Method')},
    {value: ACTION_CHAIN_STEP_TYPES.WAIT, label: t('Wait')},
    {value: ACTION_CHAIN_STEP_TYPES.CHECK, label: t('Check')},
  ];

  const checkTypeOptions = [
    {value: ACTION_CHAIN_CHECK_TYPES.ELEMENT_EXISTS, label: t('Element Exists')},
    {value: ACTION_CHAIN_CHECK_TYPES.ELEMENT_NOT_EXISTS, label: t('Element Does Not Exist')},
    {value: ACTION_CHAIN_CHECK_TYPES.SOURCE_CONTAINS, label: t('Page Source Contains')},
    {value: ACTION_CHAIN_CHECK_TYPES.SOURCE_NOT_CONTAINS, label: t('Page Source Does Not Contain')},
  ];

  const failureActionOptions = [
    {value: ACTION_CHAIN_FAILURE_ACTIONS.STOP, label: t('Stop Chain')},
    {value: ACTION_CHAIN_FAILURE_ACTIONS.CONTINUE, label: t('Continue Chain')},
  ];

  const commandOptions = availableCommands.map(([methodName]) => ({
    value: methodName,
    label: methodName,
  }));

  const executeMethodOptions = availableExecuteMethods.map(([methodName]) => ({
    value: methodName,
    label: methodName,
  }));

  const handleStepTypeChange = (newType) => {
    if (newType === step.type) {
      return;
    }
    onUpdateStep(step.id, createActionChainStep(newType, {id: step.id}));
  };

  const handleCommandNameChange = (newName) => {
    const details = commandMap.get(newName);
    const updatedParams = details ? syncStepParamsWithDefinition(step.params, details.params || []) : step.params || [];
    onUpdateStep(step.id, {...step, name: newName, params: updatedParams});
  };

  const handleExecuteMethodChange = (newName) => {
    const details = executeMethodMap.get(newName);
    const updatedParams = details ? syncStepParamsWithDefinition(step.params, details.params || []) : step.params || [];
    onUpdateStep(step.id, {...step, name: newName, params: updatedParams});
  };

  const handleParamsUpdate = (newParams) => {
    onUpdateStep(step.id, {...step, params: newParams});
  };

  const isElementCheck = ELEMENT_CHECK_TYPES.has(step.checkType);

  return (
    <Card
      size="small"
      className={isDropTarget ? styles.stepCardDropTarget : undefined}
      styles={{
        header: {padding: '4px 8px', minHeight: '36px'},
        body: {padding: '10px'},
      }}
      title={
        <Space size={6}>
          <span
            ref={dragHandleRef}
            className={styles.stepDragHandle}
            aria-label={t('dragToReorder')}
            style={{visibility: dragDisabled ? 'hidden' : 'visible'}}
          >
            <IconGripVertical size={16} />
          </span>
          <Typography.Text className={styles.stepIndexBadge}>#{index + 1}</Typography.Text>
          <Select
            size="small"
            disabled={disabled}
            value={step.type}
            options={stepTypeOptions}
            style={{width: 150}}
            onChange={handleStepTypeChange}
          />
          {stepRunResult && (
            <Tag color={STATUS_TAG_COLORS[stepRunResult.status] || 'default'}>
              {t(STATUS_LABEL_KEYS[stepRunResult.status] || stepRunResult.status)}
            </Tag>
          )}
        </Space>
      }
      extra={
        <Space size={2}>
          <Tooltip title={t('Move Up')}>
            <Button
              aria-label={t('Move Up')}
              size="small"
              type="text"
              disabled={disabled || index === 0}
              icon={<IconArrowUp size={16} />}
              onClick={() => onMoveStep(index, index - 1)}
            />
          </Tooltip>
          <Tooltip title={t('Move Down')}>
            <Button
              aria-label={t('Move Down')}
              size="small"
              type="text"
              disabled={disabled || index === totalSteps - 1}
              icon={<IconArrowDown size={16} />}
              onClick={() => onMoveStep(index, index + 1)}
            />
          </Tooltip>
          <Tooltip title={t('Duplicate')}>
            <Button
              aria-label={t('Duplicate')}
              size="small"
              type="text"
              disabled={disabled}
              icon={<IconCopy size={16} />}
              onClick={() => onDuplicateStep(step.id)}
            />
          </Tooltip>
          <Tooltip title={t('Delete')}>
            <Button
              aria-label={t('Delete')}
              size="small"
              type="text"
              disabled={disabled}
              icon={<IconX size={16} />}
              onClick={() => onDeleteStep(step.id)}
            />
          </Tooltip>
        </Space>
      }
    >
      {step.type === ACTION_CHAIN_STEP_TYPES.COMMAND && (
        <Flex gap={8} orientation="vertical">
          <AutoComplete
            disabled={disabled}
            value={step.name}
            options={commandOptions}
            placeholder={t('Select a command')}
            className={inspectorStyles.monoFont}
            filterOption={(inputValue, option) => option.value.toLowerCase().includes(inputValue.trim().toLowerCase())}
            onChange={handleCommandNameChange}
          />
          <StepParametersEditor params={step.params || []} onUpdateParams={handleParamsUpdate} disabled={disabled} />
        </Flex>
      )}

      {step.type === ACTION_CHAIN_STEP_TYPES.EXECUTE_METHOD && (
        <Flex gap={8} orientation="vertical">
          <AutoComplete
            disabled={disabled}
            value={step.name}
            options={executeMethodOptions}
            placeholder={t('Select or enter an execute method')}
            className={inspectorStyles.monoFont}
            filterOption={(inputValue, option) => option.value.toLowerCase().includes(inputValue.trim().toLowerCase())}
            onChange={handleExecuteMethodChange}
          />
          <StepParametersEditor params={step.params || []} onUpdateParams={handleParamsUpdate} disabled={disabled} />
        </Flex>
      )}

      {step.type === ACTION_CHAIN_STEP_TYPES.WAIT && (
        <Space>
          <Typography.Text>{t('Duration (ms)')}:</Typography.Text>
          <InputNumber
            size="small"
            disabled={disabled}
            min={0}
            step={100}
            value={step.duration}
            onChange={(val) => onUpdateStep(step.id, {...step, duration: typeof val === 'number' ? val : 0})}
          />
        </Space>
      )}

      {step.type === ACTION_CHAIN_STEP_TYPES.CHECK && (
        <Flex gap={8} orientation="vertical">
          <Flex gap={8} wrap>
            <Select
              size="small"
              disabled={disabled}
              value={step.checkType}
              options={checkTypeOptions}
              style={{minWidth: 200, flex: 1}}
              onChange={(checkType) => onUpdateStep(step.id, {...step, checkType})}
            />
            <Select
              size="small"
              disabled={disabled}
              value={step.onFailure || ACTION_CHAIN_FAILURE_ACTIONS.STOP}
              options={failureActionOptions}
              style={{width: 150}}
              onChange={(onFailure) => onUpdateStep(step.id, {...step, onFailure})}
            />
          </Flex>
          {isElementCheck ? (
            <Flex gap={8} wrap>
              <Select
                size="small"
                disabled={disabled}
                value={step.strategy}
                options={LOCATOR_STRATEGY_OPTIONS}
                style={{minWidth: 180, flex: '0 0 42%'}}
                onChange={(strategy) => onUpdateStep(step.id, {...step, strategy})}
              />
              <Input
                size="small"
                disabled={disabled}
                placeholder={t('Selector')}
                className={inspectorStyles.monoFont}
                style={{flex: 1}}
                value={step.selector}
                onChange={(e) => onUpdateStep(step.id, {...step, selector: e.target.value})}
              />
            </Flex>
          ) : (
            <Input
              size="small"
              disabled={disabled}
              placeholder={t('Expected Text')}
              className={inspectorStyles.monoFont}
              value={step.value}
              onChange={(e) => onUpdateStep(step.id, {...step, value: e.target.value})}
            />
          )}
          <Space>
            <Typography.Text>{t('Timeout (ms)')}:</Typography.Text>
            <InputNumber
              size="small"
              disabled={disabled}
              min={0}
              step={250}
              value={step.timeout ?? 0}
              onChange={(val) => onUpdateStep(step.id, {...step, timeout: typeof val === 'number' ? val : 0})}
            />
          </Space>
        </Flex>
      )}
    </Card>
  );
};

export default ActionChainStepCard;
