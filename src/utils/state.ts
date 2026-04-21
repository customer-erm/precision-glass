export type ServiceType = 'showers' | 'railings' | 'commercial' | null;
export type AgentState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';
export type InteractionMode = 'voice' | 'chat' | 'browse' | null;

interface AppState {
  currentService: ServiceType;
  agentState: AgentState;
  customerName: string;
  customerEmail: string;
  isTransformed: boolean;
  currentHighlight: string | null;
  currentMode: InteractionMode;
}

type Listener = (state: AppState) => void;

const state: AppState = {
  currentService: null,
  agentState: 'idle',
  customerName: '',
  customerEmail: '',
  isTransformed: false,
  currentHighlight: null,
  currentMode: null,
};

const listeners: Listener[] = [];

export function getState(): Readonly<AppState> {
  return state;
}

export function setState(partial: Partial<AppState>): void {
  Object.assign(state, partial);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
