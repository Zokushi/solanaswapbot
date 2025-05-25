// cli/components/Dashboard.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { ConfigService } from '../../services/configService.js';
import { getTradeLogs } from '../../services/getTradeLogs.js';
import { Socket } from 'socket.io-client';

interface DashboardProps {
  socket: Socket;
  height?: number; // Number of rows for the dashboard
  onRefresh: () => void; // Callback for manual refresh
}

interface BotMetrics {
  botId: string;
  targetMint?: string; // Optional for regular bots
  difference: number;
  currentPrice: number;
  ratio: number;
  inputToken: string;
  outputToken: string;
  trades: number;
  type: 'regular' | 'multi';
}

const Dashboard: React.FC<DashboardProps> = ({ socket, height = 20 }) => {
  const [activeBotIds, setActiveBotIds] = React.useState<Set<string>>(new Set());
  const [metrics, setMetrics] = React.useState<Map<string, Map<string, BotMetrics>>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch active bot IDs and trade logs
  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const configService = new ConfigService();
      const allConfigs = await configService.getAllConfigs();
      
      // Get active bot IDs
      const activeIds = new Set<string>();
      allConfigs.regularBots.forEach(bot => {
        if (bot.status === 'active') {
          activeIds.add(bot.botId.toString());
        }
      });
      allConfigs.multiBots.forEach(bot => {
        if (bot.status === 'active') {
          activeIds.add(bot.botId.toString());
        }
      });
      setActiveBotIds(activeIds);


      setError(null);
    } catch (err) {
      setError('Failed to fetch dashboard data');
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle bot:difference events
  React.useEffect(() => {
    const handleDifference = (data: any) => {
      setMetrics(prev => {
        const newMetrics = new Map(prev);
        const botMetrics = newMetrics.get(data.botId) || new Map();
        
        // Check if this is a multi-bot by looking for targetAmounts in the data
        const isMultiBot = 'targetAmounts' in data;
        const key = isMultiBot ? data.targetMint : data.outputMint;
        
        // For multi-bots, ensure we have the correct type and target mint
        if (isMultiBot && !data.targetMint) {
          console.warn('Multi-bot data missing targetMint:', data);
          return prev;
        }

        // Get token names for display
        const inputToken = data.inputMint || 'N/A';
        const outputToken = data.outputMint || 'N/A';

        botMetrics.set(key, {
          botId: data.botId,
          targetMint: isMultiBot ? data.targetMint : undefined,
          difference: Number(data.difference) || 0,
          currentPrice: Number(data.currentPrice) || 0,
          ratio: Number(data.ratio) || 0,
          inputToken,
          outputToken,
          trades: Number(data.trades) || 0,
          type: isMultiBot ? 'multi' : 'regular'
        });
        
        newMetrics.set(data.botId, botMetrics);
        return newMetrics;
      });
    };

    socket.on('bot:difference', handleDifference);
    return () => {
      socket.off('bot:difference', handleDifference);
    };
  }, [socket]);

  if (loading) {
    return (
      <Box>
        <Text>Loading dashboard data...</Text>
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

  // Calculate total active bots
  const totalActiveBots = Array.from(metrics.keys()).length;

  return (
    <Box flexDirection="column" height={height}>
      <Text bold>Active Bots Dashboard</Text>
      <Box marginTop={1}>
        <Text>
          {'Bot ID'.padEnd(15)} {'Diff %'.padEnd(10)} {'Current'.padEnd(10)} {'Input'.padEnd(12)} {'Output'.padEnd(18)} {'Trades'.padEnd(8)}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {Array.from(metrics.entries()).map(([botId, targetMetrics]) => (
          <Box key={botId} flexDirection="column">
            {Array.from(targetMetrics.values()).map((metric, index) => (
              <Text key={`${botId}-${metric.targetMint || metric.outputToken || index}`}>
                {botId.padEnd(15)} 
                {metric.difference.toFixed(2).padEnd(10)} 
                {metric.currentPrice.toFixed(2).padEnd(12)} 
                {(metric.inputToken || 'N/A').padEnd(15)} 
                {(metric.outputToken || 'N/A').padEnd(21)} 
                {metric.trades.toString().padEnd(8)}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default Dashboard;