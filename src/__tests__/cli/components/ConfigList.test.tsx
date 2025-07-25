// __tests__/cli/components/ConfigList.test.tsx
import { render } from 'ink-testing-library';
import { ConfigList } from '../../../cli/components/ConfigList.js';
import { jest } from '@jest/globals';
import { useAppContext } from '../../../cli/context/AppContext.js';
import { BotWithType } from '../../../core/types.js';
import { getSingleTokenData } from '../../../services/tokenDataService.js';

// Mock dependencies
jest.mock('../../cli/context/AppContext.js');
jest.mock('../../services/tokenDataService.js');
jest.mock('../../utils/logger.js');
jest.mock('../../services/configService.js');
jest.mock('../../cli/hooks/useBotManager.js');

describe('ConfigList', () => {
  const mockBot: BotWithType = {
    botId: 'test-bot-123',
    type: 'regular',
    initialInputToken: 'SOL',
    initialOutputToken: 'USDC',
    initialInputAmount: 1000,
    targetGainPercentage: 5,
    stopLossPercentage: 2,
    firstTradePrice: BigInt(1000),
    status: 'running',
    amount: 1000,
  };

  // Use the correct type for mockConfigs to match the expected state shape in the component
  const mockConfigs = {
    regularBots: [mockBot],
    multiBots: [],
  };

  let mockEventBus: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    (useAppContext as jest.Mock).mockReturnValue({
      cliSocket: {
        getEventBus: jest.fn().mockReturnValue(mockEventBus),
        stopBot: jest.fn().mockResolvedValue(undefined),
        deleteConfig: jest.fn().mockResolvedValue(undefined),
      },
    });
    (getSingleTokenData as jest.Mock).mockImplementation(async (mint) => ({
      address: mint,
      name: mint === 'SOL' ? 'Wrapped SOL' : 'USD Coin',
      symbol: mint,
    }));
  });

  it('renders loading state', () => {
    const { lastFrame } = render(<ConfigList onBack={jest.fn()} />);
    expect(lastFrame()).toContain('Loading configurations...');
  });

  it('renders bot configurations', () => {
    mockEventBus.on.mockImplementation((event, callback) => {
      if (event === 'configUpdate') callback(mockConfigs);
    });

    const { lastFrame } = render(<ConfigList onBack={jest.fn()} />);
    expect(lastFrame()).toContain('regular - SOL 1000');
  });

  it('renders selected bot details', () => {
    mockEventBus.on.mockImplementation((event, callback) => {
      if (event === 'configUpdate') callback(mockConfigs);
    });

    const { lastFrame, stdin } = render(<ConfigList onBack={jest.fn()} />);
    stdin.write('\r'); // Select bot
    expect(lastFrame()).toContain('ID: test-bot');
    expect(lastFrame()).toContain('Type: Regular Bot');
    expect(lastFrame()).toContain('Input Token: Wrapped SOL');
    expect(lastFrame()).toContain('Output Token: USD Coin');
    expect(lastFrame()).toContain('Target Gain (%): 5');
  });

  it('handles delete action', async () => {
    mockEventBus.on.mockImplementation((event, callback) => {
      if (event === 'configUpdate') callback(mockConfigs);
    });

    const mockOnBack = jest.fn();
    const { stdin } = render(<ConfigList socket={mockEventBus} botManager={mockBotManager} />);
    stdin.write('\r'); // Select bot
    stdin.write('\u001b[A'); // Up arrow to select 'delete'
    stdin.write('\r'); // Confirm delete
    await new Promise(resolve => setTimeout(resolve, 0)); // Wait for async operations
    expect(useAppContext().cliSocket.stopBot).toHaveBeenCalledWith('test-bot-123');
    expect(useAppContext().cliSocket.deleteConfig).toHaveBeenCalledWith('test-bot-123', 'regular');
  });
});