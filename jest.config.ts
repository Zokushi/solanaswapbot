import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
    }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(ink-testing-library)/)'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Enable experimental VM modules
  testEnvironmentOptions: {
    nodeOptions: ['--experimental-vm-modules']
  }
};

export default config; 