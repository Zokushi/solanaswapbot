import React, {  useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { shortenUUID } from '../../utils/helper.js';
import { ConfigListProps, SortField, SortDirection, FilterType, BotWithType, ConfigListState, BotStatus } from '../../core/types.js';
import { getSingleTokenData } from '../../services/tokenDataService.js';
import { useAppContext } from '../context/AppContext.js';
import { useApp } from 'ink';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ConfigList');


export type BotData = {
  botId: string;
  status: string;
  inputMint: string;
  outputMint: string;
  currentPrice: number;
  targetTrade: number;
  difference: number;
  ratio: number;
  trades: number;
  tokenInPrice?: number;
  tokenOutPrice?: number;
  targetMint?: string;
  targetAmounts?: any[];
};

export type ConfigData = {
  regularBots: Array<{
    botId: string;
    initialInputToken: string;
    initialOutputToken: string;
    initialInputAmount: number;
    firstTradePrice: number | bigint;
    targetGainPercentage: number;
    stopLossPercentage?: number;
    status: string;
  }>;
  multiBots: Array<{
    botId: string;
    initialInputToken: string;
    initialInputAmount: number;
    targetGainPercentage: number;
    stopLossPercentage?: number;
    checkInterval?: number;
    status: string;
    targetAmounts: Array<{
      id: string;
      configId: string;
      tokenAddress: string;
      amount: number;
    }>;
  }>;
};

export const ConfigList: React.FC<ConfigListProps> = ({ onBack }) => {
  const { cliSocket } = useAppContext();
  const eventBus = cliSocket.getEventBus();
  const { exit } = useApp();
  const [configs, setConfigs] = React.useState<ConfigData>({ regularBots: [], multiBots: [] });
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [sortField, setSortField] = React.useState<SortField>('type');
  const [sortDirection, setSortDirection] = React.useState<SortDirection>('asc');
  const [filter, setFilter] = React.useState<FilterType>('all');
  const [error, setError] = React.useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = React.useState<BotWithType | null>(null);
  const [selectedAction, setSelectedAction] = React.useState<'view' | 'delete' | 'edit'>('view');
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValues, setEditValues] = React.useState<Partial<BotWithType>>({});
  const [editField, setEditField] = React.useState<string>('');
  const [tokenInput, setTokenInput] = React.useState('');
  const [isEditingToken, setIsEditingToken] = React.useState(false);
  const [editingTargetIndex, setEditingTargetIndex] = React.useState<number | null>(null);
  const [targetAmountInput, setTargetAmountInput] = React.useState('');
  const [tokenNames, setTokenNames] = React.useState<Map<string, string>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [isSocketConnected, setIsSocketConnected] = React.useState(false);

  const fetchConfigs = useCallback(() => {
    try {
      logger.info('Fetching configs...', { method: 'fetchConfigs', isConnected: isSocketConnected });
      if (isSocketConnected) {
        eventBus.emit('config:get', {});
      } else {
        logger.warn('Socket not connected, will retry when connected', { method: 'fetchConfigs' });
      }
    } catch (error) {
      logger.error('Error fetching configs:', error);
      setError('Failed to fetch configurations');
      setLoading(false);
    }
  }, [eventBus, isSocketConnected]);

  React.useEffect(() => {
    logger.info('Setting up config list effect', { method: 'useEffect' });
    
    const handleConfigUpdate = (data: unknown) => {
      try {
        logger.info('Received config update event', { 
          method: 'handleConfigUpdate',
          hasData: !!data,
          dataType: typeof data
        });

        // Type guard to check if data is ConfigData
        if (
          typeof data === 'object' &&
          data !== null &&
          'regularBots' in data &&
          'multiBots' in data
        ) {
          logger.info('Processing valid config data', { 
            method: 'handleConfigUpdate',
            regularBotsCount: (data as ConfigData).regularBots.length,
            multiBotsCount: (data as ConfigData).multiBots.length
          });
          setConfigs(data as ConfigData);
          setError(null);
          setLoading(false);
        } else {
          logger.error('Invalid config data received', { 
            method: 'handleConfigUpdate',
            data
          });
          throw new Error('Invalid config data received');
        }
      } catch (error) {
        logger.error('Failed to process configs:', error);
        setError('Failed to process configurations');
        setLoading(false);
      }
    };

    const handleError = (error: any) => {
      logger.error('Socket error:', error);
      setError(error.message || 'An error occurred');
      setLoading(false);
    };

    const handleConnect = () => {
      logger.info('Socket connected, fetching configs', { method: 'handleConnect' });
      setIsSocketConnected(true);
      fetchConfigs();
    };

    const handleDisconnect = () => {
      logger.info('Socket disconnected', { method: 'handleDisconnect' });
      setIsSocketConnected(false);
    };

    // Set up event bus listeners
    logger.info('Setting up event listeners', { method: 'useEffect' });
    eventBus.on('config:response', handleConfigUpdate);
    eventBus.on('error', handleError);
    eventBus.on('connect', handleConnect);
    eventBus.on('disconnect', handleDisconnect);

    // Initial fetch if socket is already connected
    if (isSocketConnected) {
      fetchConfigs();
    }

    // Cleanup function
    return () => {
      eventBus.off('config:response', handleConfigUpdate);
      eventBus.off('error', handleError);
      eventBus.off('connect', handleConnect);
      eventBus.off('disconnect', handleDisconnect);
    };
  }, [eventBus, fetchConfigs, isSocketConnected]);

  // Add a debug effect to log state changes
  React.useEffect(() => {
    logger.debug('Configs state updated:', { 
      method: 'stateUpdate',
      regularBotsCount: configs.regularBots.length,
      multiBotsCount: configs.multiBots.length,
      loading,
      error,
      selectedIndex,
      hasSelectedConfig: !!selectedConfig
    });
  }, [configs, loading, error, selectedIndex, selectedConfig]);

  const fetchTokenNames = React.useCallback(async (mints: (string | undefined)[]) => {
    try {
      const names = new Map<string, string>();
      const validMints = mints.filter((mint): mint is string => typeof mint === 'string' && mint !== '');
      
      for (const mint of validMints) {
        try {
          const tokenData = await getSingleTokenData(mint);
          if (tokenData) {
            names.set(mint, tokenData.name || tokenData.symbol || mint);
          } else {
            names.set(mint, mint); // Fallback to mint address if not found in DB
          }
        } catch (error) {
          console.error(`Failed to fetch token data for ${mint}:`, error);
          names.set(mint, mint); // Fallback to mint address if fetch fails
        }
      }
      setTokenNames(prev => new Map([...prev, ...names]));
    } catch (error) {
      console.error('Failed to fetch token names:', error);
    }
  }, []);

  React.useEffect(() => {
    if (configs.regularBots.length > 0 || configs.multiBots.length > 0) {
      const allMints = new Set<string>();
      configs.regularBots.forEach(bot => {
        if (bot.initialInputToken) allMints.add(bot.initialInputToken);
        if (bot.initialOutputToken) allMints.add(bot.initialOutputToken);
      });
      configs.multiBots.forEach(bot => {
        if (bot.initialInputToken) allMints.add(bot.initialInputToken);
        if (bot.targetAmounts) {
          bot.targetAmounts.forEach((target: { tokenAddress: string }) => {
            if (target.tokenAddress) allMints.add(target.tokenAddress);
          });
        }
      });
      fetchTokenNames(Array.from(allMints));
    }
  }, [configs, fetchTokenNames]);

  React.useEffect(() => {
    if (selectedConfig) {
      const mints = new Set<string>();
      if (selectedConfig.initialInputToken) mints.add(selectedConfig.initialInputToken);
      if (selectedConfig.type === 'regular' && 'initialOutputToken' in selectedConfig) {
        mints.add(selectedConfig.initialOutputToken || '');
      }
      if (selectedConfig.type === 'multi' && 'targetAmounts' in selectedConfig) {
        selectedConfig.targetAmounts?.forEach(target => {
          if (target.tokenAddress) mints.add(target.tokenAddress);
        });
      }
      fetchTokenNames(Array.from(mints));
    }
  }, [selectedConfig, fetchTokenNames]);

  const allBots = React.useMemo(() => {
    const regular = configs.regularBots.map(bot => ({
      ...bot,
      type: 'regular' as const,
      amount: bot.initialInputAmount,
      targetGainPercentage: bot.targetGainPercentage,
      stopLossPercentage: bot.stopLossPercentage,
      firstTradePrice: typeof bot.firstTradePrice === 'number'
        ? BigInt(bot.firstTradePrice)
        : bot.firstTradePrice,
        status: bot.status as BotStatus,
    }));
    const multi = configs.multiBots.map(bot => ({
      ...bot,
      type: 'multi' as const,
      amount: bot.initialInputAmount,
      targetGainPercentage: bot.targetGainPercentage,
      stopLossPercentage: bot.stopLossPercentage,
      targetAmounts: bot.targetAmounts.map(target => ({
        ...target,
        tokenName: tokenNames.get(target.tokenAddress) || target.tokenAddress
      })),
      status: bot.status as BotStatus
    }));
    return [...regular, ...multi];
  }, [configs, tokenNames]);

  const filteredBots = React.useMemo(() => {
    let filtered = allBots;
    
    // Apply filter
    if (filter === 'active') {
      filtered = filtered.filter(bot => bot.status === 'running');
    } else if (filter === 'inactive') {
      filtered = filtered.filter(bot => bot.status === 'stopped');
    }

    // Apply sort
    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'type') {
        comparison = a.type.localeCompare(b.type);
      } else if (sortField === 'amount') {
        comparison = a.amount - b.amount;
      } else if (sortField === 'status') {
        comparison = a.status.localeCompare(b.status);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [allBots, sortField, sortDirection, filter]);

  useInput((input, key) => {
    if (key.escape) {
      if (editingTargetIndex !== null) {
        setEditingTargetIndex(null);
        setTargetAmountInput('');
      } else if (isEditingToken) {
        setIsEditingToken(false);
        setTokenInput('');
      } else if (isEditing) {
        handleCancelEdit();
      } else if (selectedConfig) {
        setSelectedConfig(null);
        setSelectedAction('view');
      } else {
        onBack();
      }
      return;
    }

    if (isEditing) {
      if (editingTargetIndex !== null) {
        if (key.return) {
          const baseTargetAmounts = editValues.targetAmounts
            ? editValues.targetAmounts
            : (selectedConfig?.targetAmounts || []);
          const newTargetAmounts = [...baseTargetAmounts];
          newTargetAmounts[editingTargetIndex] = {
            ...newTargetAmounts[editingTargetIndex],
            amount: Number(targetAmountInput)
          };
          setEditValues(prev => ({
            ...prev,
            targetAmounts: newTargetAmounts
          }));
          setEditingTargetIndex(null);
          setTargetAmountInput('');
        } else if (input.match(/[0-9.]/)) {
          setTargetAmountInput(prev => prev + input);
        } else if (key.backspace) {
          setTargetAmountInput(prev => prev.slice(0, -1));
        }
        return;
      }

      if (isEditingToken) {
        if (key.return) {
          if (editingTargetIndex !== null && selectedConfig) {
            const newTargetAmounts = [...(editValues.targetAmounts || selectedConfig.targetAmounts || [])];
            newTargetAmounts[editingTargetIndex] = {
              ...newTargetAmounts[editingTargetIndex],
              tokenAddress: tokenInput
            };
            setEditValues(prev => ({
              ...prev,
              targetAmounts: newTargetAmounts
            }));
          } else {
            setEditValues(prev => ({
              ...prev,
              [editField]: tokenInput
            }));
          }
          setIsEditingToken(false);
          setTokenInput('');
        } else if (input.match(/[a-zA-Z0-9]/)) {
          setTokenInput(prev => prev + input);
        } else if (key.backspace) {
          setTokenInput(prev => prev.slice(0, -1));
        }
        return;
      }

      if (key.upArrow || key.downArrow) {
        if (!selectedConfig) return;
        const fields = selectedConfig.type === 'regular' ? [
          'initialInputToken',
          'initialOutputToken',
          'targetGainPercentage',
          'stopLossPercentage',
          'firstTradePrice',
          'initialInputAmount'
        ] : [
          'initialInputToken',
          'targetGainPercentage',
          'stopLossPercentage',
          'initialInputAmount',
          'addTarget'
        ];
        const currentIndex = fields.indexOf(editField);
        const nextIndex = key.upArrow 
          ? (currentIndex - 1 + fields.length) % fields.length
          : (currentIndex + 1) % fields.length;
        setEditField(fields[nextIndex]);
      }
      if (key.return) {
        if (!selectedConfig) return;
        if (editField === 'addTarget' && selectedConfig.type === 'multi') {
          const newTargetAmounts = [...(editValues.targetAmounts || selectedConfig.targetAmounts || [])];
          newTargetAmounts.push({ tokenAddress: '', amount: 0 });
          setEditValues(prev => ({
            ...prev,
            targetAmounts: newTargetAmounts
          }));
        } else if (editField === 'initialInputToken' || editField === 'initialOutputToken') {
          setIsEditingToken(true);
          setTokenInput('');
        } else {
          handleSaveEdit();
        }
      }
      if (input.match(/[0-9.]/) && !isEditingToken) {
        setEditValues(prev => ({
          ...prev,
          [editField]: input
        }));
      }
      return;
    }

    if (selectedConfig) {
      if (key.upArrow) {
        const actions: Array<'view' | 'delete' | 'edit'> = ['view', 'delete', 'edit'];
        const currentIndex = actions.indexOf(selectedAction);
        const nextIndex = (currentIndex - 1 + actions.length) % actions.length;
        setSelectedAction(actions[nextIndex]);
      }
      if (key.downArrow) {
        const actions: Array<'view' | 'delete' | 'edit'> = ['view', 'delete', 'edit'];
        const currentIndex = actions.indexOf(selectedAction);
        const nextIndex = (currentIndex + 1) % actions.length;
        setSelectedAction(actions[nextIndex]);
      }
      if (key.return) {
        if (selectedAction === 'delete') {
          handleDelete();
        } else if (selectedAction === 'edit') {
          handleEdit();
        } else {
          setSelectedConfig(null);
          setSelectedAction('view');
        }
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredBots.length - 1));
    }
    if (key.downArrow) {
      setSelectedIndex(prev => (prev < filteredBots.length - 1 ? prev + 1 : 0));
    }
    if (key.return) {
      const selectedBot = filteredBots[selectedIndex];
      if (selectedBot) {
        setSelectedConfig(selectedBot);
      }
      return;
    }
    if (key.leftArrow) {
      const fields: SortField[] = ['type', 'amount', 'status'];
      const currentIndex = fields.indexOf(sortField);
      const nextIndex = (currentIndex - 1 + fields.length) % fields.length;
      setSortField(fields[nextIndex]);
    }
    if (key.rightArrow) {
      const fields: SortField[] = ['type', 'amount', 'status'];
      const currentIndex = fields.indexOf(sortField);
      const nextIndex = (currentIndex + 1) % fields.length;
      setSortField(fields[nextIndex]);
    }
    if (input.toLowerCase() === 'f') {
      const filters: FilterType[] = ['all', 'active', 'inactive'];
      const currentIndex = filters.indexOf(filter);
      const nextIndex = (currentIndex + 1) % filters.length;
      setFilter(filters[nextIndex]);
    }
  });

  const handleDelete = async () => {
    if (!selectedConfig) return;
    
    try {
      // First stop the bot if it's running
      await cliSocket.stopBot(selectedConfig.botId);
      
      // Then delete the configuration
      await cliSocket.deleteConfig(
        selectedConfig.botId,
        selectedConfig.type
      );
      
      // Clear selection and refresh the list
      setSelectedConfig(null);
      setSelectedAction('view');
      fetchConfigs();
    } catch (error) {
      console.error('Failed to delete bot:', error);
      setError('Failed to delete configuration');
    }
  };

  const handleEdit = () => {
    if (!selectedConfig) return;
    setIsEditing(true);
    setEditValues(selectedConfig);
    setEditField('targetGainPercentage'); // Start with first field
  };

  const handleSaveEdit = () => {
    if (!selectedConfig) return;
    
    // Convert string values to numbers before sending
    const configToSend = {
      ...selectedConfig,
      ...editValues,
      targetGainPercentage: Number(editValues.targetGainPercentage),
      stopLossPercentage: editValues.stopLossPercentage ? Number(editValues.stopLossPercentage) : undefined,
      firstTradePrice: editValues.firstTradePrice ? Number(editValues.firstTradePrice) : undefined,
      initialInputAmount: Number(editValues.initialInputAmount)
    };
    
    // Emit the edit event
    eventBus.emit('config:edit', {
      type: selectedConfig.type,
      config: configToSend
    });

    // Reset edit state
    setIsEditing(false);
    setEditValues({});
    setEditField('');
    setSelectedConfig(null);
    setSelectedAction('view');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValues({});
    setEditField('');
    setSelectedAction('view');
  };

  const renderBotInfo = (bot: BotWithType) => {
    const inputTokenName = tokenNames.get(bot.initialInputToken) || bot.initialInputToken;
    const outputTokenName = bot.initialOutputToken ? (tokenNames.get(bot.initialOutputToken) || bot.initialOutputToken) : '';
    const initialInputAmount = bot.initialInputAmount || 0;
    const firstTradePrice = bot.firstTradePrice || 0;
    const shortId = shortenUUID(bot.botId);

    return (
      <Box flexDirection="column">
        <Text>ID: {shortId}</Text>
        <Text>Type: {bot.type === 'regular' ? 'Regular Bot' : 'Multi Bot'}</Text>
        <Text>Status: {bot.status}</Text>
        <Text>Input Token: {inputTokenName}</Text>
        {bot.type === 'regular' && <Text>Output Token: {outputTokenName}</Text>}
        {bot.type === 'regular' &&   <Text>Initial Input Amount: {initialInputAmount}</Text>}
        {bot.type === 'regular' && <Text>First Trade Price: {firstTradePrice}</Text>}
        <Text>
         Target Gain (%): {bot.targetGainPercentage !== undefined
            ? BigInt(bot.targetGainPercentage).toString()
            : 'N/A'}
        </Text>
        {bot.type === 'multi' && bot.targetAmounts && (
<Box flexDirection="column">
            <Text>Target Amounts:</Text>
            {bot.targetAmounts.map((target, index) => (
              <Text key={index}>
                - {tokenNames.get(target.tokenAddress) || target.tokenAddress}: {target.amount}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    );
  };

  if (loading) {
    return (
      <Box>
        <Text>Loading configurations...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  if (isEditing && selectedConfig) {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Edit Configuration</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>Bot ID: {shortenUUID(selectedConfig.botId)}</Text>
          <Text>Type: {selectedConfig.type}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color={editField === 'initialInputToken' ? 'cyan' : 'white'}>
              {editField === 'initialInputToken' ? '> ' : '  '}Input Token: {isEditingToken && editField === 'initialInputToken' ? tokenInput : (editValues.initialInputToken || selectedConfig.initialInputToken)}
            </Text>
            {selectedConfig.type === 'regular' && (
              <Text color={editField === 'initialOutputToken' ? 'cyan' : 'white'}>
                {editField === 'initialOutputToken' ? '> ' : '  '}Output Token: {isEditingToken && editField === 'initialOutputToken' ? tokenInput : (editValues.initialOutputToken || selectedConfig.initialOutputToken)}
              </Text>
            )}
            <Text color={editField === 'targetGainPercentage' ? 'cyan' : 'white'}>
              {editField === 'targetGainPercentage' ? '> ' : '  '}Target Gain (%): {editValues.targetGainPercentage || selectedConfig.targetGainPercentage}
            </Text>
            <Text color={editField === 'stopLossPercentage' ? 'cyan' : 'white'}>
              {editField === 'stopLossPercentage' ? '> ' : '  '}Stop Loss (%): {editValues.stopLossPercentage || selectedConfig.stopLossPercentage || 'N/A'}
            </Text>
            {selectedConfig.type === 'regular' && (
              <Text color={editField === 'firstTradePrice' ? 'cyan' : 'white'}>
                {editField === 'firstTradePrice' ? '> ' : '  '}First Trade Price: {editValues.firstTradePrice || selectedConfig.firstTradePrice || 'N/A'}
              </Text>
            )}
            <Text color={editField === 'initialInputAmount' ? 'cyan' : 'white'}>
              {editField === 'initialInputAmount' ? '> ' : '  '}Initial Input Amount: {editValues.initialInputAmount || selectedConfig.initialInputAmount}
            </Text>
            {selectedConfig.type === 'multi' && (
              <Box flexDirection="column" marginTop={1}>
                <Text bold>Target Amounts:</Text>
                {(editValues.targetAmounts || selectedConfig.targetAmounts || []).map((target, index) => (
                  <Box key={index} marginLeft={2}>
                    <Text>
                      {editingTargetIndex === index ? '> ' : '  '}
                      Token: {isEditingToken && editingTargetIndex === index ? tokenInput : target.tokenAddress}
                      {' - '}
                      Amount: {editingTargetIndex === index ? targetAmountInput : target.amount}
                    </Text>
                  </Box>
                ))}
                <Text color={editField === 'addTarget' ? 'cyan' : 'white'}>
                  {editField === 'addTarget' ? '> ' : '  '}Add New Target
                </Text>
              </Box>
            )}
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="blue">
            ↑↓ to select field, type to edit, Enter to confirm, Escape to cancel
            {isEditingToken ? '\nType token name or address, Enter to confirm' : ''}
            {editingTargetIndex !== null ? '\nType amount, Enter to confirm' : ''}
          </Text>
        </Box>
      </Box>
    );
  }

  if (selectedConfig) {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Configuration Details</Text>
        <Box marginTop={1} flexDirection="column">
          {renderBotInfo(selectedConfig)}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Actions:</Text>
          <Box marginLeft={1} flexDirection="column">
            <Text color={selectedAction === 'delete' ? 'cyan' : 'white'}>
              {selectedAction === 'delete' ? '> ' : '  '}Delete Configuration
            </Text>
            <Text color={selectedAction === 'edit' ? 'cyan' : 'white'}>
              {selectedAction === 'edit' ? '> ' : '  '}Edit Configuration
            </Text>
            <Text color={selectedAction === 'view' ? 'cyan' : 'white'}>
              {selectedAction === 'view' ? '> ' : '  '}Back to List
            </Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color="blue">
            ↑↓ to select action, Enter to confirm, Escape to go back
          </Text>
        </Box>
      </Box>
    );
  }

  
  return (
    <Box flexDirection="column">
      <Text bold>All Configurations</Text>
      <Text>Sort by: {sortField} ({sortDirection}) - Filter: {filter}</Text>
      <Box marginTop={1} flexDirection="column">
        {filteredBots.length === 0 ? (
          <Text>No configurations found</Text>
        ) : (
          <Box flexDirection="column">
            {filteredBots.map((bot, index) => (
              <Box key={`${bot.type}-${bot.botId}`} marginLeft={2}>
                <Text
                  color={selectedIndex === index ? 'cyan' : 'white'}
                >
                  {selectedIndex === index ? '> ' : '  '}
                  {bot.type} - {tokenNames.get(bot.initialInputToken) || bot.initialInputToken} {bot.amount}
                  {bot.status === 'running' ? ' (Running)' : ' (Stopped)'}
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color="blue">
          ↑↓ to select, Enter to view details
          {'\n'}
          ←→ to change sort, 'f' to change filter, Escape to go back
        </Text>
      </Box>
    </Box>
  );
};

export default ConfigList; 