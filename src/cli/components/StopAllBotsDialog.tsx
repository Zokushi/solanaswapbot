import React from 'react';
import { Box, Text } from 'ink';

interface StopAllBotsDialogProps {
  activeBots: {
    regularBots: Array<{ botId: string; status: string }>;
    multiBots: Array<{ botId: string; status: string }>;
  };
  stoppingProgress: {
    current: number;
    total: number;
    status: 'idle' | 'stopping' | 'success' | 'error';
    message: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
}

export const StopAllBotsDialog: React.FC<StopAllBotsDialogProps> = ({
  activeBots,
  stoppingProgress,
  onConfirm,
  onCancel
}) => {
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
}; 