import React from 'react';
import { Box, Text, useInput } from 'ink';
import { checkVariables } from '../../config/index.js';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from '../../utils/logger.js';

interface EnvVarInputProps {
  onComplete: () => void;
}

export const EnvVarInput: React.FC<EnvVarInputProps> = ({ onComplete }) => {
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
    const envPath = join(__dirname, '../../../.env');
    
    try {
      let envContent = '';
      try {
        envContent = readFileSync(envPath, 'utf8');
      } catch (error) {
        // File doesn't exist, that's okay
        logger.info('Creating new .env file');
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
      logger.info(`Saved environment variable: ${key}`);
      return true;
    } catch (error) {
      logger.error('Failed to save environment variable:', error);
      return false;
    }
  };

  useInput((input, key) => {
    if (currentVarIndex >= missingVars.length) {
      onComplete();
      return;
    }

    if (key.return) {
      const currentVar = missingVars[currentVarIndex];
      if (saveEnvVariable(currentVar, inputValue)) {
        setInputValue('');
        setCurrentVarIndex(prev => prev + 1);
      }
    } else if (key.backspace || key.delete) {
      setInputValue(prev => prev.slice(0, -1));
    } else {
      setInputValue(prev => prev + input);
    }
  });

  if (currentVarIndex >= missingVars.length) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Text>Please enter the value for {missingVars[currentVarIndex]}:</Text>
      <Text>Current input: {inputValue}</Text>
    </Box>
  );
}; 