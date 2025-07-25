import React from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Transaction } from '@prisma/client';
import { getTokenName, shortenUUID } from '../../utils/helper.js';
import { useAppContext } from '../context/AppContext.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('TransactionList');

interface TransactionListProps {
  height?: number;
  onBack: () => void;
}

export default function TransactionList({ height = 20, onBack }: TransactionListProps) {
  const { cliSocket } = useAppContext();
  const eventBus = cliSocket.getEventBus();
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tokenNames, setTokenNames] = React.useState<Map<string, string>>(new Map());

  React.useEffect(() => {
    setLoading(true);

    // Handler for transaction:get event
    const handleTransactionGet = (data: { transactions: Transaction[] }) => {
      if (data.transactions) {
        logger.debug('Received transactions:', { 
          firstTransaction: data.transactions[0],
          date: data.transactions[0]?.date
        });
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
    eventBus.on('transaction:response', handleTransactionGet as (data: unknown) => void);
    eventBus.on('transactionUpdate', handleTransactionUpdate as (data: unknown) => void);

    // Request transactions
    logger.debug('Requesting transactions', { 
      method: 'useEffect',
      isConnected: cliSocket.getSocket().connected 
    });
    eventBus.emit('transaction:get', {});

    // Cleanup listeners on unmount
    return () => {
      eventBus.off('transaction:response', handleTransactionGet as (data: unknown) => void);
      eventBus.off('transactionUpdate', handleTransactionUpdate as (data: unknown) => void);
    };
  }, [eventBus]);

  // Fetch token names when transactions change
  React.useEffect(() => {
    const fetchTokenNames = async () => {
      const newTokenNames = new Map<string, string>();
      for (const tx of transactions) {
        if (!tokenNames.has(tx.tokenIn)) {
          const name = await getTokenName(tx.tokenIn);
          newTokenNames.set(tx.tokenIn, name);
        }
        if (!tokenNames.has(tx.tokenOut)) {
          const name = await getTokenName(tx.tokenOut);
        }
      }
      if (newTokenNames.size > 0) {
        setTokenNames(prev => new Map([...prev, ...newTokenNames]));
      }
    };
    fetchTokenNames();
  }, [transactions, tokenNames]);

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
                <Text>
                  {(() => {
                    try {
                      if (!tx.date) return 'N/A';
                      // Handle Prisma DateTime object
                      const date = tx.date instanceof Date ? tx.date : new Date(tx.date);
                      if (isNaN(date.getTime())) {
                        logger.error('Invalid date:', { date: tx.date });
                        return 'N/A';
                      }
                      return date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                        timeZone: 'UTC'
                      });
                    } catch (error) {
                      logger.error('Error formatting date:', { date: tx.date, error });
                      return 'N/A';
                    }
                  })()}
                </Text>
              </Box>
              <Box width={25}>
                <Text>{`${tx.tokenInAmount.toFixed(2)} ${tokenNames.get(tx.tokenIn) || tx.tokenIn}`}</Text>
              </Box>
              <Box width={25}>
                <Text>{`${tx.tokenOutAmount.toFixed(2)} ${tokenNames.get(tx.tokenOut) || tx.tokenOut}`}</Text>
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
