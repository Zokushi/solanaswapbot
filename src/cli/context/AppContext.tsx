import React, { createContext, useContext } from 'react';
import { CLISocket } from '../services/CLISocket.js';
import { BotManager } from '../../core/types.js';
import { DefaultBotManager } from '../../core/botManager.js';

export interface AppContextType {
  cliSocket: CLISocket;
  botManager: BotManager;
}

const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: React.ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const botManager = new DefaultBotManager();
  const cliSocket = new CLISocket(botManager);

  return (
    <AppContext.Provider value={{ cliSocket, botManager }}>
      {children}
    </AppContext.Provider>
  );
}; 