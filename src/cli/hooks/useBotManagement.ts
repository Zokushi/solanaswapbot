import React from 'react';
import { DefaultBotManager } from '../../core/botManager.js';
import { CLISocket } from '../services/CLISocket.js';
import { getTokenName } from '../../utils/helper.js';
import { createLogger } from '../../utils/logger.js';
import { handleError } from '../../utils/errorHandler.js';
import { ErrorCodes } from '../../utils/errors.js';

const logger = createLogger('useBotManagement');

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
    logger.debug('Checking active bots', { method: 'checkActiveBots' });
    try {
      const allBots = await botManager.getAllBots();
      const active = {
        regularBots: allBots.regularBots
          .filter((bot) => bot.status === 'running')
          .map((bot) => ({
            ...bot,
            type: 'regular' as const,
          })),
        multiBots: allBots.multiBots
          .filter((bot) => bot.status === 'running')
          .map((bot) => ({
            ...bot,
            type: 'multi' as const,
          })),
      };
      setActiveBots(active);
      logger.debug('Active bots updated', {
        method: 'checkActiveBots',
        regularCount: active.regularBots.length,
        multiCount: active.multiBots.length,
      });
      return [...allBots.regularBots, ...allBots.multiBots].filter((bot) => bot.status === 'running');
    } catch (error) {
      handleError(error, 'Failed to check active bots', ErrorCodes.API_ERROR.code, { method: 'checkActiveBots' });
    }
  }, [botManager]);

  const handleStopAllBots = React.useCallback(async () => {
    logger.info('Stopping all bots', { method: 'handleStopAllBots' });
    try {
      const activeBots = await checkActiveBots();
      if (activeBots.length === 0) {
        setStoppingProgress({
          current: 0,
          total: 0,
          status: 'success',
          message: 'No active bots to stop',
        });
        logger.info('No active bots to stop', { method: 'handleStopAllBots' });
        return;
      }

      setStoppingProgress({
        current: 0,
        total: activeBots.length,
        status: 'stopping',
        message: `Stopping ${activeBots.length} active bots...`,
      });

      for (let i = 0; i < activeBots.length; i++) {
        const bot = activeBots[i];
        logger.debug('Stopping bot', { method: 'handleStopAllBots', botId: bot.botId });
        await botManager.stopBot(bot.botId);
        setStoppingProgress((prev) => ({
          ...prev,
          current: i + 1,
          message: `Stopping bot ${i + 1} of ${activeBots.length}...`,
        }));
      }

      setStoppingProgress((prev) => ({
        ...prev,
        status: 'success',
        message: `Successfully stopped ${activeBots.length} bots`,
      }));
      logger.info('All bots stopped successfully', { method: 'handleStopAllBots', count: activeBots.length });
    } catch (error) {
      handleError(error, 'Failed to stop all bots', ErrorCodes.API_ERROR.code, { method: 'handleStopAllBots' });
    }
  }, [botManager, checkActiveBots]);

  const showTransactionList = React.useCallback((botId: string) => {
    logger.info('Showing transaction list', { method: 'showTransactionList', botId });
  }, []);

  const handleStartAllBots = React.useCallback(async () => {
    logger.info('Starting all bots', { method: 'handleStartAllBots' });
    try {
      const { regularBots, multiBots } = await botManager.getAllBots();
      const inactiveBots = [...regularBots, ...multiBots].filter((bot) => bot.status === 'stopped');

      if (inactiveBots.length === 0) {
        setStartingProgress({
          current: regularBots.length + multiBots.length,
          total: regularBots.length + multiBots.length,
          status: 'success',
          message: 'No inactive bots to start',
        });
        logger.info('No inactive bots to start', { method: 'handleStartAllBots' });
        return;
      }

      setStartingProgress({
        current: 0,
        total: inactiveBots.length,
        status: 'starting',
        message: `Starting ${inactiveBots.length} inactive bots...`,
      });

      for (let i = 0; i < inactiveBots.length; i++) {
        const bot = inactiveBots[i];
        logger.debug('Starting bot', { method: 'handleStartAllBots', botId: bot.botId });
        try {
          if ('targetAmounts' in bot) {
            const targetAmounts: Record<string, number> = {};
            if (Array.isArray(bot.targetAmounts)) {
              for (const target of bot.targetAmounts) {
                const tokenName = await getTokenName(target.tokenAddress);
                targetAmounts[tokenName] = Number(target.amount);
              }
            } else if (typeof bot.targetAmounts === 'object') {
              Object.assign(targetAmounts, bot.targetAmounts);
            }

            await botManager.startMultiBot(
              {
                botId: bot.botId,
                initialInputToken: bot.initialInputToken,
                initialInputAmount: Number(bot.initialInputAmount),
                targetGainPercentage: Number(bot.targetGainPercentage),
                stopLossPercentage: bot.stopLossPercentage ? Number(bot.stopLossPercentage) : undefined,
                checkInterval: bot.checkInterval ? Number(bot.checkInterval) : undefined,
                targetAmounts,
              },
              socket.getSocket(),
            );
          } else {
            await botManager.startBot(
              {
                botId: bot.botId,
                initialInputToken: bot.initialInputToken,
                initialInputAmount: Number(bot.initialInputAmount),
                firstTradePrice: bot.firstTradePrice ? Number(bot.firstTradePrice) : undefined,
                targetGainPercentage: Number(bot.targetGainPercentage),
                stopLossPercentage: bot.stopLossPercentage ? Number(bot.stopLossPercentage) : undefined,
                initialOutputToken: bot.initialOutputToken,
              },
              socket.getSocket(),
            );
          }

          setStartingProgress((prev) => ({
            ...prev,
            current: i + 1,
            message: `Starting bot ${i + 1} of ${inactiveBots.length}...`,
          }));
        } catch (error) {
          handleError(error, `Failed to start bot ${bot.botId}`, ErrorCodes.API_ERROR.code, {
            method: 'handleStartAllBots',
            botId: bot.botId,
          });
        }
      }

      setStartingProgress((prev) => ({
        ...prev,
        status: 'success',
        message: `Successfully started ${inactiveBots.length} bots`,
      }));
      logger.info('All bots started successfully', { method: 'handleStartAllBots', count: inactiveBots.length });
    } catch (error) {
      handleError(error, 'Failed to start all bots', ErrorCodes.API_ERROR.code, { method: 'handleStartAllBots' });
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
    setStartingProgress,
  };
};