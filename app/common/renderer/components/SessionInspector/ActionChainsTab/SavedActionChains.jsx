import {Flex} from 'antd';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';

import ActionChainResultModal from './ActionChainResultModal.jsx';
import ActionChainsTabCard from './ActionChainsTabCard.jsx';
import SavedActionChainsTable from './SavedActionChainsTable.jsx';

/**
 * Contents of the Action Chains tab: list of saved action chains.
 */
const SavedActionChains = (props) => {
  const {actionChainRunResult} = props;
  const {t} = useTranslation();
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);

  return (
    <ActionChainsTabCard>
      <Flex gap={8} orientation="vertical" style={{height: '100%'}}>
        {t('actionChainsDescription')}
        <div style={{flex: 1, minHeight: '100px'}}>
          <SavedActionChainsTable {...props} onOpenLastResult={() => setIsResultModalOpen(true)} />
        </div>
      </Flex>
      <ActionChainResultModal
        open={isResultModalOpen && Boolean(actionChainRunResult)}
        runResult={actionChainRunResult}
        onClose={() => setIsResultModalOpen(false)}
      />
    </ActionChainsTabCard>
  );
};

export default SavedActionChains;
