import React from 'react';
import { render } from 'ink-testing-library';
import { MainMenu } from '../cli/components/MainMenu.js';
import { jest, describe, it, expect } from '@jest/globals';

describe('MainMenu', () => {
  const mockOptions = [
    'Option 1',
    'Option 2',
    'Option 3'
  ];

  it('renders all options', () => {
    const { lastFrame } = render(<MainMenu options={mockOptions} selectedOption={0} />);
    expect(lastFrame()).toContain('Option 1');
    expect(lastFrame()).toContain('Option 2');
    expect(lastFrame()).toContain('Option 3');
  });

  it('shows selected option with > prefix', () => {
    const { lastFrame } = render(<MainMenu options={mockOptions} selectedOption={1} />);
    expect(lastFrame()).toContain('> Option 2');
  });

  it('shows unselected options with two spaces', () => {
    const { lastFrame } = render(<MainMenu options={mockOptions} selectedOption={1} />);
    expect(lastFrame()).toContain('  Option 1');
    expect(lastFrame()).toContain('  Option 3');
  });

  it('shows instruction text', () => {
    const { lastFrame } = render(<MainMenu options={mockOptions} selectedOption={0} />);
    expect(lastFrame()).toContain('Use ↑↓ arrows to select an option and Enter to confirm');
  });

  it('handles empty options array', () => {
    const { lastFrame } = render(<MainMenu options={[]} selectedOption={0} />);
    expect(lastFrame()).toContain('Use ↑↓ arrows to select an option and Enter to confirm');
  });

  it('handles out of bounds selected option', () => {
    const { lastFrame } = render(<MainMenu options={mockOptions} selectedOption={5} />);
    expect(lastFrame()).toContain('Option 1');
    expect(lastFrame()).toContain('Option 2');
    expect(lastFrame()).toContain('Option 3');
  });
}); 