import React from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Transaction } from '@prisma/client';
import { shortenUUID } from '../../utils/helper.js';
import { useAppContext } from '../context/AppContext.js';
import { Socket } from 'socket.io-client';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('TransactionList');

interface TransactionListProps {
  height?: number;
  onBack: () => void;
  socket?: Socket
}

const TransactionList: React.FC<TransactionListProps> = ({ height = 20, onBack }) => {
  const { cliSocket } = useAppContext();
  const eventBus = cliSocket.getEventBus();
  const socket = cliSocket.getSocket();
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);

    // Handler for transaction:get event
    const handleTransactionGet = (data: { transactions: Transaction[] }) => {
      if (data.transactions) {
        setTransactions(data.transactions);
        setError(null);
      } else {
        setError('No transactions data received');
      }
      setLoading(false);
    };

    // Handler for live transaction updates
    const handleTransactionUpdate = (data: { transactions: Transaction[] }) => {
      if (data.transactions) {
        setTransactions(data.transactions);
        setLoading(false);
      }
    };

    // Listen for events
    socket.on('transaction:response', handleTransactionGet);
    socket.on('transactionUpdate', handleTransactionUpdate);

    // Request transactions
    socket.emit('transaction:get', {});

    // Cleanup listeners on unmount
    return () => {
      socket.off('transaction:response', handleTransactionGet);
      socket.off('transactionUpdate', handleTransactionUpdate);
    };
  }, [socket]);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    }
  });

  if (error) {
    return (
      <Box>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={height}>
      <Text bold>Transaction History</Text>
      {/* Table Header */}
      <Box marginTop={1}>
        <Box width={8}><Text bold>Bot ID</Text></Box>
        <Box width={16}><Text bold>Date</Text></Box>
        <Box width={25}><Text bold>Input</Text></Box>
        <Box width={25}><Text bold>Output</Text></Box>
        <Box width={10}><Text bold>Value</Text></Box>
        <Box width={8}><Text bold>TX ID</Text></Box>
      </Box>
      {/* Table Content */}
      <Box marginTop={1} flexDirection="column">
        {loading ? (
          <Box><Text>Loading transactions...</Text></Box>
        ) : transactions.length === 0 ? (
          <Box><Text>No transactions found</Text></Box>
        ) : (
          transactions.map((tx) => (
            <Box key={tx.id}>
              <Box width={8}><Text>{shortenUUID(tx.botId)}</Text></Box>
              <Box width={16}>
                <Text>{new Date(tx.date).toLocaleString('en-US', { 
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                })}</Text>
              </Box>
              <Box width={25}>
                <Text>{`${tx.tokenInAmount.toFixed(2)} ${shortenUUID(tx.tokenIn)}`}</Text>
              </Box>
              <Box width={25}>
                <Text>{`${tx.tokenOutAmount.toFixed(2)} ${shortenUUID(tx.tokenOut)}`}</Text>
              </Box>
              <Box width={10}>
                <Text>{`$${tx.totalValueUSD.toFixed(2)}`}</Text>
              </Box>
              <Box width={8}>
                <Text>{shortenUUID(tx.txid)}</Text>
              </Box>
            </Box>
          ))
        )}
      </Box>
      <Box marginTop={1}>
        <Text color="blue">Press Escape to go back</Text>
      </Box>
    </Box>
  );
};

export default TransactionList;