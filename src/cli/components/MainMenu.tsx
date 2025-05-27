import React from 'react';
import { Box, Text } from 'ink';

interface MainMenuProps {
  selectedOption: number;
  options: string[];
}

export const MainMenu: React.FC<MainMenuProps> = ({ selectedOption, options }) => {
  return (
    <Box flexDirection="column">
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