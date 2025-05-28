import React, {  useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { Socket } from 'socket.io-client';
import { BotManager } from '../../core/types.js';
import { shortenUUID } from '../../utils/helper.js';
import { ConfigListProps, SortField, SortDirection, FilterType, BotWithType, ConfigListState } from '../../core/types.js';
import { getSingleTokenData } from '../../services/tokenDataService.js';
import { useAppContext } from '../context/AppContext.js';
import { ConfigData } from '../../services/eventBus.js';
import logger from '../../utils/logger.js';
import { useApp } from 'ink';

export const ConfigList: React.FC<ConfigListProps> = ({ socket, botManager, onBack }) => {
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
  const [tokenNames, setTokenNames] = React.useState<Map<string, string>>(new Map());
  const [loading, setLoading] = React.useState(true);

  const fetchConfigs = useCallback(() => {
    try {
      logger.info('Fetching configs...');
      eventBus.emit('config:get', {});
    } catch (error) {
      logger.error('Error fetching configs:', error);
      setError('Failed to fetch configurations');
      setLoading(false);
    }
  }, [eventBus]);

  React.useEffect(() => {
    const handleConfigUpdate = (data: ConfigData) => {
      try {
        logger.info('Received config update:', data);
        setConfigs(data);
        setError(null);
        setLoading(false);
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

    // Set up event bus listeners
    eventBus.on('configUpdate', handleConfigUpdate);
    eventBus.on('error', handleError);

    // Initial fetch
    fetchConfigs();

    // Cleanup function
    return () => {
      eventBus.off('configUpdate', handleConfigUpdate);
      eventBus.off('error', handleError);
    };
  }, [eventBus, fetchConfigs]);

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
      targetGainPercentage: BigInt(bot.targetGainPercentage),
      stopLossPercentage: bot.stopLossPercentage ? BigInt(bot.stopLossPercentage) : undefined
    }));
    const multi = configs.multiBots.map(bot => ({
      ...bot,
      type: 'multi' as const,
      amount: bot.initialInputAmount,
      targetGainPercentage: BigInt(bot.targetGainPercentage),
      stopLossPercentage: bot.stopLossPercentage ? BigInt(bot.stopLossPercentage) : undefined,
      targetAmounts: bot.targetAmounts.map(target => ({
        ...target,
        tokenName: tokenNames.get(target.tokenAddress) || target.tokenAddress
      }))
    }));
    return [...regular, ...multi] as BotWithType[];
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
      if (selectedConfig) {
        setSelectedConfig(null);
        setSelectedAction('view');
      } else {
        onBack();
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
    
    // Convert BigInt values to strings before sending
    const configToSend = {
      ...selectedConfig,
      targetGainPercentage: selectedConfig.targetGainPercentage?.toString(),
      stopLossPercentage: selectedConfig.stopLossPercentage?.toString(),
      firstTradePrice: selectedConfig.firstTradePrice?.toString()
    };
    
    // Emit the edit event first
    eventBus.emit('config:edit', {
      type: selectedConfig.type,
      config: configToSend
    });

    // Then go back to main menu
    exit();
  };

  const handleViewConfig = (config: BotWithType) => {
    setSelectedConfig(config);
    setSelectedAction('view');
  };

  const handleDeleteConfig = (config: BotWithType) => {
    setSelectedConfig(config);
    setSelectedAction('delete');
  };

  const renderBotInfo = (bot: BotWithType) => {
    const inputTokenName = tokenNames.get(bot.initialInputToken) || bot.initialInputToken;
    const outputTokenName = bot.initialOutputToken ? (tokenNames.get(bot.initialOutputToken) || bot.initialOutputToken) : '';
    const shortId = shortenUUID(bot.botId);

    return (
      <Box flexDirection="column">
        <Text>ID: {shortId}</Text>
        <Text>Type: {bot.type === 'regular' ? 'Regular Bot' : 'Multi Bot'}</Text>
        <Text>Status: {bot.status}</Text>
        <Text>Input Token: {inputTokenName}</Text>
        {bot.type === 'regular' && <Text>Output Token: {outputTokenName}</Text>}
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

  const activeBots = filteredBots.filter(bot => bot.status === 'running');
  const inactiveBots = filteredBots.filter(bot => bot.status === 'stopped');

  return (
    <Box flexDirection="column">
      <Text bold>All Configurations</Text>
      <Text>Sort by: {sortField} ({sortDirection}) - Filter: {filter}</Text>
      <Box marginTop={1} flexDirection="column">
        {activeBots.length > 0 && (
          <Box flexDirection="column">
            <Text bold color="green">Active Bots ({activeBots.length})</Text>
            {activeBots.map((bot, index) => (
              <Box key={`active-${bot.botId}`} marginLeft={2}>
                <Text
                  color={selectedIndex === index ? 'cyan' : 'green'}
                >
                  {bot.type} #{shortenUUID(bot.botId)}
                </Text>
              </Box>
            ))}
          </Box>
        )}
        {inactiveBots.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">
              Inactive Bots ({inactiveBots.length})
            </Text>
            {inactiveBots.map((bot, index) => (
              <Box key={`inactive-${bot.botId}`} marginLeft={2}>
                <Text
                  color={selectedIndex === activeBots.length + index ? 'cyan' : 'yellow'}
                >
                  {bot.type} #{shortenUUID(bot.botId)}
                </Text>
              </Box>
            ))}
          </Box>
        )}
        {activeBots.length === 0 && inactiveBots.length === 0 && (
          <Text>No configurations found</Text>
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