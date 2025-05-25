import React from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import RegularBotForm from './forms/RegularBotForm.js';
import MultiBotForm from './forms/MultiBotForm.js';
import ConfigList from './components/ConfigList.js';
import Dashboard from './components/Dashboard.js';
import { DefaultBotManager } from '../core/botManager.js';
import { checkVariables, ENV } from '../config/index.js';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';


const TRADE_BOT_ASCII = `
████████╗██████╗  █████╗ ██████╗ ███████╗    ██████╗  ██████╗ ████████╗
╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██╔════╝    ██╔══██╗██╔═══██╗╚══██╔══╝
   ██║   ██████╔╝███████║██║  ██║█████╗      ██████╔╝██║   ██║   ██║   
   ██║   ██╔══██╗██╔══██║██║  ██║██╔══╝      ██╔══██╗██║   ██║   ██║   
   ██║   ██║  ██║██║  ██║██████╔╝███████╗    ██████╔╝╚██████╔╝   ██║   
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝    ╚═════╝  ╚═════╝    ╚═╝   
`;

// Create a proper socket implementation for the CLI
class CLISocket {
  private socket: Socket;
  private eventHandlers: Map<string, Set<(data: unknown) => void>> = new Map();

  constructor() {
    // Connect to the server using the correct port from ENV
    this.socket = io(`http://localhost:${ENV.PORT || 4000}`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    // Set up socket event handlers
    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    this.socket.on('error', (error: Error) => {
      console.error('Socket error:', error);
    });

    // Forward all events from the socket to our handlers
    this.socket.onAny((event: string, data: unknown) => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.forEach(callback => callback(data));
      }
    });
  }

  emit(event: string, data: unknown) {
    this.socket.emit(event, data);
  }

  on(event: string, callback: (data: unknown) => void) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(callback);
  }

  off(event: string, callback: (data: unknown) => void) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(callback);
    }
  }

  disconnect() {
    this.socket.disconnect();
  }

  // Add a method to get the raw socket instance
  getSocket(): Socket {
    return this.socket;
  }
}

// Initialize BotManager and socket
const socket = new CLISocket();
const botManager = new DefaultBotManager();

const EnvVarInput = ({ onComplete }: { onComplete: () => void }) => {
  const [missingVars, setMissingVars] = React.useState<string[]>([]);
  const [currentVarIndex, setCurrentVarIndex] = React.useState(0);
  const [inputValue, setInputValue] = React.useState('');

  React.useEffect(() => {
    const variableCheck = checkVariables();
    if (!variableCheck.success) {
      setMissingVars(variableCheck.missingVars);
    } else {
      onComplete();
    }
  }, [onComplete]);

  const saveEnvVariable = (key: string, value: string) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const envPath = join(__dirname, '../../.env');
    
    try {
      let envContent = '';
      try {
        envContent = readFileSync(envPath, 'utf8');
      } catch (error) {
        // File doesn't exist, that's okay
      }

      // Check if variable already exists
      const lines = envContent.split('\n');
      const existingIndex = lines.findIndex(line => line.startsWith(`${key}=`));
      
      if (existingIndex !== -1) {
        lines[existingIndex] = `${key}=${value}`;
      } else {
        lines.push(`${key}=${value}`);
      }

      writeFileSync(envPath, lines.join('\n'));
      return true;
    } catch (error) {
      console.error('Failed to save environment variable:', error);
      return false;
    }
  };

  useInput((input, key) => {
    if (key.return && inputValue.trim()) {
      const currentVar = missingVars[currentVarIndex];
      if (saveEnvVariable(currentVar, inputValue.trim())) {
        setInputValue('');
        if (currentVarIndex < missingVars.length - 1) {
          setCurrentVarIndex(prev => prev + 1);
        } else {
          // Recheck variables after all are set
          const newCheck = checkVariables();
          if (!newCheck.success) {
            setMissingVars(newCheck.missingVars);
            setCurrentVarIndex(0);
          } else {
            onComplete();
          }
        }
      }
    } else if (key.backspace) {
      setInputValue(prev => prev.slice(0, -1));
    } else if (input) {
      setInputValue(prev => prev + input);
    }
  });

  if (missingVars.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">Missing Environment Variables</Text>
      <Box marginTop={1}>
        <Text color="cyan">
          Please enter value for {missingVars[currentVarIndex]}:
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color="green">{inputValue}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="blue">Press Enter to save, Backspace to delete</Text>
      </Box>
    </Box>
  );
};

