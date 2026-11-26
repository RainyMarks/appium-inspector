import {IconPlaylist} from '@tabler/icons-react';
import {Card, Flex} from 'antd';
import {useTranslation} from 'react-i18next';

/**
 * Title of the saved action chains tab card.
 */
const ActionChainsTabTitle = () => {
  const {t} = useTranslation();

  return (
    <Flex gap={4} align="center">
      <IconPlaylist size={18} />
      {t('Saved Action Chains')}
    </Flex>
  );
};

/**
 * Wrapper card for the saved action chains tab.
 */
const ActionChainsTabCard = ({children}) => (
  <Card
    title={<ActionChainsTabTitle />}
    styles={{
      header: {padding: '0px 8px 0px 16px', minHeight: '48px'},
      body: {padding: '12px', height: 'calc(100% - 48px)'},
    }}
  >
    {children}
  </Card>
);

export default ActionChainsTabCard;
