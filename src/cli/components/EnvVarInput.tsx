import React from 'react';
import { Box, Text, useInput } from 'ink';
import { checkVariables } from '../../config/index.js';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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