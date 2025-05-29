import React from 'react';
import { Box, Text, useInput } from 'ink';
import TokenSelector from '../components/TokenSelector.js';
import { v4 as uuidv4 } from 'uuid';
import { MultiBotFormProps } from '../../core/types.js';
import { useAppContext } from '../context/AppContext.js';
import { MultiBotService } from '../../services/multiBotService.js';

interface TargetAmount {
  token: { name: string; symbol: string };
  amount: string;
}

export const MultiBotForm = ({ onComplete, editingConfig }: MultiBotFormProps) => {
  const { botManager } = useAppContext();
  const [currentField, setCurrentField] = React.useState(0);
  const [inputValue, setInputValue] = React.useState('');
  const [error, setError] = React.useState('');
  const [showTokenSelector, setShowTokenSelector] = React.useState(false);
  const [currentTargetAmount, setCurrentTargetAmount] = React.useState<TargetAmount>({
    token: { name: '', symbol: '' },
    amount: ''
  });

  const [formData, setFormData] = React.useState({
    initialInputToken: { address: '', name: '', symbol: '' },
    botId: '',
    initialInputAmount: '',
    targetGainPercentage: '',
    stopLossPercentage: '',
    checkInterval: '',
    targetAmounts: {} as Record<string, number>
  });

  const [targetAmounts, setTargetAmounts] = React.useState<TargetAmount[]>([]);

  const fields = [
    { name: 'initialInputToken', label: 'Initial Input Token', type: 'token' },
    { name: 'initialInputAmount', label: 'Initial Input Amount', type: 'number' },
    { name: 'targetGainPercentage', label: 'Target Gain Percentage', type: 'number' },
    { name: 'stopLossPercentage', label: 'Stop Loss Percentage (optional)', type: 'number' },
    { name: 'checkInterval', label: 'Check Interval (seconds, optional)', type: 'number' }
  ];

  const handleTokenSelect = (token: { address: string; symbol: string; name: string }) => {
    if (currentField === fields.length) {
      setCurrentTargetAmount(prev => ({
        ...prev,
        token: { name: token.name, symbol: token.symbol }
      }));
    } else {
      setFormData(prev => ({ 
        ...prev, 
        initialInputToken: { 
          address: token.address,
          name: token.name,
          symbol: token.symbol
        } 
      }));
    }
    setShowTokenSelector(false);
    setInputValue('');
  };

  const handleTokenCancel = () => {
    setShowTokenSelector(false);
    setInputValue('');
  };

  const handleSubmit = async () => {
    try {
      const targetAmountsRecord: Record<string, number> = {};
      targetAmounts.forEach(target => {
        targetAmountsRecord[target.token.name] = Number(target.amount);
      });

      const botId = uuidv4();
      const config = {
        botId,
        initialInputToken: formData.initialInputToken.name,
        initialInputAmount: Number(formData.initialInputAmount),
        targetGainPercentage: Number(formData.targetGainPercentage),
        stopLossPercentage: formData.stopLossPercentage ? Number(formData.stopLossPercentage) : undefined,
        checkInterval: formData.checkInterval ? Number(formData.checkInterval) : undefined,
        targetAmounts: targetAmountsRecord
      };

      if (editingConfig) {
        // Update existing config
        await botManager.updateBotConfig(config.botId, config);
      } else {
        // Create new config without starting the bot
        const multiBotService = new MultiBotService();
        await multiBotService.addConfig(config);
      }

      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    }
  };

  useInput((input, key) => {
    if (showTokenSelector) return;

    if (key.escape) {
      onComplete();
      return;
    }

    if (input.toLowerCase() === 's') {
      if (targetAmounts.length === 0) {
        setError('At least one target amount is required');
        return;
      }
      handleSubmit();
      return;
    }

    if (key.upArrow) {
      setCurrentField(prev => (prev > 0 ? prev - 1 : prev));
      if (currentField === fields.length) {
        setInputValue(currentTargetAmount.amount);
      } else {
        const field = fields[currentField - 1];
        if (field && field.type === 'token') {
          setInputValue(formData.initialInputToken.symbol || '');
        } else if (field) {
          setInputValue(formData[field.name as keyof typeof formData] as string || '');
        }
      }
    } else if (key.downArrow) {
      setCurrentField(prev => (prev < fields.length ? prev + 1 : prev));
      if (currentField === fields.length) {
        setInputValue(currentTargetAmount.amount);
      } else {
        const field = fields[currentField + 1];
        if (field && field.type === 'token') {
          setInputValue(formData.initialInputToken.symbol || '');
        } else if (field) {
          setInputValue(formData[field.name as keyof typeof formData] as string || '');
        }
      }
    } else if (key.return) {
      if (currentField === fields.length) {
        if (!currentTargetAmount.token.name) {
          setShowTokenSelector(true);
          return;
        }

        if (!currentTargetAmount.amount) {
          setError('Please enter a target amount');
          return;
        }

        setTargetAmounts(prev => [...prev, currentTargetAmount]);
        setCurrentTargetAmount({
          token: { name: '', symbol: '' },
          amount: ''
        });
        setInputValue('');
      } else {
        const field = fields[currentField];
        if (field && field.type === 'token') {
          setShowTokenSelector(true);
        } else if (field) {
          setFormData(prev => ({ ...prev, [field.name]: inputValue }));
          setInputValue('');
        }
      }
    } else {
      if (currentField === fields.length) {
        if (key.backspace) {
          setCurrentTargetAmount(prev => ({
            ...prev,
            amount: prev.amount.slice(0, -1)
          }));
          setInputValue(prev => prev.slice(0, -1));
        } else {
          setCurrentTargetAmount(prev => ({
            ...prev,
            amount: prev.amount + input
          }));
          setInputValue(prev => prev + input);
        }
      } else {
        if (key.backspace) {
          setInputValue(prev => prev.slice(0, -1));
        } else {
          setInputValue(prev => prev + input);
        }
      }
    }
  });

  // Initialize form with editing config if provided
  React.useEffect(() => {
    if (editingConfig) {
      setFormData({
        initialInputToken: editingConfig.initialInputToken || { address: '', name: '', symbol: '' },
        botId: editingConfig.botId || '',
        initialInputAmount: editingConfig.amount?.toString() || '',
        targetGainPercentage: editingConfig.targetGainPercentage?.toString() || '',
        stopLossPercentage: editingConfig.stopLossPercentage?.toString() || '',
        checkInterval: editingConfig.checkInterval?.toString() || '',
        targetAmounts: {} // Initialize with empty object, will be populated from targetAmounts state
      });

      // Convert target amounts to the correct format
      if (editingConfig.targetAmounts) {
        const targetAmountsArray = Object.entries(editingConfig.targetAmounts).map(([tokenName, amount]) => ({
          token: { name: tokenName, symbol: tokenName },
          amount: (amount as number).toString()
        }));
        setTargetAmounts(targetAmountsArray);
      }
    }
  }, [editingConfig]);

  if (showTokenSelector) {
    return <TokenSelector onSelect={handleTokenSelect} onCancel={handleTokenCancel} />;
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Multi Bot Configuration</Text>
      
      {/* Initial Configuration */}
      {fields.map((field, index) => (
        <Box key={field.name} marginTop={1}>
          <Text color={currentField === index ? 'yellow' : 'white'}>
            {field.label}: {
              field.type === 'token' 
                ? formData.initialInputToken.symbol || 'Select token'
                : currentField === index 
                  ? inputValue 
                  : (formData[field.name as keyof typeof formData] as string) || ''
            }
          </Text>
        </Box>
      ))}

      {/* Target Amounts */}
      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">Target Amounts:</Text>
        {targetAmounts.map((target, index) => (
          <Text key={index} color="green">
            {target.token.symbol}: {target.amount}
          </Text>
        ))}
        <Box marginTop={1}>
          <Text color={currentField === fields.length ? 'yellow' : 'white'}>
            Add Target: {currentTargetAmount.token.symbol || 'Select token'} {currentTargetAmount.amount ? `Amount: ${currentTargetAmount.amount}` : ''}
          </Text>
        </Box>
      </Box>

      {/* Instructions */}
      <Box marginTop={2}>
        <Text color="yellow">Instructions:</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text>• Use ↑↓ arrow keys to navigate between fields</Text>
          <Text>• Press Enter to:</Text>
          <Box marginLeft={2}>
            <Text>  - Select a token when on token fields</Text>
            <Text>  - Add a target amount when on target field</Text>
          </Box>
          <Text>• Press 'S' to save configuration</Text>
          <Text>• Press Escape to exit</Text>
        </Box>
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
    </Box>
  );
};

export default MultiBotForm;
                  