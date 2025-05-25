// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/js-with-ts-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  // Ensure CommonJS dependencies are handled
  moduleNameMapper: {
    '^axios$': '<rootDir>/node_modules/axios/dist/axios.min.js',
    '^(\\.{1,2}/.*)\\.js$': '$1', // Strip .js extensions for ESM imports
  },
    "resolver": undefined,
  // Enable source maps for better debugging
  transformIgnorePatterns: [],
};

export default config;