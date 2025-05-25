import React from 'react';
import { Box, Text, useInput } from 'ink';
import { getCachedTokens, type Token } from '../../utils/tokenCache.js';


interface TokenSelectorProps {
  onSelect: (token: Token) => void;
  onCancel: () => void;
}

const DISPLAY_LIMIT = 10;

const TokenSelector: React.FC<TokenSelectorProps> = ({ onSelect, onCancel }) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [tokens, setTokens] = React.useState<Token[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [displayOffset, setDisplayOffset] = React.useState(0);

  React.useEffect(() => {
    const fetchTokens = async () => {
      try {
        setLoading(true);
        const cachedTokens = await getCachedTokens();
        // Sort tokens by symbol for better usability
        const sortedTokens = cachedTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setTokens(sortedTokens);
        setError(null);
      } catch (err) {
        setError('Failed to load tokens. Please try again.');
        console.error('Error loading tokens:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTokens();
  }, []);

  const filteredTokens = React.useMemo(() => {
    if (!searchTerm) {
      return tokens;
    }
    const searchLower = searchTerm.toLowerCase();
    return tokens.filter(token => 
      token.symbol.toLowerCase().includes(searchLower) ||
      token.name.toLowerCase().includes(searchLower) ||
      token.address.toLowerCase().includes(searchLower)
    );
  }, [tokens, searchTerm]);

  const displayedTokens = React.useMemo(() => {
    return filteredTokens.slice(displayOffset, displayOffset + DISPLAY_LIMIT);
  }, [filteredTokens, displayOffset]);

  const hasMore = displayOffset + DISPLAY_LIMIT < filteredTokens.length;
  const hasPrevious = displayOffset > 0;

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      if (displayedTokens.length > 0) {
        onSelect(displayedTokens[selectedIndex]);
      }
      return;
    }

    if (key.upArrow) {
      if (selectedIndex > 0) {
        setSelectedIndex(prev => prev - 1);
      } else if (hasPrevious) {
        setDisplayOffset(prev => prev - DISPLAY_LIMIT);
        setSelectedIndex(DISPLAY_LIMIT - 1);
      }
    }

    if (key.downArrow) {
      if (selectedIndex < displayedTokens.length - 1) {
        setSelectedIndex(prev => prev + 1);
      } else if (hasMore) {
        setDisplayOffset(prev => prev + DISPLAY_LIMIT);
        setSelectedIndex(0);
      }
    }

    if (key.backspace) {
      setSearchTerm(prev => prev.slice(0, -1));
      setSelectedIndex(0);
      setDisplayOffset(0);
    } else if (input) {
      setSearchTerm(prev => prev + input);
      setSelectedIndex(0);
      setDisplayOffset(0);
    }
  });

  if (loading) {
    return (
      <Box>
        <Text>Loading tokens...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>Search Token (type to search): {searchTerm}</Text>
      <Box marginTop={1} flexDirection="column">
        {displayedTokens.map((token, index) => (
          <Box key={token.address}>
            <Text color={index === selectedIndex ? 'green' : 'white'}>
              {index === selectedIndex ? '> ' : '  '}
              <Text bold>{token.symbol.padEnd(8)}</Text>
              <Text>{token.name.padEnd(30)}</Text>
              <Text color={index === selectedIndex ? 'green' : 'gray'} dimColor>
                {token.address}
              </Text>
            </Text>
          </Box>
        ))}
        {hasMore && (
          <Box marginTop={1}>
            <Text color="gray">... {filteredTokens.length - (displayOffset + DISPLAY_LIMIT)} more tokens</Text>
          </Box>
        )}
      </Box>
      <Box marginTop={1}>
        <Text>
          {filteredTokens.length > 0 ? 
            `Showing ${displayOffset + 1}-${Math.min(displayOffset + DISPLAY_LIMIT, filteredTokens.length)} of ${filteredTokens.length} tokens` :
            'No tokens found'
          }
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>↑↓ to select, Enter to confirm, Escape to cancel</Text>
      </Box>
    </Box>
  );
};

export default TokenSelector; 