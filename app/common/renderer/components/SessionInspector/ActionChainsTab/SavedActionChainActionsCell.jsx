import {IconEdit, IconFileExport, IconPlayerPlay, IconPlayerStop, IconTrash} from '@tabler/icons-react';
import {Button, Popconfirm, Space, Tooltip} from 'antd';
import {useTranslation} from 'react-i18next';

/**
 * Final cell of each saved action chain row, containing play/stop, edit, export, and delete controls.
 */
const SavedActionChainActionsCell = (props) => {
  const {
    actionChain,
    runningActionChain,
    runActionChain,
    stopActionChain,
    showActionChainEditor,
    setLoadedActionChain,
    exportSavedActionChain,
    deleteSavedActionChain,
  } = props;
  const {t} = useTranslation();
  const playLabel = t('Play');
  const stopLabel = t('Stop');
  const editLabel = t('Edit');
  const exportLabel = t('Export to File');
  const deleteLabel = t('Delete');

  const isAnyChainRunning = Boolean(runningActionChain);
  const isThisChainRunning = runningActionChain?.chainId === actionChain.id;

  const loadActionChain = () => {
    setLoadedActionChain(actionChain);
    showActionChainEditor();
  };

  return (
    <Space.Compact>
      {isThisChainRunning ? (
        <Tooltip zIndex={3} title={stopLabel}>
          <Button
            aria-label={stopLabel}
            danger
            type="primary"
            icon={<IconPlayerStop size={18} />}
            onClick={() => stopActionChain()}
          />
        </Tooltip>
      ) : (
        <Tooltip zIndex={3} title={playLabel}>
          <Button
            aria-label={playLabel}
            type="primary"
            disabled={isAnyChainRunning}
            icon={<IconPlayerPlay size={18} />}
            onClick={() => runActionChain(actionChain)}
          />
        </Tooltip>
      )}
      <Tooltip zIndex={3} title={editLabel}>
        <Button
          aria-label={editLabel}
          disabled={isAnyChainRunning}
          icon={<IconEdit size={18} />}
          onClick={() => loadActionChain()}
        />
      </Tooltip>
      <Tooltip zIndex={3} title={exportLabel}>
        <Button
          aria-label={exportLabel}
          icon={<IconFileExport size={18} />}
          onClick={() => exportSavedActionChain(actionChain)}
        />
      </Tooltip>
      <Tooltip zIndex={3} title={deleteLabel}>
        <Popconfirm
          zIndex={4}
          title={t('confirmDeletion')}
          placement="topRight"
          okText={t('OK')}
          cancelText={t('Cancel')}
          onConfirm={() => deleteSavedActionChain(actionChain.id)}
        >
          <Button aria-label={deleteLabel} disabled={isAnyChainRunning} icon={<IconTrash size={18} />} />
        </Popconfirm>
      </Tooltip>
    </Space.Compact>
  );
};

export default SavedActionChainActionsCell;
