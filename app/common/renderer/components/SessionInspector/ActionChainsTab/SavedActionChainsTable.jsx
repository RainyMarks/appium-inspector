import {IconListCheck, IconPlus} from '@tabler/icons-react';
import {Button, Card, Space, Spin, Table} from 'antd';
import dayjs from 'dayjs';
import {useEffect} from 'react';
import {useTranslation} from 'react-i18next';

import {SAVED_ACTION_CHAINS_TABLE_VALUES} from '../../../constants/action-chains.js';
import FileUploader from '../../FileUploader.jsx';
import SavedActionChainActionsCell from './SavedActionChainActionsCell.jsx';

import styles from './ActionChains.module.css';

/**
 * Footer of the table listing the saved action chains.
 */
const SavedActionChainsTableFooter = ({
  showActionChainEditor,
  importActionChainFiles,
  hasLastResult,
  onOpenLastResult,
  isRunning,
}) => {
  const {t} = useTranslation();

  return (
    <Space wrap>
      <Space.Compact style={{overflowX: 'auto'}}>
        <Button disabled={isRunning} onClick={showActionChainEditor} icon={<IconPlus size={16} />}>
          {t('Create New Action Chain')}
        </Button>
        <FileUploader
          title={t('Import from File')}
          onUpload={importActionChainFiles}
          multiple={true}
          type="application/json"
        />
      </Space.Compact>
      {hasLastResult && (
        <Button icon={<IconListCheck size={16} />} onClick={onOpenLastResult}>
          {t('View Last Result')}
        </Button>
      )}
    </Space>
  );
};

/**
 * Table listing the saved action chains.
 */
const SavedActionChainsTable = (props) => {
  const {
    savedActionChains,
    showActionChainEditor,
    getSavedActionChains,
    importActionChainFiles,
    isUploadingActionChainFiles,
    runningActionChain,
    actionChainRunResult,
    onOpenLastResult,
  } = props;
  const {t} = useTranslation();

  const dataSource = (savedActionChains || []).map((actionChain) => ({
    key: actionChain.id,
    name: actionChain.name || t('unnamed'),
    description: actionChain.description || t('No Description'),
    stepsCount: (actionChain.steps || []).length,
    created: dayjs(actionChain.date).format('YYYY-MM-DD'),
    actions: <SavedActionChainActionsCell {...props} actionChain={actionChain} />,
  }));

  const columns = [
    {
      title: t('Name'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('Description'),
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: t('Steps'),
      dataIndex: 'stepsCount',
      key: 'stepsCount',
      width: SAVED_ACTION_CHAINS_TABLE_VALUES.STEPS_COLUMN_WIDTH,
    },
    {
      title: t('Created'),
      dataIndex: 'created',
      key: 'created',
      width: SAVED_ACTION_CHAINS_TABLE_VALUES.DATE_COLUMN_WIDTH,
    },
    {
      title: t('Actions'),
      dataIndex: 'actions',
      key: 'actions',
      width: SAVED_ACTION_CHAINS_TABLE_VALUES.ACTIONS_COLUMN_WIDTH,
    },
  ];

  useEffect(() => {
    getSavedActionChains();
  }, [getSavedActionChains]);

  return (
    <Card styles={{root: {height: '100%'}, body: {height: '100%', padding: '2px'}}}>
      <Spin spinning={Boolean(isUploadingActionChainFiles)}>
        <Table
          className={styles.savedActionChainsTable}
          styles={{
            root: {height: '100%'},
            header: {cell: {padding: '8px 16px'}},
            section: {height: 'calc(100% - 49px)'},
            body: {cell: {padding: '8px 16px'}},
            footer: {padding: '8px', borderTop: '1px solid var(--ant-table-border-color)', display: 'flex'},
          }}
          pagination={false}
          dataSource={dataSource}
          columns={columns}
          scroll={{x: '560px', y: 'calc(100% - 37px)'}}
          footer={() => (
            <SavedActionChainsTableFooter
              showActionChainEditor={showActionChainEditor}
              importActionChainFiles={importActionChainFiles}
              hasLastResult={Boolean(actionChainRunResult)}
              onOpenLastResult={onOpenLastResult}
              isRunning={Boolean(runningActionChain)}
            />
          )}
        />
      </Spin>
    </Card>
  );
};

export default SavedActionChainsTable;