const App = () => {
  const { exit } = useApp();
  const [selectedOption, setSelectedOption] = React.useState(0);
  const [showForm, setShowForm] = React.useState(false);
  const [formType, setFormType] = React.useState<'regular' | 'multi' | null>(null);
  const [showConfigList, setShowConfigList] = React.useState(false);
  const [showConfirmStopAll, setShowConfirmStopAll] = React.useState(false);
  const [showConfirmStartAll, setShowConfirmStartAll] = React.useState(false);
  const [activeBots, setActiveBots] = React.useState<{
    regularBots: Array<{ botId: bigint; status: string }>;
    multiBots: Array<{ botId: bigint; status: string }>;
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
  const [envVarsComplete, setEnvVarsComplete] = React.useState(false);

  const handleEnvVarsComplete = React.useCallback(() => {
    setEnvVarsComplete(true);
  }, []);

  const options = [
    'View All Configs',
    'Add New Config',
    'Add Multi Config',
    'Start All Bots',
    'Stop All Bots',
    'Exit'
  ];

  // Check active bots
  const checkActiveBots = async () => {
    try {
      const allBots = await botManager.getAllBots();
      // Only update the active bots state, don't start any bots
      setActiveBots({
        regularBots: allBots.regularBots.filter(bot => bot.status === 'active').map(bot => ({
          botId: bot.botId,
          status: bot.status
        })),
        multiBots: allBots.multiBots.filter(bot => bot.status === 'active').map(bot => ({
          botId: bot.botId,
          status: bot.status
        }))
      });
      return [...allBots.regularBots, ...allBots.multiBots].filter(bot => bot.status === 'active');
    } catch (error) {
      console.error('Failed to check active bots:', error);
      return [];
    }
  };

  React.useEffect(() => {
    if (envVarsComplete) {
      checkActiveBots();
      // Set up an interval to refresh active bots every 5 seconds
      const interval = setInterval(checkActiveBots, 5000);
      return () => clearInterval(interval);
    }
  }, [envVarsComplete]);

  const handleStopAllBots = async () => {
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
        await botManager.stopBot(BigInt(bot.botId));
        setStoppingProgress(prev => ({
          ...prev,
          current: i + 1,
          message: `Stopping bot ${i + 1} of ${activeBots.length}...`
        }));
        };
      

      setStoppingProgress(prev => ({
        ...prev,
        status: 'success',
        message: `Successfully stopped ${activeBots.length} bots`
      }));

      // Reset after 3 seconds
      setTimeout(() => {
        setStoppingProgress({ current: 0, total: 0, status: 'idle', message: '' });
        setShowConfirmStopAll(false);
      }, 3000);
    } catch (error) {
      setStoppingProgress({
        current: 0,
        total: 0,
        status: 'error',
        message: `Failed to stop all bots: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  };

  const handleStartAllBots = async () => {
    try {
      const { regularBots, multiBots } = await botManager.getAllBots();
      const inactiveBots = [...regularBots, ...multiBots].filter(bot => bot.status === 'inactive');

      if (inactiveBots.length === 0) {
        setStartingProgress({
          current: 0,
          total: 0,
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
          // Convert string IDs to BigInt
          const botId = BigInt(bot.botId.toString());
          
          if ('targetAmounts' in bot) {
            // Handle multi bot
            const targetAmounts: Record<string, number> = {};
            for (const target of bot.targetAmounts) {
              targetAmounts[target.tokenAddress] = target.amount;
            }

            await botManager.startMultiBot({
              botId,
              initialInputToken: bot.initialInputToken,
              initialInputAmount: bot.initialInputAmount,
              targetGainPercentage: bot.targetGainPercentage,
              stopLossPercentage: bot.stopLossPercentage ? BigInt(bot.stopLossPercentage.toString()) : undefined,
              checkInterval: bot.checkInterval ?? undefined,
              targetAmounts
            }, socket.getSocket());
          } else {
            // Handle regular bot
            await botManager.startBot({
              botId,
              initialInputToken: bot.initialInputToken,
              initialInputAmount: bot.initialInputAmount,
              firstTradePrice: bot.firstTradePrice,
              targetGainPercentage: bot.targetGainPercentage,
              stopLossPercentage: bot.stopLossPercentage ? BigInt(bot.stopLossPercentage.toString()) : undefined,
              initialOutputToken: bot.initialOutputToken
            }, socket.getSocket());
          }

          setStartingProgress(prev => ({
            ...prev,
            current: i + 1,
            message: `Starting bot ${i + 1} of ${inactiveBots.length}...`
          }));
        } catch (error) {
          console.error(`Failed to start bot ${bot.botId}:`, error);
        }
      }

      setStartingProgress(prev => ({
        ...prev,
        status: 'success',
        message: `Successfully started ${inactiveBots.length} bots`
      }));

      // Reset after 3 seconds
      setTimeout(() => {
        setStartingProgress({ current: 0, total: 0, status: 'idle', message: '' });
        setShowConfirmStartAll(false);
      }, 3000);
    } catch (error) {
      setStartingProgress({
        current: 0,
        total: 0,
        status: 'error',
        message: `Failed to start all bots: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  };

  useInput((input, key) => {
    if (!envVarsComplete || showForm || showConfigList) return;

    if (showConfirmStopAll) {
      if (key.return && stoppingProgress.status === 'idle') {
        handleStopAllBots();
      } else if (key.escape && stoppingProgress.status === 'idle') {
        setShowConfirmStopAll(false);
        setStoppingProgress({ current: 0, total: 0, status: 'idle', message: '' });
      } else if (stoppingProgress.status === 'success' && input) {
        // Handle any key press when in success state
        setShowConfirmStopAll(false);
        setStoppingProgress({ current: 0, total: 0, status: 'idle', message: '' });
      }
      return;
    }

    if (showConfirmStartAll) {
      if (key.return && startingProgress.status === 'idle') {
        handleStartAllBots();
      } else if (key.escape && startingProgress.status === 'idle') {
        setShowConfirmStartAll(false);
        setStartingProgress({ current: 0, total: 0, status: 'idle', message: '' });
      } else if (startingProgress.status === 'success' && input) {
        // Handle any key press when in success state
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
        exit();
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
        setShowConfirmStopAll(true);
      }
    }
  });

  if (!envVarsComplete) {
    return <EnvVarInput onComplete={handleEnvVarsComplete} />;
  }

  if (showForm) {
    if (formType === 'regular') {
      return <RegularBotForm onComplete={() => setShowForm(false)} botManager={botManager} socket={socket.getSocket()} />;
    } else if (formType === 'multi') {
      return <MultiBotForm onComplete={() => setShowForm(false)} botManager={botManager} socket={socket.getSocket()} />;
    }
  }

  if (showConfigList) {
    return <ConfigList onBack={() => setShowConfigList(false)} botManager={botManager} socket={socket.getSocket()} />;
  }

  if (showConfirmStopAll) {
    return (
      <Box flexDirection="column">
        <Text bold color="red">Confirm Stop All Bots</Text>
        <Box marginTop={1}>
          <Text color="yellow">Are you sure you want to stop all active bots?</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="cyan">Active bots: {activeBots.regularBots.length + activeBots.multiBots.length}</Text>
        </Box>
        {stoppingProgress.status !== 'idle' && (
          <Box marginTop={1} flexDirection="column">
            {stoppingProgress.status === 'stopping' && (
              <Box>
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
        <Box marginTop={1}>
          <Text color="blue">
            {stoppingProgress.status === 'idle' ? 
              'Press Enter to confirm, Escape to cancel' :
              stoppingProgress.status === 'success' ? 
                'Press any key to continue' :
                'Press Escape to cancel'
            }
          </Text>
        </Box>
      </Box>
    );
  }

  if (showConfirmStartAll) {
    return (
      <Box flexDirection="column">
        <Text bold color="green">Confirm Start All Bots</Text>
        <Box marginTop={1}>
          <Text color="yellow">Are you sure you want to start all inactive bots?</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="cyan">Inactive bots: {startingProgress.total}</Text>
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
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color="white">Welcome to Trading Bot CLI</Text>
      
      {/* Dashboard Section */}
      <Box marginTop={1}>
        <Dashboard 
          socket={socket.getSocket() as unknown as Socket} 
          height={12} 
          onRefresh={() => checkActiveBots()} 
        />
      </Box>

      {/* Menu Section */}
      <Box marginTop={2}>
        <Text color="blue">Use ↑↓ arrows to select an option and Enter to confirm</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {options.map((option, index) => {
          let color = 'white';
          if (index === selectedOption) {
            color = 'cyan';
          } else if (option === 'Stop All Bots') {
            color = 'cyan';
          } else if (option === 'Start All Bots') {
            color = 'cyan';
          } else if (option === 'Exit') {
            color = 'cyan';
          } else if (option === 'View All Configs') {
            color = 'cyan';
          } else if (option === 'Add New Config' || option === 'Add Multi Config') {
            color = 'cyan';
          }
          return (
            <Text key={option} color={color}>
              {index === selectedOption ? '> ' : '  '}{option}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
};

// Entry point
const cli = () => {
  render(<App />);
};

export default cli; 