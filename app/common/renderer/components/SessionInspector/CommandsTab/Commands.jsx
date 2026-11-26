import {useEffect, useRef, useState} from 'react';

import {
  prepareCommandForExecution,
  transformCommandsMap,
  transformExecMethodsMap,
} from '../../../utils/commands-tab.js';
import {isEmpty} from '../../../utils/common.js';
import CommandParametersModal from './CommandParametersModal.jsx';
import CommandResultModal from './CommandResult/CommandResultModal.jsx';
import CommandsTabCard from './CommandsTabCard.jsx';
import MethodMapCommandsTabs from './MethodMapCommandsTabs.jsx';
import StaticCommandsContent from './StaticCommandsContent.jsx';

import styles from './Commands.module.css';

/**
 * Contents of the commands tab.
 */
const Commands = ({applyClientMethod, getSupportedSessionMethods, getItemColspan}) => {
  const [hasMethodsMap, setHasMethodsMap] = useState(null);
  const [driverCommands, setDriverCommands] = useState(null);
  const [driverExecuteMethods, setDriverExecuteMethods] = useState(null);

  const [curCommandDetails, setCurCommandDetails] = useState(null);
  const curCommandParamValsRef = useRef([]);

  const [commandResult, setCommandResult] = useState(undefined);

  const startCommand = (commandDetails) => {
    setCurCommandDetails(commandDetails);
    if (isEmpty(commandDetails.details.params)) {
      prepareAndRunCommand(commandDetails);
    }
  };

  const prepareCommand = (cmdName, cmdParams, isExecute) =>
    prepareCommandForExecution(cmdName, cmdParams, curCommandParamValsRef.current, isExecute);

  const runCommand = async (methodName, args, skipRefresh) => {
    const res = await applyClientMethod({
      methodName,
      args,
      skipRefresh,
    });
    setCommandResult(res);
  };

  const prepareAndRunCommand = (commandDetails) => {
    const {
      name: cmdName,
      details: {params: cmdParams, refresh = false},
      isExecute = false,
    } = commandDetails;

    const [newCmdName, newCmdParams] = prepareCommand(cmdName, cmdParams, isExecute);
    // Do not await - let the command run in the background without blocking the UI
    runCommand(newCmdName, newCmdParams, !refresh);
  };

  const clearCurrentCommand = () => {
    setCommandResult(undefined);
    setCurCommandDetails(null);
    curCommandParamValsRef.current = [];
  };

  useEffect(() => {
    (async () => {
      const {commands, executeMethods} = await getSupportedSessionMethods();
      setHasMethodsMap(!(isEmpty(commands) && isEmpty(executeMethods)));
      setDriverCommands(transformCommandsMap(commands));
      setDriverExecuteMethods(transformExecMethodsMap(executeMethods));
    })();
  }, [getSupportedSessionMethods]);

  return (
    <CommandsTabCard>
      <div className={styles.commandsContainer}>
        {/* do not use ternary operator, as that will show the static list
            while getSupportedSessionMethods is running */}
        {hasMethodsMap === false && (
          <StaticCommandsContent getItemColspan={getItemColspan} startCommand={startCommand} />
        )}
        {hasMethodsMap && (
          <MethodMapCommandsTabs
            getItemColspan={getItemColspan}
            driverCommands={driverCommands}
            driverExecuteMethods={driverExecuteMethods}
            startCommand={startCommand}
          />
        )}
        {!!curCommandDetails && (
          <CommandParametersModal
            curCommandDetails={curCommandDetails}
            curCommandParamValsRef={curCommandParamValsRef}
            prepareAndRunCommand={prepareAndRunCommand}
            clearCurrentCommand={clearCurrentCommand}
          />
        )}
        {commandResult !== undefined && (
          <CommandResultModal
            commandName={curCommandDetails.name}
            commandResult={commandResult}
            clearCurrentCommand={clearCurrentCommand}
          />
        )}
      </div>
    </CommandsTabCard>
  );
};

export default Commands;
