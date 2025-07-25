import React from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { useBotManagement } from './hooks/useBotManagement.js';
import RegularBotForm from './forms/RegularBotForm.js';
import { MultiBotForm } from './forms/MultiBotForm.js';
import ConfigList from './components/ConfigList.js';
import { AppProvider, useAppContext } from './context/AppContext.js';
import { EnvVarInput } from './components/EnvVarInput.js';
import TransactionList from './components/TransactionList.js';
import { MainMenu } from './components/MainMenu.js';
import Dashboard from './components/Dashboard.js';
import { createLogger } from '../utils/logger.js';
import { handleError } from '../utils/errorHandler.js';
import { ErrorCodes } from '../utils/errors.js';
import { DefaultBotManager } from '../core/botManager.js';

const logger = createLogger('CLIApp');
const CHECK_BOTS_INTERVAL = 30000; // 30 seconds

const TRADE_BOT_ASCII = `
████████╗██████╗  █████╗ ██████╗ ███████╗    ██████╗  ██████╗ ████████╗
╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██╔════╝    ██╔══██╗██╔═══██╗╚══██╔══╝
   ██║   ██████╔╝███████║██║  ██║█████╗      ██████╔╝██║   ██║   ██║   
   ██║   ██╔══██╗██╔══██║██║  ██║██╔══╝      ██╔══██╗██║   ██║   ██║   
   ██║   ██║  ██║██║  ██║██████╔╝███████╗    ██████╔╝╚██████╔╝   ██║   
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝    ╚═════╝  ╚═════╝    ╚═╝   
`;

