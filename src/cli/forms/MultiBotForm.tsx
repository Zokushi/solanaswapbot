import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { ConfigService } from '../../services/configService.js';
import TokenSelector from '../components/TokenSelector.js';
import { DefaultBotManager } from '../../core/botManager.js';
import { Socket } from 'socket.io-client';

interface MultiBotFormProps {
  onComplete: () => void;
  botManager: DefaultBotManager;
  socket: Socket;
}

interface TargetAmount {
  token: { name: string; symbol: string };
  amount: string;
}

const MultiBotForm: React.FC<MultiBotFormProps> = ({ onComplete, botManager, socket }) => {
  const { exit } = useApp();
  const [currentField, setCurrentField] = React.useState(0);
  const [showTokenSelector, setShowTokenSelector] = React.useState(false);
  const [isAddingTarget, setIsAddingTarget] = React.useState(false);
  const [formData, setFormData] = React.useState({
    botId: '',
    initialInputToken: '',
    initialInputAmount: '',
    targetGainPercentage: '',
    stopLossPercentage: '',
    checkInterval: ''
  });

  const [targetAmounts, setTargetAmounts] = React.useState<TargetAmount[]>([]);
  const [currentTargetAmount, setCurrentTargetAmount] = React.useState<TargetAmount>({
    token: { name: '', symbol: '' },
    amount: ''
  });

  const fields = [
    { name: 'initialInputToken', label: 'Initial Input Token', type: 'token' },
    { name: 'initialInputAmount', label: 'Initial Input Amount', type: 'number' },
    { name: 'targetGainPercentage', label: 'Target Gain Percentage', type: 'number' },
    { name: 'stopLossPercentage', label: 'Stop Loss Percentage (optional)', type: 'number' },
    { name: 'checkInterval', label: 'Check Interval (seconds, optional)', type: 'number' }
  ];

  const [inputValue, setInputValue] = React.useState('');
  const [error, setError] = React.useState('');

  const handleTokenSelect = (token: { address: string; symbol: string; name: string }) => {
    if (isAddingTarget) {
      setCurrentTargetAmount(prev => ({ ...prev, token: { name: token.name, symbol: token.symbol } }));
      setShowTokenSelector(false);
      setInputValue('');
      setError('');
    } else {
      setFormData(prev => ({
        ...prev,
        [fields[currentField].name]: token.name
      }));
      setShowTokenSelector(false);
      setCurrentField(prev => prev + 1);
    }
  };

  const handleTokenCancel = () => {
    setShowTokenSelector(false);
    if (isAddingTarget) {
      setIsAddingTarget(false);
    }
  };

  useInput((input, key) => {
    if (showTokenSelector) return;

    if (key.escape) {
      if (isAddingTarget) {
        setIsAddingTarget(false);
        setInputValue('');
      } else {
        onComplete();
      }
      return;
    }

    if (isAddingTarget && input.toLowerCase() === 's') {
      submitForm();
      return;
    }

    if (key.return) {
      if (isAddingTarget) {
        if (!currentTargetAmount.token.name) {
          setShowTokenSelector(true);
          return;
        }
        if (!inputValue) {
          setError('Please enter an amount');
          return;
        }
        if (isNaN(Number(inputValue))) {
          setError('Please enter a valid number');
          return;
        }
        
        // Create a new target amount with the current values
        const newTargetAmount = {
          token: currentTargetAmount.token,
          amount: inputValue
        };
        
        // Add it to the list
        setTargetAmounts(prev => [...prev, newTargetAmount]);
        
        // Reset for next target
        setCurrentTargetAmount({ token: { name: '', symbol: '' }, amount: '' });
        setInputValue('');
        setError('');
        setShowTokenSelector(true);
        return;
      }

      const field = fields[currentField];
      
      if (field.type === 'token') {
        setShowTokenSelector(true);
        return;
      }

      if (currentField < fields.length - 1) {
        if (field.type === 'number' && isNaN(Number(inputValue))) {
          setError('Please enter a valid number');
          return;
        }
        if (!inputValue && field.name !== 'stopLossPercentage' && field.name !== 'checkInterval') {
          setError('This field is required');
          return;
        }

        setFormData(prev => ({
          ...prev,
          [field.name]: inputValue
        }));

        setCurrentField(prev => prev + 1);
        setInputValue('');
        setError('');
      } else {
        // All fields completed, show target amounts section
        setIsAddingTarget(true);
      }
    } else if (key.backspace) {
      setInputValue(prev => prev.slice(0, -1));
    } else if (input) {
      setInputValue(prev => prev + input);
    }
  });

  const submitForm = async () => {
    if (targetAmounts.length === 0) {
      setError('At least one target amount is required');
      return;
    }

    const targetAmountsRecord: Record<string, number> = {};
    targetAmounts.forEach(target => {
      targetAmountsRecord[target.token.name] = Number(target.amount);
    });

    try {
      const configService = new ConfigService();
      await configService.addMultiConfig({
        botId: BigInt(Date.now()),
        initialInputToken: formData.initialInputToken,
        initialInputAmount: Number(formData.initialInputAmount),
        targetGainPercentage: Number(formData.targetGainPercentage),
        stopLossPercentage: formData.stopLossPercentage ? BigInt(formData.stopLossPercentage) : undefined,
        checkInterval: formData.checkInterval ? Number(formData.checkInterval) : undefined,
        targetAmounts: targetAmountsRecord
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    }
  };

  if (showTokenSelector) {
    return <TokenSelector onSelect={handleTokenSelect} onCancel={handleTokenCancel} />;
  }

  if (isAddingTarget) {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Add Target Amounts</Text>
        <Box marginTop={1} flexDirection="column">
          {targetAmounts.map((target, index) => (
            <Text key={index} color="green">
              {target.token.symbol}: {target.amount}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color="yellow">
            {!currentTargetAmount.token.name ? 
              'Step 1: Select token (Press Enter)' :
              !currentTargetAmount.amount ?
                `Step 2: Enter amount for ${currentTargetAmount.token.symbol} (Type number and press Enter)` :
                'Step 3: Press Enter to add this target'
            }
          </Text>
        </Box>
        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color="blue">
            Current: {currentTargetAmount.token.symbol || 'No token selected'} - {currentTargetAmount.amount || inputValue || 'No amount'}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="magenta">
            Press 'S' to save configuration when done, Escape to cancel
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Add New Multi-Bot Configuration</Text>
      <Box marginTop={1} flexDirection="column">
        {fields.map((field, index) => (
          <Box key={field.name}>
            <Text color={index === currentField ? 'green' : 'white'}>
              {field.label}: {index === currentField ? inputValue : formData[field.name as keyof typeof formData] || ''}
            </Text>
          </Box>
        ))}
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text>Press Enter to continue, Escape to exit</Text>
      </Box>
    </Box>
  );
};

export default MultiBotForm; 