import React from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfigService } from '../../services/configService.js';
import TokenSelector from '../components/TokenSelector.js';
import { v4 as uuidv4 } from 'uuid';
import { RegularBotFormProps } from '../../core/types.js';

const RegularBotForm: React.FC<RegularBotFormProps> = ({ onComplete, botManager, socket, editingConfig }) => {
  const [currentField, setCurrentField] = React.useState(0);
  const [inputValue, setInputValue] = React.useState('');
  const [formData, setFormData] = React.useState({
    initialInputToken: '',
    initialOutputToken: '',
    initialInputAmount: '',
    firstTradePrice: '',
    targetGainPercentage: '',
    stopLossPercentage: ''
  });
  const [showTokenSelector, setShowTokenSelector] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Initialize form with editing config if provided
  React.useEffect(() => {
    if (editingConfig) {
      setFormData({
        initialInputToken: editingConfig.initialInputToken,
        initialOutputToken: editingConfig.initialOutputToken || '',
        initialInputAmount: editingConfig.amount.toString(),
        firstTradePrice: editingConfig.firstTradePrice?.toString() || '',
        targetGainPercentage: editingConfig.targetGainPercentage?.toString() || '',
        stopLossPercentage: editingConfig.stopLossPercentage?.toString() || ''
      });
    }
  }, [editingConfig]);

  const fields = [
    { name: 'initialInputToken', label: 'Input Token', type: 'token' },
    { name: 'initialOutputToken', label: 'Output Token', type: 'token' },
    { name: 'initialInputAmount', label: 'Input Amount', type: 'number' },
    { name: 'firstTradePrice', label: 'First Trade Price', type: 'number' },
    { name: 'targetGainPercentage', label: 'Target Gain %', type: 'number' },
    { name: 'stopLossPercentage (Optional)', label: 'Stop Loss %', type: 'number' }
  ];

  const handleTokenSelect = (token: { address: string; symbol: string; name: string }) => {
    setFormData(prev => ({
      ...prev,
      [fields[currentField].name]: token.name
    }));
    setShowTokenSelector(false);
    setCurrentField(prev => prev + 1);
  };

  const handleTokenCancel = () => {
    setShowTokenSelector(false);
  };

  useInput((input, key) => {
    if (showTokenSelector) return;

    if (key.escape) {
      onComplete();
      return;
    }

    if (key.upArrow) {
      setCurrentField(prev => (prev > 0 ? prev - 1 : prev));
      const prevField = fields[currentField - 1];
      if (prevField) {
        setInputValue(formData[prevField.name as keyof typeof formData] || '');
      }
      return;
    }

    if (key.downArrow) {
      setCurrentField(prev => (prev < fields.length - 1 ? prev + 1 : prev));
      const nextField = fields[currentField + 1];
      if (nextField) {
        setInputValue(formData[nextField.name as keyof typeof formData] || '');
      }
      return;
    }

    if (key.return) {
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
        if (!inputValue && field.name !== 'stopLossPercentage') {
          setError('This field is required');
          return;
        }

        setFormData(prev => ({
          ...prev,
          [field.name]: inputValue
        }));

        setCurrentField(prev => prev + 1);
        const nextField = fields[currentField + 1];
        setInputValue(formData[nextField.name as keyof typeof formData] || '');
        setError('');
      } else {
        // On last field, just save the value but don't submit
        if (field.type === 'number' && isNaN(Number(inputValue))) {
          setError('Please enter a valid number');
          return;
        }
        if (!inputValue && field.name !== 'stopLossPercentage') {
          setError('This field is required');
          return;
        }

        setFormData(prev => ({
          ...prev,
          [field.name]: inputValue
        }));
        setInputValue('');
        setError('');
      }
    } else if (input.toLowerCase() === 's' && currentField === fields.length - 1) {
      // Only allow saving if we're on the last field and all fields are filled
      const allFieldsFilled = fields.every(field => 
        field.name === 'stopLossPercentage' || formData[field.name as keyof typeof formData]
      );
      
      if (allFieldsFilled) {
        handleSubmit();
      } else {
        setError('Please fill in all required fields');
      }
    } else if (key.backspace) {
      setInputValue(prev => prev.slice(0, -1));
    } else if (input) {
      setInputValue(prev => prev + input);
    }
  });

  const handleSubmit = async () => {
    try {
      const config = {
        botId: editingConfig?.botId || crypto.randomUUID(),
        initialInputToken: formData.initialInputToken,
        initialOutputToken: formData.initialOutputToken,
        initialInputAmount: parseFloat(formData.initialInputAmount),
        firstTradePrice: parseFloat(formData.firstTradePrice),
        targetGainPercentage: parseFloat(formData.targetGainPercentage),
        stopLossPercentage: formData.stopLossPercentage ? 
          BigInt(Math.floor(parseFloat(formData.stopLossPercentage) * 100)) : 
          undefined
      };

      if (editingConfig) {
        // Update existing config
        await botManager.updateBotConfig(config.botId, config);
      } else {
        // Create new config
        await botManager.startBot(config, socket);
      }

      onComplete();
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setError('Failed to save configuration');
    }
  };

  if (showTokenSelector) {
    return <TokenSelector onSelect={handleTokenSelect} onCancel={handleTokenCancel} />;
  }

  return (
    <Box flexDirection="column">
      <Text bold>Add New Bot Configuration</Text>
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
        <Text>Press Enter to continue, 'S' to save when done, Escape to exit</Text>
      </Box>
    </Box>
  );
};

export default RegularBotForm; 