import React from 'react';
import { Box, Text } from 'ink';

interface MainMenuProps {
  selectedOption: number;
  options: string[];
}

export const MainMenu: React.FC<MainMenuProps> = ({ selectedOption, options }) => {
  const getOptionColor = (option: string, isSelected: boolean) => {
    if (isSelected) return 'magentaBright'; // Selected option is bright magenta
    
    if (option === 'Exit') return 'magentaBright';
    if (option === 'Stop All Bots') return 'magentaBright';
    if (option === 'Start All Bots') return 'magentaBright';
    if (option === 'View All Configs') return 'magentaBright';
    if (option === 'Add New Config' || option === 'Add Multi Config') return 'magentaBright';
    
    return 'whiteBright'; // Default color for better readability
  };

  return (
    <Box flexDirection="column">
      <Box marginTop={2}>
        <Text color="whiteBright">Use ↑↓ arrows to select an option and Enter to confirm</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {options.map((option, index) => {
          const isSelected = index === selectedOption;
          const color = getOptionColor(option, isSelected);
          
          return (
            <Text key={option} color={color}>
              {isSelected ? '> ' : '  '}{option}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}; 