import {IconPlaylist} from '@tabler/icons-react';
import {Card, Flex} from 'antd';
import {useTranslation} from 'react-i18next';

/**
 * Title of the action chain editor card.
 */
const ActionChainEditorTitle = () => {
  const {t} = useTranslation();

  return (
    <Flex gap={4} align="center">
      <IconPlaylist size={18} />
      {t('Action Chain Builder')}
    </Flex>
  );
};

/**
 * Wrapper card for the action chain editor.
 */
const ActionChainEditorCard = ({children}) => (
  <Card
    title={<ActionChainEditorTitle />}
    styles={{
      header: {padding: '0px 8px 0px 16px', minHeight: '48px'},
      body: {display: 'flex', flexFlow: 'column', padding: '12px', height: 'calc(100% - 48px)'},
    }}
  >
    {children}
  </Card>
);

export default ActionChainEditorCard;
