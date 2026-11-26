import {
  APPIUM_TO_WD_COMMANDS,
  COMMAND_DEFINITIONS,
  COMMAND_EXECUTE_SCRIPT,
  COMMANDS_WITH_MISMATCHED_PARAMS,
  TOP_LEVEL_COMMANDS,
} from '../constants/commands.js';
import {isEmpty, isPlainObject} from './common.js';

/**
 * Prepare a command or execute method invocation into the WebdriverIO method name and argument array.
 *
 * @param {string} cmdName Command name or execute method name (e.g. 'mobile: terminateApp')
 * @param {Array<{name: string, required?: boolean}>} [cmdParams] Parameter definitions
 * @param {Array<*>} [rawParamVals] Raw parameter values matching cmdParams order
 * @param {boolean} [isExecute=false] Whether cmdName is an execute method
 * @param {{omitEmptyOptional?: boolean}} [options] Formatting options
 * @returns {[string, Array<*>]} Tuple of [methodName, args]
 */
export function prepareCommandForExecution(
  cmdName,
  cmdParams = [],
  rawParamVals = [],
  isExecute = false,
  {omitEmptyOptional = false} = {},
) {
  const adjustedCmdName = isExecute ? COMMAND_EXECUTE_SCRIPT : cmdName;
  const convertRawValue = (val) => (typeof val === 'string' ? adjustParamValueType(val) : val);
  let adjustedCmdParams = rawParamVals.map(convertRawValue);

  // If we are about to run an execute method,
  // the parameters array needs to be turned into an object,
  // and the command name added as a separate parameter.
  if (isExecute) {
    const entries = [];
    if (!isEmpty(cmdParams)) {
      for (let i = 0; i < cmdParams.length; i++) {
        const param = cmdParams[i];
        const rawVal = rawParamVals[i];
        if (omitEmptyOptional && !param.required && (rawVal === undefined || rawVal === '')) {
          continue;
        }
        entries.push([param.name, adjustedCmdParams[i]]);
      }
    }
    const mappedCmdParams = Object.fromEntries(entries);
    adjustedCmdParams = [cmdName, mappedCmdParams];
  } else if (omitEmptyOptional && !isEmpty(cmdParams)) {
    let lastIncludedIndex = -1;
    for (let i = 0; i < cmdParams.length; i++) {
      const param = cmdParams[i];
      const rawVal = rawParamVals[i];
      if (param.required || (rawVal !== undefined && rawVal !== '')) {
        lastIncludedIndex = i;
      }
    }
    adjustedCmdParams = lastIncludedIndex >= 0 ? adjustedCmdParams.slice(0, lastIncludedIndex + 1) : [];
  }

  // The WebDriver spec for 'executeScript' requires 'args' to be an array
  // (https://w3c.github.io/webdriver/#dfn-extract-the-script-arguments-from-a-request),
  // but if the script doesn't use any arguments, we allow the user to omit it.
  // So we can have 5 cases for 'args': undefined, {}, [], {...}, [{...}]
  if (adjustedCmdName === COMMAND_EXECUTE_SCRIPT) {
    if (isEmpty(adjustedCmdParams[1])) {
      adjustedCmdParams[1] = [];
    } else if (isPlainObject(adjustedCmdParams[1])) {
      adjustedCmdParams[1] = [adjustedCmdParams[1]];
    }
  }
  return [adjustedCmdName, adjustedCmdParams];
}

/**
 * Return the flat list of static command definitions as [commandName, commandDetails] pairs.
 * Used as a fallback when a driver does not expose dynamic method maps.
 *
 * @returns {[string, Object][]}
 */
export function getStaticCommandsList() {
  const commands = {...TOP_LEVEL_COMMANDS};
  for (const groupCommands of Object.values(COMMAND_DEFINITIONS)) {
    Object.assign(commands, groupCommands);
  }
  return Object.entries(commands);
}

/**
 * Try to detect if the input value should be a boolean/number/array/object,
 * and if so, convert it to that
 *
 * @param {string} value the value of a command parameter
 * @returns the value converted to the type it matches best
 */
