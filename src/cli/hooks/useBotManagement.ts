import React from 'react';
import { DefaultBotManager } from '../../core/botManager.js';
import { CLISocket } from '../services/CLISocket.js';
import logger from '../../utils/logger.js';
import { getTokenName } from '../../utils/helper.js';

export const useBotManagement = (botManager: DefaultBotManager, socket: CLISocket) => {
  const [activeBots, setActiveBots] = React.useState<{
    regularBots: Array<{ botId: string; status: string }>;
    multiBots: Array<{ botId: string; status: string }>;
  }>({ regularBots: [], multiBots: [] });

  const [stoppingProgress, setStoppingProgress] = React.useState<{
    current: number;
    total: number;
    status: 'idle' | 'stopping' | 'success' | 'error';
    message: string;
  }>({ current: 0, total: 0, status: 'idle', message: '' });

  const [startingProgress, setStartingProgress] = React.useState<{
    current: number;
    total: number;
    status: 'idle' | 'starting' | 'success' | 'error';
    message: string;
  }>({ current: 0, total: 0, status: 'idle', message: '' });

  const checkActiveBots = React.useCallback(async () => {
    try {
      const allBots = await botManager.getAllBots();
      setActiveBots({
        regularBots: allBots.regularBots.filter(bot => bot.status === 'running').map(bot => ({
          ...bot,
          type: 'regular' as const
        })),
        multiBots: allBots.multiBots.filter(bot => bot.status === 'running').map(bot => ({
          ...bot,
          type: 'multi' as const
        }))
      });
      return [...allBots.regularBots, ...allBots.multiBots].filter(bot => bot.status === 'running');
    } catch (error) {
      console.error('Failed to check active bots:', error);
      return [];
    }
  }, [botManager]);

  const handleStopAllBots = React.useCallback(async () => {
    try {
      const activeBots = await checkActiveBots();
      if (activeBots.length === 0) {
        setStoppingProgress({
          current: 0,
          total: 0,
          status: 'success',
          message: 'No active bots to stop'
        });
        return;
      }

      setStoppingProgress({
        current: 0,
        total: activeBots.length,
        status: 'stopping',
        message: `Stopping ${activeBots.length} active bots...`
      });

      for (let i = 0; i < activeBots.length; i++) {
        const bot = activeBots[i];
        await botManager.stopBot(bot.botId);
        setStoppingProgress(prev => ({
          ...prev,
          current: i + 1,
          message: `Stopping bot ${i + 1} of ${activeBots.length}...`
        }));
      }

      setStoppingProgress(prev => ({
        ...prev,
        status: 'success',
        message: `Successfully stopped ${activeBots.length} bots`
      }));
    } catch (error) {
      setStoppingProgress({
        current: 0,
        total: 0,
        status: 'error',
        message: `Failed to stop all bots: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }, [botManager, checkActiveBots]);

  const handleStartAllBots = React.useCallback(async () => {
    try {
      const { regularBots, multiBots } = await botManager.getAllBots();
      const inactiveBots = [...regularBots, ...multiBots].filter(bot => bot.status === 'stopped');

      if (inactiveBots.length === 0) {
        setStartingProgress({
          current: regularBots.length + multiBots.length,
          total: regularBots.length + multiBots.length,
          status: 'success',
          message: 'No inactive bots to start'
        });
        return;
      }

      setStartingProgress({
        current: 0,
        total: inactiveBots.length,
        status: 'starting',
        message: `Starting ${inactiveBots.length} inactive bots...`
      });

      for (let i = 0; i < inactiveBots.length; i++) {
        const bot = inactiveBots[i];
        try {
          if ('targetAmounts' in bot) {
            // Handle multi bot
            const targetAmounts: Record<string, number> = {};
            if (Array.isArray(bot.targetAmounts)) {
              for (const target of bot.targetAmounts) {
                // Convert token address to name
                const tokenName = await getTokenName(target.tokenAddress);
                targetAmounts[tokenName] = Number(target.amount);
              }
            } else if (typeof bot.targetAmounts === 'object') {
              Object.assign(targetAmounts, bot.targetAmounts);
            }

            await botManager.startMultiBot({
              botId: bot.botId,
              initialInputToken: bot.initialInputToken,
              initialInputAmount: Number(bot.initialInputAmount),
              targetGainPercentage: Number(bot.targetGainPercentage),
              stopLossPercentage: bot.stopLossPercentage ? Number(bot.stopLossPercentage) : undefined,
              checkInterval: bot.checkInterval ? Number(bot.checkInterval) : undefined,
              targetAmounts
            }, socket.getSocket());
          } else {
            // Handle regular bot
            await botManager.startBot({
              botId: bot.botId,
              initialInputToken: bot.initialInputToken,
              initialInputAmount: Number(bot.initialInputAmount),
              firstTradePrice: bot.firstTradePrice ? Number(bot.firstTradePrice) : undefined,
              targetGainPercentage: Number(bot.targetGainPercentage),
              stopLossPercentage: bot.stopLossPercentage ? Number(bot.stopLossPercentage) : undefined,
              initialOutputToken: bot.initialOutputToken
            }, socket.getSocket());
          }

          setStartingProgress(prev => ({
            ...prev,
            current: i + 1,
            message: `Starting bot ${i + 1} of ${inactiveBots.length}...`
          }));
        } catch (error) {
          logger.error(`Failed to start bot ${bot.botId}:`, error);
          setStartingProgress(prev => ({
            ...prev,
            status: 'error',
            message: `Failed to start bot ${bot.botId}: ${error instanceof Error ? error.message : String(error)}`
          }));
          return;
        }
      }

      setStartingProgress(prev => ({
        ...prev,
        status: 'success',
        message: `Successfully started ${inactiveBots.length} bots`
      }));
    } catch (error) {
      logger.error('Failed to start all bots:', error);
      setStartingProgress({
        current: 0,
        total: 0,
        status: 'error',
        message: `Failed to start all bots: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }, [botManager, socket]);

  return {
    activeBots,
    stoppingProgress,
    startingProgress,
    checkActiveBots,
    handleStopAllBots,
    handleStartAllBots,
    setStoppingProgress,
    setStartingProgress
  };
}; 