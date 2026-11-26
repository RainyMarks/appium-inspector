import {Button, Modal, Table, Tag} from 'antd';
import {useTranslation} from 'react-i18next';

import {ACTION_CHAIN_STEP_STATUS} from '../../../constants/action-chains.js';

import inspectorStyles from '../SessionInspector.module.css';
import styles from './ActionChains.module.css';

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

const formatStepDetails = (stepResult) => {
  if (stepResult.error) {
    return stepResult.error;
  }
  if (stepResult.result === undefined) {
    return '';
  }
  if (typeof stepResult.result === 'string') {
    return stepResult.result;
  }
  try {
    return JSON.stringify(stepResult.result, null, 2);
  } catch {
    return String(stepResult.result);
  }
};

/**
 * Modal showing step-by-step execution outcomes for the latest action chain run.
 */
const ActionChainResultModal = ({open, runResult, onClose}) => {
  const {t} = useTranslation();

  if (!runResult) {
    return null;
  }

  const columns = [
    {
      title: '#',
      dataIndex: 'stepNumber',
      key: 'stepNumber',
      width: 50,
    },
    {
      title: t('Step'),
      dataIndex: 'label',
      key: 'label',
      render: (label) => <span className={inspectorStyles.monoFont}>{label}</span>,
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag color={STATUS_TAG_COLORS[status] || 'default'}>{t(STATUS_LABEL_KEYS[status] || status)}</Tag>
      ),
    },
    {
      title: t('Time'),
      dataIndex: 'durationMs',
      key: 'durationMs',
      width: 90,
    },
    {
      title: t('Details'),
      dataIndex: 'details',
      key: 'details',
      render: (details) =>
        details ? <div className={`${inspectorStyles.monoFont} ${styles.resultStepDetails}`}>{details}</div> : null,
    },
  ];

  const dataSource = (runResult.stepResults || []).map((stepResult) => ({
    key: stepResult.stepId,
    stepNumber: stepResult.stepIndex + 1,
    label: stepResult.label,
    status: stepResult.status,
    durationMs: stepResult.durationMs,
    details: formatStepDetails(stepResult),
  }));

  return (
    <Modal
      title={`${t('Action Chain Results')}: ${runResult.chainName}`}
      open={open}
      onCancel={onClose}
      width={{md: '80%', lg: '70%', xl: '65%', xxl: '55%'}}
      footer={
        <Button type="primary" onClick={onClose}>
          {t('OK')}
        </Button>
      }
    >
      <Table size="small" pagination={false} columns={columns} dataSource={dataSource} scroll={{y: 360}} />
    </Modal>
  );
};

export default ActionChainResultModal;
