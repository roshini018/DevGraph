/**
 * Dev-only Mock Configuration State
 * Allows runtime simulation of slow network, forced empty responses, forced errors, and indexing failures.
 */

export interface MockControlsState {
  forceError: boolean;
  forceEmpty: boolean;
  forceIndexingFailure: boolean;
  slowNetwork: boolean;
}

const defaultState: MockControlsState = {
  forceError: false,
  forceEmpty: false,
  forceIndexingFailure: false,
  slowNetwork: false,
};

// Check localStorage for persisted dev settings if in browser
function getInitialState(): MockControlsState {
  if (typeof window === 'undefined') return defaultState;
  try {
    const saved = localStorage.getItem('devgraph_mock_controls');
    if (saved) {
      return { ...defaultState, ...JSON.parse(saved) };
    }
  } catch {
    // ignore
  }
  return defaultState;
}

let currentState: MockControlsState = getInitialState();
const listeners = new Set<(state: MockControlsState) => void>();

export function getMockControlsState(): MockControlsState {
  return currentState;
}

export function setMockControlsState(updates: Partial<MockControlsState>): void {
  currentState = { ...currentState, ...updates };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('devgraph_mock_controls', JSON.stringify(currentState));
    } catch {
      // ignore
    }
  }
  listeners.forEach(fn => fn(currentState));
}

export function subscribeMockControls(fn: (state: MockControlsState) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function resetMockControls(): void {
  setMockControlsState(defaultState);
}
