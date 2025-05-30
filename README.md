# Trading Bot CLI

A command-line interface for managing trading bots, built with Node.js, TypeScript, and Prisma. This CLI allows you to create, view, and manage regular and multi-bot configurations, monitor transactions, and interact with a trading bot server.

## Features

- Create and manage regular trading bot configurations (e.g., SOL/USDC pair)
- Create and manage multi-bot configurations with multiple target tokens
- Real-time monitoring of bot status and performance
- Transaction history tracking
- Interactive CLI interface with keyboard navigation
- Support for both Windows and Unix-based systems

## Prerequisites

- Node.js: v20 or higher
- npm: v10 or higher
- yarn: v3.8.6
- A Solana wallet with SOL for transactions
- Access to a Solana RPC endpoint

## Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd solanaswapbot
```

### 2. Install Dependencies
```bash
yarn install
```

### 3. Configure Environment Variables
Create a `.env` file in the root directory with the following variables:

```env
# Solana RPC Configuration
RPC_URL=<Check Helius or Quicknodes for free RPC>
WSS_URL=<Check Helius or Quicknodes for free WSS>

# Jupiter API Configuration
JUP_API=https://public.jupiterapi.com

# Database Configuration
DATABASE_URL="./dev.db"

# Server Configuration
PORT=4000

# Wallet Configuration
KEY=<Private Key Base58>
```

### 4. Set Up the Database
```bash
npm prisma migrate dev
npx prisma generate
```

## Running the Application

### Start the Server
In a terminal from the root of the project, run:
```bash
yarn dev:windows
```

This will open two windows:
1. Server window - handles the backend services
2. CLI window - the interactive trading bot interface

## Usage

### Main Menu Options

1. **View All Configs**
   - List all bot configurations
   - Edit or delete existing configurations

2. **Add New Config**
   - Create a regular bot configuration
   - Configure input/output tokens
   - Set target gain and stop loss percentages

3. **Add Multi Config**
   - Create a multi-bot configuration
   - Set multiple target tokens
   - Configure target amounts for each token

4. **Start All Bots**
   - Start all configured bots
   - View progress of bot initialization

5. **Stop All Bots**
   - Stop all running bots
   - View progress of bot termination

6. **View Transactions**
   - Display transaction history
   - View trade details and performance

### Navigation

- Use ↑/↓ arrows to select options
- Press Enter to confirm
- Press Escape to go back or exit
- In forms:
  - Use arrow keys to navigate fields
  - Type values and press Enter to confirm
  - Press Escape to cancel

## Bot Configuration

### Regular Bot
- Input Token: The token you're trading from
- Output Token: The token you're trading to
- Initial Input Amount: Amount of input token to start with
- Target Gain Percentage: Desired profit percentage
- Stop Loss Percentage: (Optional) Maximum loss percentage (WIP Do not use this yet)
- First Trade Price: (Optional) Initial trade price

### Multi Bot
- Input Token: The token you're trading from
- Initial Input Amount: Amount of input token to start with
- Target Gain Percentage: Desired profit percentage
- Stop Loss Percentage: (Optional) Maximum loss percentage (WIP Do not use this yet)
- Target Amounts: List of target tokens and their desired amounts

## Troubleshooting

### Common Issues

1. **"Another CLI instance is running" Error**
   - Ensure no other CLI instances are running
   - Delete `cli.lock` file
   - Verify you're running `yarn cli` from the correct directory

2. **Database Connection Issues**
   - Verify DATABASE_URL in .env file
   - Ensure database migrations are up to date
   - Check database file permissions

3. **RPC Connection Issues**
   - Verify RPC_URL and WSS_URL in .env file
   - Check internet connection
   - Ensure RPC endpoint is active and responsive

4. **Transaction Failures**
   - Verify wallet has sufficient SOL for fees
   - Check token balances

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

Please ensure your pull request:
- Includes clear descriptions
- Has appropriate tests
- Follows the existing code style
- Updates documentation if needed

## ⚠️ Disclaimer

This software is provided for **educational and personal use only**. It is not intended to be used as financial advice, investment advice, or trading advice. By using this software, you acknowledge and agree that:

- Trading cryptocurrencies involves significant risk and can result in the loss of your invested capital
- You are solely responsible for your trading decisions and any financial losses or gains that may occur
- The developers of this software are not responsible for any financial losses incurred through the use of this software
- You should never trade with money you cannot afford to lose
- You should always do your own research before making any investment decisions
- This software is provided "as is" without warranty of any kind

## License

This project is licensed under the MIT License 