export function adjustParamValueType(value) {
  if (value === '') {
    return null;
  } else if (Number(value).toString() === value) {
    return Number(value);
  } else if (['true', 'false'].includes(value)) {
    return value === 'true';
  } else {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}

/**
 * Filter the array of method key-value pairs to only include methods matching the search query.
 *
 * @param {[string, Object][]} methodPairs array of [methodName, methodDetails] pairs
 * @param {string} searchQuery user-provided search query
 * @returns filtered array of [methodName, methodDetails] pairs
 */
export function filterMethodPairs(methodPairs, searchQuery) {
  if (!searchQuery) {
    return methodPairs;
  }
  return methodPairs.filter(([methodName]) => methodName.toLowerCase().includes(searchQuery.toLowerCase()));
}

/**
 * Check if a value is an empty object or array ({} or [])
 *
 * @param {*} value any value (object, array, primitive)
 * @returns whether the item is an empty object/array or not
 */
const isEmptyObject = (value) => typeof value === 'object' && value !== null && isEmpty(value);

/**
 * Recursively remove key/value pairs (or array entries) whose values are empty objects or arrays.
 * If this causes the parent object/array to become empty,
 * this parent will be removed from its own parent as well.
 *
 * @param {*} value any value (object, array, primitive)
 * @returns the value with empty entries removed
 */
export function deepFilterEmpty(value) {
  if (Array.isArray(value)) {
    // Recurse into each array element, then remove empty entries
    return value.map(deepFilterEmpty).filter((item) => !isEmptyObject(item));
  }

  if (isPlainObject(value)) {
    // Recurse into object properties, then pick only non-empty values
    const recursed = Object.entries(value).map(([key, val]) => [key, deepFilterEmpty(val)]);
    return Object.fromEntries(recursed.filter(([, val]) => !isEmptyObject(val)));
  }

  // Return primitives as-is
  return value;
}

/**
 * Extract any parameter names (except sessionId) from a command path.
 *
 * @param {string} path command endpoint URL
 * @returns array of parameter names
 */
export function extractParamsFromCommandPath(path) {
  return path
    .split('/')
    .flatMap((segment) => (segment.startsWith(':') && segment !== ':sessionId' ? [segment.slice(1)] : []));
}

/**
 * Filter and transform the map of commands supported by the current driver using certain criteria:
 *   * Remove entries with empty values (similarly to {@link deepFilterEmpty})
 *   * Remove commands not supported by WDIO
 *
 * In addition to filtering, the map is modified to remove the base/driver/plugin scopes,
 * the path and the HTTP method.
 *
 * @param {Object} cmdsResponse {@link https://github.com/appium/appium/blob/master/packages/types/lib/command-maps.ts `ListCommandsResponse`}
 * @returns array of key-value pairs with command names and their details
 */
export function transformCommandsMap(cmdsResponse) {
  let adjBaseCmdsMap = {},
    adjDriverCmdsMap = {},
    adjPluginCmdsMap = {};
  // cmdsResponse: REST/BiDi to base/driver/plugins source map
  // only use the REST commands for now
  if (isEmpty(cmdsResponse) || !('rest' in cmdsResponse) || isEmpty(cmdsResponse.rest)) {
    return [];
  }
  const restCmdsMap = cmdsResponse.rest;
  // restCmdsMap: base/driver/plugins source to command paths/plugin names map
  for (const source in restCmdsMap) {
    if (source === 'plugins') {
      const pluginNamesMap = restCmdsMap[source];
      // pluginNamesMap: plugin names to plugin command paths map
      for (const pluginName in pluginNamesMap) {
        const pluginCmdsMap = pluginNamesMap[pluginName];
        // pluginCmdsMap: plugin command paths to HTTP methods map
        // Use spread operator to handle multiple plugins
        adjPluginCmdsMap = {...adjPluginCmdsMap, ...transformInnerCommandsMap(pluginCmdsMap)};
      }
    } else {
      const sourceCmdsMap = restCmdsMap[source];
      // sourceCmdsMap: base/driver command paths to HTTP methods map
      if (source === 'base') {
        adjBaseCmdsMap = transformInnerCommandsMap(sourceCmdsMap);
      } else if (source === 'driver') {
        adjDriverCmdsMap = transformInnerCommandsMap(sourceCmdsMap);
      }
    }
  }
  // Merge all maps in a logical priority order
  return Object.entries({...adjBaseCmdsMap, ...adjDriverCmdsMap, ...adjPluginCmdsMap});
}

/**
 * Filter and transform the map of execute methods supported by the current driver,
 * by removing entries with empty values (similarly to {@link deepFilterEmpty})
 *
 * In addition to filtering, the map is modified to remove the driver/plugin scopes.
 *
 * @param {Object} execMethodsResponse {@link https://github.com/appium/appium/blob/master/packages/types/lib/command-maps.ts `ListExtensionsResponse`}
 * @returns array of key-value pairs with execute method names and their details
 */
export function transformExecMethodsMap(execMethodsResponse) {
  let adjExecMethodsMap = {};
  // execMethodsResponse: REST to driver/plugins source map
  if (isEmpty(execMethodsResponse) || !('rest' in execMethodsResponse) || isEmpty(execMethodsResponse.rest)) {
    return [];
  }
  const restExecMethodsMap = execMethodsResponse.rest;
  // restExecMethodsMap: driver/plugins source to method names/execute methods map
  for (const source in restExecMethodsMap) {
    if (source === 'plugins') {
      const pluginNamesMap = restExecMethodsMap[source];
      // pluginNamesMap: plugin names to execute methods map
      for (const pluginName in pluginNamesMap) {
        const pluginExecMethodsMap = pluginNamesMap[pluginName];
        // pluginExecMethodsMap: plugin execute method names to method details map
        // Any plugin execute methods should override driver ones if there are name conflicts
        adjExecMethodsMap = {...adjExecMethodsMap, ...deepFilterEmpty(pluginExecMethodsMap)};
      }
    } else if (source === 'driver') {
      const driverExecMethodsMap = restExecMethodsMap[source];
      // driverExecMethodsMap: driver execute method names to method details map
      // Any plugin execute methods should override driver ones if there are name conflicts
      adjExecMethodsMap = {...deepFilterEmpty(driverExecMethodsMap), ...adjExecMethodsMap};
    }
  }
  return Object.entries(adjExecMethodsMap);
}

/**
 * Filter and transform a given map of command paths/methods/details.
 *
 * @param {Object} pathsToCmdsMap map of command paths to their HTTP methods and details
 * @returns flat map of command names to their details
 */
function transformInnerCommandsMap(pathsToCmdsMap) {
  const transformedMap = {};
  for (const path in pathsToCmdsMap) {
    const pathsCmdsMap = pathsToCmdsMap[path];
    // pathsCmdsMap: HTTP methods to commands map
    for (const method in pathsCmdsMap) {
      // Skip commands that don't have the command name
      if (isEmpty(pathsCmdsMap[method]) || !('command' in pathsCmdsMap[method])) {
        continue;
      }
      const cmdName = pathsCmdsMap[method].command;
      // Skip commands not supported by WDIO
      if (!(cmdName in APPIUM_TO_WD_COMMANDS)) {
        continue;
      }
      // Filter out any entries with empty values
      const commandDetails = deepFilterEmpty(pathsCmdsMap[method]);
      // If we have multiple entries for the same method name in the same source (e.g. /execute
      // and /execute/sync in Appium 2 are both named 'execute'), skip any deprecated entries
      if (APPIUM_TO_WD_COMMANDS[cmdName] in transformedMap && 'deprecated' in commandDetails) {
        continue;
      }
      // Some commands require parameter adjustments due to WDIO method signature differences
      if (cmdName in COMMANDS_WITH_MISMATCHED_PARAMS) {
        commandDetails.params = COMMANDS_WITH_MISMATCHED_PARAMS[cmdName];
      }
      // For commands that include additional parameters in the path (e.g. /session/:sessionId/element/:elementId),
      // WDIO includes them in the method itself, so we need to extract their names from the path
      // and add them to the start of the parameters array
      const commandPathParamNames = extractParamsFromCommandPath(path);
      if (commandPathParamNames.length > 0) {
        const commandPathParamEntries = commandPathParamNames.map((paramName) => ({
          name: paramName,
          required: true,
        }));
        commandDetails.params = [...commandPathParamEntries, ...(commandDetails.params || [])];
      }
      // Add the adjusted command details to the result map, using the WDIO command name.
      transformedMap[APPIUM_TO_WD_COMMANDS[cmdName]] = commandDetails;
    }
  }
  return transformedMap;
}
