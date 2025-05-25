import React from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfigService } from '../../services/configService.js';
import { Config, MultiConfig } from '@prisma/client';
import { Socket } from 'socket.io-client';
import { getTokenName } from '../../utils/helper.js';

interface ConfigListProps {
  onBack: () => void;
  botManager: any;
  socket: Socket;
}

type SortField = 'type' | 'amount' | 'status';
type SortDirection = 'asc' | 'desc';
type FilterType = 'all' | 'active' | 'inactive';

type BotWithType = (Config | MultiConfig) & {
  type: 'Regular Bot' | 'Multi Bot';
  amount: number;
  status: string;
  targetAmounts?: Array<{
    mint: string;
    amount: number;
  }>;
};

const ConfigList: React.FC<ConfigListProps> = ({ onBack, botManager, socket }) => {
  const [configs, setConfigs] = React.useState<{
    regularBots: Array<Config & { status: string }>;
    multiBots: Array<MultiConfig & { status: string; targetAmounts: any[] }>;
  }>({ regularBots: [], multiBots: [] });
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [sortField, setSortField] = React.useState<SortField>('type');
  const [sortDirection, setSortDirection] = React.useState<SortDirection>('asc');
  const [filter, setFilter] = React.useState<FilterType>('all');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = React.useState<BotWithType | null>(null);
  const [selectedAction, setSelectedAction] = React.useState<'view' | 'delete'>('view');
  const [tokenNames, setTokenNames] = React.useState<Map<string, string>>(new Map());

  const fetchConfigs = React.useCallback(async () => {
    try {
      setLoading(true);
      const configService = new ConfigService();
      const allConfigs = await configService.getAllConfigs();
      setConfigs(allConfigs);
      setError(null);
    } catch (err) {
      setError('Failed to load configurations');
      console.error('Error loading configs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTokenNames = React.useCallback(async (mints: string[]) => {
    const names = new Map<string, string>();
    for (const mint of mints) {
      try {
        // Only try to get token name if it looks like a valid address
        if (mint.length >= 32) {
          const name = await getTokenName(mint);
          names.set(mint, name);
        } else {
          // If it's not a valid address, just use the mint as is
          names.set(mint, mint);
        }
      } catch (error) {
        // If we can't get the name, just use the mint address
        names.set(mint, mint);
      }
    }
    setTokenNames(names);
  }, []);

  React.useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

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
          bot.targetAmounts.forEach(target => {
            if (target.mint) allMints.add(target.mint);
          });
        }
      });
      fetchTokenNames(Array.from(allMints));
    }
  }, [configs, fetchTokenNames]);

  // Add effect to fetch token names when a config is selected
  React.useEffect(() => {
    if (selectedConfig) {
      const mints = new Set<string>();
      if (selectedConfig.initialInputToken) mints.add(selectedConfig.initialInputToken);
      if (selectedConfig.type === 'Regular Bot' && 'initialOutputToken' in selectedConfig) {
        mints.add(selectedConfig.initialOutputToken);
      }
      if (selectedConfig.type === 'Multi Bot' && 'targetAmounts' in selectedConfig) {
        (selectedConfig as MultiConfig & { targetAmounts: Array<{ mint: string; amount: number }> }).targetAmounts.forEach(target => {
          if (target.mint) mints.add(target.mint);
        });
      }
      fetchTokenNames(Array.from(mints));
    }
  }, [selectedConfig, fetchTokenNames]);

  const allBots = React.useMemo(() => {
    const regular = configs.regularBots.map(bot => ({
      ...bot,
      type: 'Regular Bot' as const,
      amount: bot.initialInputAmount
    }));
    const multi = configs.multiBots.map(bot => ({
      ...bot,
      type: 'Multi Bot' as const,
      amount: bot.initialInputAmount,
      targetAmounts: bot.targetAmounts.map(target => ({
        ...target,
        tokenName: tokenNames.get(target.mint) || target.mint
        
      }))
    }));
    return [...regular, ...multi] as BotWithType[];
  }, [configs, tokenNames]);

  const filteredBots = React.useMemo(() => {
    let filtered = allBots;
    
    // Apply filter
    if (filter === 'active') {
      filtered = filtered.filter(bot => bot.status === 'active');
    } else if (filter === 'inactive') {
      filtered = filtered.filter(bot => bot.status === 'inactive');
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
        const actions: Array<'view' | 'delete'> = ['view', 'delete'];
        const currentIndex = actions.indexOf(selectedAction);
        const nextIndex = (currentIndex - 1 + actions.length) % actions.length;
        setSelectedAction(actions[nextIndex]);
      }
      if (key.downArrow) {
        const actions: Array<'view' | 'delete'> = ['view', 'delete'];
        const currentIndex = actions.indexOf(selectedAction);
        const nextIndex = (currentIndex + 1) % actions.length;
        setSelectedAction(actions[nextIndex]);
      }
      if (key.return) {
        if (selectedAction === 'delete') {
          handleDelete();
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
      if (selectedConfig.type === 'Regular Bot') {
        await botManager.deleteBot(selectedConfig.botId);
      } else {
        await botManager.deleteMultiBot(selectedConfig.botId);
      }
      setSelectedConfig(null);
      fetchConfigs();
    } catch (error) {
      console.error('Failed to delete bot:', error);
    }
  };

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text>Loading configurations...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  if (selectedConfig) {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Configuration Details</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>Type: {selectedConfig.type}</Text>
          <Text>Bot ID: {selectedConfig.botId.toString()}</Text>
          <Text>Status: {selectedConfig.status}</Text>
          <Text>Initial Amount: {selectedConfig.amount}</Text>
          <Text>Input Token: {tokenNames.get(selectedConfig.initialInputToken) || selectedConfig.initialInputToken}</Text>
          {selectedConfig.type === 'Regular Bot' && (
            <Text>Output Token: {tokenNames.get((selectedConfig as Config).initialOutputToken) || (selectedConfig as Config).initialOutputToken}</Text>
          )}
          {selectedConfig.type === 'Multi Bot' && 'targetAmounts' in selectedConfig && (
            <>
              <Text>Target Amounts:</Text>
              {(selectedConfig as MultiConfig & { targetAmounts: Array<{ mint: string; amount: number }> }).targetAmounts.map((target, index) => (
                <Box key={`${target.mint}-${index}`} marginLeft={2}>
                  <Text>
                    {target.amount} {tokenNames.get(target.mint) || target.mint}
                  </Text>
                </Box>
              ))}
            </>
          )}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Actions:</Text>
          <Box marginLeft={1} flexDirection="column">
            <Text color={selectedAction === 'delete' ? 'cyan' : 'white'}>
              {selectedAction === 'delete' ? '> ' : '  '}Delete Configuration
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

  const activeBots = filteredBots.filter(bot => bot.status === 'active');
  const inactiveBots = filteredBots.filter(bot => bot.status === 'inactive');

  return (
    <Box flexDirection="column">
      <Text bold>All Configurations</Text>
      <Text>Sort by: {sortField} ({sortDirection}) - Filter: {filter}</Text>
      <Box marginTop={1} flexDirection="column">
        {activeBots.length > 0 && (
          <>
            <Text bold color="green">Active Bots ({activeBots.length})</Text>
            {activeBots.map((bot, index) => (
              <Box key={`active-${bot.botId.toString()}`}>
                <Text
                  color={selectedIndex === index ? 'cyan' : 'green'}
                >
                  {bot.type} #{bot.botId.toString()}
                </Text>
              </Box>
            ))}
          </>
        )}
        {inactiveBots.length > 0 && (
          <Box marginTop={1}>
            <Text bold color="yellow">
              Inactive Bots ({inactiveBots.length})
            </Text>
            {inactiveBots.map((bot, index) => (
              <Box key={`inactive-${bot.botId.toString()}`}>
                <Text
                  color={selectedIndex === activeBots.length + index ? 'cyan' : 'yellow'}
                >
                  {bot.type} #{bot.botId.toString()}
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