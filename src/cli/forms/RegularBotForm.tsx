import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { ConfigService } from '../../services/configService.js';
import TokenSelector from '../components/TokenSelector.js';
import { DefaultBotManager } from '../../core/botManager.js';
import { Socket } from 'socket.io-client';

interface RegularBotFormProps {
  onComplete: () => void;
  botManager: DefaultBotManager;
  socket: Socket;
}

const RegularBotForm: React.FC<RegularBotFormProps> = ({ onComplete, botManager, socket }) => {
  const { exit } = useApp();
  const [currentField, setCurrentField] = React.useState(0);
  const [showTokenSelector, setShowTokenSelector] = React.useState(false);
  const [formData, setFormData] = React.useState({
    botId: '',
    initialInputToken: '',
    initialOutputToken: '',
    initialInputAmount: '',
    firstTradePrice: '',
    targetGainPercentage: '',
    stopLossPercentage: ''
  });

  const fields = [
    { name: 'initialInputToken', label: 'Initial Input Token', type: 'token' },
    { name: 'initialOutputToken', label: 'Initial Output Token', type: 'token' },
    { name: 'initialInputAmount', label: 'Initial Input Amount', type: 'number' },
    { name: 'firstTradePrice', label: 'First Trade Price', type: 'number' },
    { name: 'targetGainPercentage', label: 'Target Gain Percentage', type: 'number' },
    { name: 'stopLossPercentage', label: 'Stop Loss Percentage (optional)', type: 'number' }
  ];

  const [inputValue, setInputValue] = React.useState('');
  const [error, setError] = React.useState('');

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
        setInputValue('');
        setError('');
      } else {
        // All fields completed, submit form
        submitForm();
      }
    } else if (key.backspace) {
      setInputValue(prev => prev.slice(0, -1));
    } else if (input) {
      setInputValue(prev => prev + input);
    }
  });

  const submitForm = async () => {
    try {
      const configService = new ConfigService();
      await configService.addConfig({
        botId: BigInt(Date.now()),
        initialInputToken: formData.initialInputToken,
        initialOutputToken: formData.initialOutputToken,
        initialInputAmount: Number(formData.initialInputAmount),
        firstTradePrice: Number(formData.firstTradePrice),
        targetGainPercentage: Number(formData.targetGainPercentage),
        stopLossPercentage: formData.stopLossPercentage ? BigInt(formData.stopLossPercentage) : undefined
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
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
        <Text>Press Enter to continue, Escape to exit</Text>
      </Box>
    </Box>
  );
};

export default RegularBotForm; 