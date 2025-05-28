import React from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { DefaultBotManager } from '../core/botManager.js';
import { CLISocket } from './services/CLISocket.js';
import { useBotManagement } from './hooks/useBotManagement.js';
import RegularBotForm from './forms/RegularBotForm.js';
import { MultiBotForm } from './forms/MultiBotForm.js';
import ConfigList from './components/ConfigList.js';
import { AppProvider } from './context/AppContext.js';
import { EnvVarInput } from './components/EnvVarInput.js';
import { MainMenu } from './components/MainMenu.js';
import Dashboard from './components/Dashboard.js';
import logger from '../utils/logger.js';

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

  // Initialize services
  const botManager = React.useMemo(() => new DefaultBotManager(), []);
  const socket = React.useMemo(() => new CLISocket(botManager), [botManager]);
  const eventBus = socket.getEventBus();

  const {
    activeBots,
    stoppingProgress,
    startingProgress,
    checkActiveBots,
    handleStopAllBots,
    handleStartAllBots,
    setStoppingProgress,
    setStartingProgress
  } = useBotManagement(botManager, socket);

  const options = [
    'View All Configs',
    'Add New Config',
    'Add Multi Config',
    'Start All Bots',
    'Stop All Bots',
    'Exit'
  ];

  React.useEffect(() => {
    if (envVarsComplete) {
      checkActiveBots();
      // Set up an interval to refresh active bots every 5 seconds
      const interval = setInterval(checkActiveBots, 5000);
      return () => clearInterval(interval);
    }
  }, [envVarsComplete, checkActiveBots]);

  // Set up event listener for config edit
  React.useEffect(() => {
    const handleConfigEdit = (data: { type: 'regular' | 'multi', config: any }) => {
      setFormType(data.type);
      setEditingConfig(data.config);
      setShowForm(true);
      setShowConfigList(false);
    };

    eventBus.on('configUpdate', handleConfigEdit);

    return () => {
      eventBus.off('configUpdate', handleConfigEdit);
    };
  }, [eventBus]);

  // Add cleanup function
  const cleanup = React.useCallback(async () => {
    try {
      // Stop all active bots
      const botIds = [...botManager.activeBots.keys()];
      for (const botId of botIds) {
        await botManager.stopBot(botId);
      }
      
      // Disconnect socket
      if (socket.getSocket()) {
        socket.getSocket().disconnect();
      }
      
      // Exit the app
      exit();
    } catch (error) {
      logger.error('Error during cleanup:', error);
      process.exit(1);
    }
  }, [botManager, socket, exit]);

  // Add signal handlers
  React.useEffect(() => {
    const handleSignal = async () => {
      await cleanup();
    };

    // Remove any existing listeners first
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    
    // Set max listeners to a reasonable number
    process.setMaxListeners(20);

    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    return () => {
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
    };
  }, [cleanup]);

  useInput((input, key) => {
    if (!envVarsComplete || showForm || showConfigList) return;

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
      setSelectedOption(prev => (prev > 0 ? prev - 1 : options.length - 1));
    }
    if (key.downArrow) {
      setSelectedOption(prev => (prev < options.length - 1 ? prev + 1 : 0));
    }
    if (key.return) {
      if (selectedOption === options.length - 1) {
        cleanup();
      } else if (selectedOption === 0) { // View All Configs
        setShowConfigList(true);
      } else if (selectedOption === 1) { // Add New Config
        setFormType('regular');
        setShowForm(true);
      } else if (selectedOption === 2) { // Add Multi Config
        setFormType('multi');
        setShowForm(true);
      } else if (selectedOption === 3) { // Start All Bots
        setShowConfirmStartAll(true);
      } else if (selectedOption === 4) { // Stop All Bots
        handleStopAllBots();
      }
    }
  });

  if (!envVarsComplete) {
    return <EnvVarInput onComplete={() => setEnvVarsComplete(true)} />;
  }

  if (showForm) {
    if (formType === 'regular') {
      return (
        <AppProvider>
          <RegularBotForm 
            onComplete={() => {
              setShowForm(false);
              setEditingConfig(null);
            }}
            editingConfig={editingConfig}
          />
        </AppProvider>
      );
    } else if (formType === 'multi') {
      return (
        <AppProvider>
          <MultiBotForm 
            onComplete={() => {
              setShowForm(false);
              setEditingConfig(null);
            }}
            editingConfig={editingConfig}
          />
        </AppProvider>
      );
    }
  }

  if (showConfigList) {
    return (
      <AppProvider>
        <ConfigList 
          onBack={() => {
            setShowConfigList(false);
            setSelectedOption(0); // Reset selection to first option
          }} 
          botManager={botManager} 
          socket={socket.getSocket()} 
        />
      </AppProvider>
    );
  }

  return (
    <AppProvider>
      <Box flexDirection="column">
        <Text color="cyan">{TRADE_BOT_ASCII}</Text>
        <Text bold color="white">Welcome to Trading Bot CLI</Text>
        
        {/* Dashboard Section */}
        <Box marginTop={1}>
          <Dashboard 
            socket={socket.getSocket()} 
            height={12} 
            onRefresh={() => checkActiveBots()} 
          />
        </Box>

        {/* Menu Section */}
        <MainMenu selectedOption={selectedOption} options={options} />

        {/* Start All Bots Confirmation */}
        {showConfirmStartAll && (
          <Box marginTop={2} flexDirection="column">
            <Text bold color="green">Confirm Start All Bots</Text>
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
                <Text color={
                  startingProgress.status === 'success' ? 'green' :
                  startingProgress.status === 'error' ? 'red' : 'white'
                }>
                  {startingProgress.message}
                </Text>
              </Box>
            )}
            <Box marginTop={1}>
              <Text color="blue">
                {startingProgress.status === 'idle' ? 
                  'Press Enter to confirm, Escape to cancel' :
                  startingProgress.status === 'success' ? 
                    'Press any key to continue' :
                    'Press Escape to cancel'
                }
              </Text>
            </Box>
          </Box>
        )}

        {/* Stop All Bots Progress */}
        {stoppingProgress.status !== 'idle' && (
          <Box marginTop={2} flexDirection="column">
            <Text bold color="red">Stop All Bots Progress</Text>
            {stoppingProgress.status === 'stopping' && (
              <Box marginTop={1}>
                <Text color="yellow">
                  Progress: {stoppingProgress.current}/{stoppingProgress.total}
                </Text>
              </Box>
            )}
            <Text color={
              stoppingProgress.status === 'success' ? 'green' :
              stoppingProgress.status === 'error' ? 'red' : 'white'
            }>
              {stoppingProgress.message}
            </Text>
          </Box>
        )}
      </Box>
    </AppProvider>
  );
};

// Entry point
const cli = () => {
  render(<App />);
};

export default cli; 