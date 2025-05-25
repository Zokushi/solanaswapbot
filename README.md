# Solana Trading Bot

A powerful trading bot for the Solana blockchain that supports both regular and multi-token trading strategies.


## Features

### Regular Bot
- Single token pair trading
- Configurable target gain percentage
- Stop loss protection (Not implemented yet)
- Real-time price monitoring
- Automatic trade execution
- Dashboard with live metrics

### Multi Bot
- Multiple token pair trading
- Individual target amounts for each token
- Configurable gain percentage
- Real-time price monitoring
- Automatic trade execution
- Dashboard with live metrics

## Prerequisites

- Node.js (v16 or higher)
- Solana CLI tools
- A Solana wallet with SOL and tokens for trading

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
KEY= Base58 private key
RPC_URL= URL for RPC eg QuickNodes, Helius have free options
WSS_URL= WSS URL can be found same place as RPC_URL
JUP_API=https://public.jupiterapi.com
DATABASE_URL="./dev.db"
PORT=4000
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd <repository-name>
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Usage

### Starting the Bot

1. Start the server:
```bash
npm start
```

2. The CLI interface will be displayed, allowing you to:
   - Create new bot configurations
   - View active bots
   - Monitor trading metrics
   - Delete bot configurations

### Regular Bot Configuration

When creating a regular bot, you'll need to provide:
- Initial input token
- Initial output token
- Initial input amount
- First trade price
- Target gain percentage (optional)
- Stop loss percentage (optional)
- Check interval (optional, default: 20000ms)

### Multi Bot Configuration

When creating a multi bot, you'll need to provide:
- Initial input token
- Initial input amount
- Target amounts for each token
- Target gain percentage
- Check interval (optional, default: 20000ms)

## Dashboard

The dashboard displays real-time metrics for all active bots:
- Bot ID
- Status (Running/Stopped)
- Current price
- Target price
- Difference percentage
- Number of trades
- Input/Output tokens

## Development

### Project Structure

```
src/
├── cli/              # CLI interface components
├── core/             # Core bot logic
├── services/         # Service layer
└── utils/            # Utility functions
```

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Security

- Never share your private keys
- Keep your `.env` file secure
- Regularly update dependencies
- Monitor bot activity

## Support

For support, please open an issue in the GitHub repository.

## Error Handling

The application uses a custom `TradeBotError` class to standardize error handling. Each error includes:
- `message`: Human-readable description.
- `code`: Unique error code (e.g., `QUOTE_FETCH_ERROR`).
- `details`: Optional context (e.g., API URL, bot ID).

### Common Error Codes
- `QUOTE_FETCH_ERROR`: Failed to fetch a quote from the Jupiter API.
- `SWAP_EXECUTION_ERROR`: Error during swap transaction execution.
- `DB_ERROR`: Database operation failed.
- `WALLET_ERROR`: Issue with wallet key or public key fetching.

## ⚠️ Disclaimer

This software is provided for **educational and personal use only**. It is not intended to be used as financial advice, investment advice, or trading advice. By using this software, you acknowledge and agree that:

- Trading cryptocurrencies involves significant risk and can result in the loss of your invested capital
- You are solely responsible for your trading decisions and any financial losses or gains that may occur
- The developers of this software are not responsible for any financial losses incurred through the use of this software
- You should never trade with money you cannot afford to lose
- You should always do your own research before making any investment decisions
- This software is provided "as is" without warranty of any kind