const App = () => {
  const { exit } = useApp();
  const [selectedOption, setSelectedOption] = React.useState(0);
  const [showForm, setShowForm] = React.useState(false);
  const [formType, setFormType] = React.useState<'regular' | 'multi' | null>(null);
  const [editingConfig, setEditingConfig] = React.useState<any>(null);
  const [showConfigList, setShowConfigList] = React.useState(false);
  const [showConfirmStartAll, setShowConfirmStartAll] = React.useState(false);
  const [envVarsComplete, setEnvVarsComplete] = React.useState(false);
  const [showTransactionList, setShowTransactionList] = React.useState(false);
  const [isConnected, setIsConnected] = React.useState(false);

  const { cliSocket, botManager } = useAppContext();
  const eventBus = cliSocket.getEventBus();

  // Monitor socket connection
  React.useEffect(() => {
    const handleConnect = () => {
      logger.info('Socket connected to server', { method: 'socketConnect', socketId: cliSocket.getSocket().id });
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      logger.info('Socket disconnected from server', { method: 'socketDisconnect', socketId: cliSocket.getSocket().id });
      setIsConnected(false);
    };

    const handleConnectError = (error: Error) => {
      logger.error('Socket connection error', { method: 'socketConnectError', error: error.message });
      setIsConnected(false);
    };

    cliSocket.getSocket().on('connect', handleConnect);
    cliSocket.getSocket().on('disconnect', handleDisconnect);
    cliSocket.getSocket().on('connect_error', handleConnectError);

    if (!cliSocket.getSocket().connected) {
      cliSocket.getSocket().connect();
    }

    return () => {
      cliSocket.getSocket().off('connect', handleConnect);
      cliSocket.getSocket().off('disconnect', handleDisconnect);
      cliSocket.getSocket().off('connect_error', handleConnectError);
    };
  }, [cliSocket]);

  const {
    stoppingProgress,
    startingProgress,
    checkActiveBots,
    handleStopAllBots,
    handleStartAllBots,
    setStartingProgress,
  } = useBotManagement(botManager as DefaultBotManager, cliSocket);

  React.useEffect(() => {
    if (envVarsComplete && isConnected) {
      checkActiveBots();
      const interval = setInterval(checkActiveBots, CHECK_BOTS_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [envVarsComplete, isConnected, checkActiveBots]);

  React.useEffect(() => {
    const handleConfigEdit = (data: unknown) => {
      if (
        typeof data === 'object' &&
        data !== null &&
        'type' in data &&
        (data as any).type &&
        (['regular', 'multi'] as const).includes((data as any).type) &&
        'config' in data
      ) {
        const typedData = data as { type: 'regular' | 'multi'; config: any };
        setFormType(typedData.type);
        setEditingConfig(typedData.config);
        setShowForm(true);
        setShowConfigList(false);
      } else {
        logger.error('Received invalid configUpdate event data', { data });
      }
    };

    eventBus.on('configUpdate', handleConfigEdit);

    return () => {
      eventBus.off('configUpdate', handleConfigEdit);
    };
  }, [eventBus]);

  const cleanup = React.useCallback(async () => {
    try {
      const botIds = [...botManager.activeBots.keys()];
      for (const botId of botIds) {
        await botManager.stopBot(botId);
      }
      if (cliSocket) {
        cliSocket.disconnect();
      }
      exit();
    } catch (error) {
      handleError(error, 'Error during CLI cleanup', ErrorCodes.API_ERROR.code, { method: 'cleanup' });
    }
  }, [botManager, cliSocket, exit]);

  React.useEffect(() => {
    const handleSignal = async () => {
      await cleanup();
    };

    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.setMaxListeners(20);

    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    return () => {
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
    };
  }, [cleanup]);

  useInput((input, key) => {
    if (!envVarsComplete || showForm || showConfigList || showTransactionList) return;

    if (showConfirmStartAll) {
      if (key.return && startingProgress.status === 'idle') {
        handleStartAllBots();
      } else if (key.escape && startingProgress.status === 'idle') {
        setShowConfirmStartAll(false);
        setStartingProgress({ current: 0, total: 0, status: 'idle', message: '' });
      } else if (startingProgress.status === 'success' && input) {
        setShowConfirmStartAll(false);
        setStartingProgress({ current: 0, total: 0, status: 'idle', message: '' });
      }
      return;
    }

    if (key.upArrow) {
      setSelectedOption((prev) => (prev > 0 ? prev - 1 : options.length - 1));
    }
    if (key.downArrow) {
      setSelectedOption((prev) => (prev < options.length - 1 ? prev + 1 : 0));
    }
    if (key.return) {
      if (selectedOption === options.length - 1) {
        cleanup();
      } else if (selectedOption === 0) {
        setShowConfigList(true);
      } else if (selectedOption === 1) {
        setFormType('regular');
        setShowForm(true);
      } else if (selectedOption === 2) {
        setFormType('multi');
        setShowForm(true);
      } else if (selectedOption === 3) {
        setShowConfirmStartAll(true);
      } else if (selectedOption === 4) {
        handleStopAllBots();
      } else if (selectedOption === 5) {
        setShowTransactionList(true);
      }
    }
  });

  const options = [
    'View All Configs',
    'Add New Config',
    'Add Multi Config',
    'Start All Bots',
    'Stop All Bots',
    'View Transactions',
    'Exit',
  ];

  if (!envVarsComplete) {
    return <EnvVarInput onComplete={() => setEnvVarsComplete(true)} />;
  }

  if (showForm) {
    if (formType === 'regular') {
      return (
        <RegularBotForm
          onComplete={() => {
            setShowForm(false);
            setEditingConfig(null);
          }}
          editingConfig={editingConfig}
        />
      );
    } else if (formType === 'multi') {
      return (
        <MultiBotForm
          onComplete={() => {
            setShowForm(false);
            setEditingConfig(null);
          }}
          editingConfig={editingConfig}
        />
      );
    }
  }

  if (showTransactionList) {
    return (
      <TransactionList
        onBack={() => {
          setShowTransactionList(false);
          setSelectedOption(0);
        }}
      />
    );
  }

  if (showConfigList) {
    return (
      <ConfigList
        onBack={() => {
          setShowConfigList(false);
          setSelectedOption(0);
        }}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Text backgroundColor="black" color="cyan">
        {TRADE_BOT_ASCII}
      </Text>
      <Text bold color="white">
        Welcome to Trading Bot CLI
      </Text>

      <Box marginTop={1}>
        <Dashboard socket={cliSocket.getSocket()} height={12} onRefresh={() => checkActiveBots()} />
      </Box>

      <MainMenu selectedOption={selectedOption} options={options} />

      {showConfirmStartAll && (
        <Box marginTop={2} flexDirection="column">
          <Text bold color="green">
            Confirm Start All Bots
          </Text>
          <Box marginTop={1}>
            <Text color="yellow">Are you sure you want to start all bots?</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="cyan">Active bots: {startingProgress.total}</Text>
          </Box>
          {startingProgress.status !== 'idle' && (
            <Box marginTop={1} flexDirection="column">
              {startingProgress.status === 'starting' && (
                <Box>
                  <Text color="yellow">
                    Progress: {startingProgress.current}/{startingProgress.total}
                  </Text>
                </Box>
              )}
              <Text
                color={
                  startingProgress.status === 'success'
                    ? 'green'
                    : startingProgress.status === 'error'
                    ? 'red'
                    : 'white'
                }
              >
                {startingProgress.message}
              </Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text color="blue">
              {startingProgress.status === 'idle'
                ? 'Press Enter to confirm, Escape to cancel'
                : startingProgress.status === 'success'
                ? 'Press any key to continue'
                : 'Press Escape to cancel'}
            </Text>
          </Box>
        </Box>
      )}

      {stoppingProgress.status !== 'idle' && (
        <Box marginTop={2} flexDirection="column">
          <Text bold color="red">
            Stop All Bots Progress
          </Text>
          {stoppingProgress.status === 'stopping' && (
            <Box marginTop={1}>
              <Text color="yellow">
                Progress: {stoppingProgress.current}/{stoppingProgress.total}
              </Text>
            </Box>
          )}
          <Text
            color={
              stoppingProgress.status === 'success'
                ? 'green'
                : stoppingProgress.status === 'error'
                ? 'red'
                : 'white'
            }
          >
            {stoppingProgress.message}
          </Text>
        </Box>
      )}
    </Box>
  );
};

const cli = () => {
  render(
    <AppProvider>
      <App />
    </AppProvider>
  );
};

export default cli;