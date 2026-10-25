/**
 * DevGraph Central Application Store (Zustand)
 * Manages user authentication, repository selection, workspace tabs,
 * graph and impact selections, assistant conversations, and panel layouts.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConnectedRepo } from '../types/api';
import { MOCK_CONNECTED_REPO } from '../mocks/repo';

export interface User {
  id: string;
  username: string;
  name: string;
  avatar_url: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  verified?: boolean;
  latency_ms?: number;
  citations?: Array<{
    id: string;
    file_path: string;
    start_line: number;
    end_line: number;
    symbol: string;
    snippet: string;
    sources?: string[];
  }>;
}

export interface PanelStates {
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
}

export interface AppState {
  // Auth & Repo
  user: User | null;
  selectedRepo: ConnectedRepo | null;

  // Workspace Tabs & Active File
  openTabs: string[];
  activeFile: string | null;
  highlightRange: { startLine: number; endLine: number; timestamp: number } | null;

  // Selections
  multiSelection: string[];
  graphSelection: string | null;
  impactTargets: string[];

  // AI Assistant Conversation
  conversation: ChatMessage[];

  // Panel States
  panelStates: PanelStates;

  // Actions
  setUser: (user: User | null) => void;
  setSelectedRepo: (repo: ConnectedRepo | null) => void;
  openTab: (filePath: string) => void;
  closeTab: (filePath: string) => void;
  setActiveFile: (filePath: string | null) => void;
  openFile: (path: string, startLine?: number, endLine?: number) => void;
  clearHighlightRange: () => void;
  setMultiSelection: (items: string[]) => void;
  toggleMultiSelection: (item: string) => void;
  setGraphSelection: (nodeId: string | null) => void;
  setImpactTargets: (targets: string[]) => void;
  toggleImpactTarget: (target: string) => void;
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearConversation: () => void;

  // Panel actions
  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  setPanelDefaultsForRoute: (pathname: string) => void;

  // Reset / Disconnect
  disconnectGithub: () => void;
}

// Clean up any legacy localStorage entry containing 'varun' so stale browser cache is wiped
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const legacyKey = 'devgraph-app-store';
    const legacyVal = window.localStorage.getItem(legacyKey);
    if (legacyVal && /varun/i.test(legacyVal)) {
      const sanitized = legacyVal.replace(/varun/gi, 'roshini').replace(/Varun/g, 'Roshini');
      window.localStorage.setItem(legacyKey, sanitized);
      window.localStorage.setItem('devgraph-app-store-v2', sanitized);
    }
  }
} catch {
  // Ignore localStorage access restrictions
}

const DEFAULT_USER: User = {
  id: 'usr-acme-1',
  username: 'roshinireddy',
  name: 'Roshini Reddy',
  avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&fit=crop&crop=faces',
};

const DEFAULT_PANEL_STATES: PanelStates = {
  leftOpen: true,
  rightOpen: true,
  leftWidth: 260,
  rightWidth: 340,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Defaults: starts logged in with acme/my-store selected for immediate inspection
      user: DEFAULT_USER,
      selectedRepo: MOCK_CONNECTED_REPO,

      openTabs: ['src/api/orders.py', 'src/services/order_service.py'],
      activeFile: 'src/api/orders.py',
      highlightRange: null,

      multiSelection: [],
      graphSelection: null,
      impactTargets: ['place_order'],

      conversation: [],

      panelStates: DEFAULT_PANEL_STATES,

      setUser: user => set({ user }),
      setSelectedRepo: repo => {
        const current = get().selectedRepo;
        // When switching to a different repository, clear file/tab state that
        // belongs to the previous repo to avoid stale file loads.
        const isNewRepo =
          repo !== null &&
          current !== null &&
          current.full_name !== repo.full_name &&
          current.id !== repo.id;
        if (isNewRepo) {
          set({
            selectedRepo: repo,
            openTabs: [],
            activeFile: null,
            highlightRange: null,
            impactTargets: [],
            graphSelection: null,
            multiSelection: [],
          });
        } else {
          set({ selectedRepo: repo });
        }
      },

      openTab: filePath => {
        const { openTabs } = get();
        if (!openTabs.includes(filePath)) {
          set({ openTabs: [...openTabs, filePath], activeFile: filePath });
        } else {
          set({ activeFile: filePath });
        }
      },

      closeTab: filePath => {
        const { openTabs, activeFile } = get();
        const nextTabs = openTabs.filter(t => t !== filePath);
        let nextActive = activeFile;
        if (activeFile === filePath) {
          nextActive = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null;
        }
        set({ openTabs: nextTabs, activeFile: nextActive });
      },

      setActiveFile: filePath => set({ activeFile: filePath }),

      openFile: (filePath, startLine, endLine) => {
        const { openTabs } = get();
        const nextTabs = openTabs.includes(filePath) ? openTabs : [...openTabs, filePath];
        set({
          openTabs: nextTabs,
          activeFile: filePath,
          highlightRange:
            typeof startLine === 'number'
              ? {
                startLine,
                endLine: typeof endLine === 'number' ? endLine : startLine,
                timestamp: Date.now(),
              }
              : null,
        });
      },

      clearHighlightRange: () => set({ highlightRange: null }),

      setMultiSelection: items => set({ multiSelection: items }),

      toggleMultiSelection: item => {
        const { multiSelection } = get();
        if (multiSelection.includes(item)) {
          set({ multiSelection: multiSelection.filter(i => i !== item) });
        } else {
          set({ multiSelection: [...multiSelection, item] });
        }
      },

      setGraphSelection: nodeId => set({ graphSelection: nodeId }),

      setImpactTargets: targets => set({ impactTargets: targets }),

      toggleImpactTarget: target => {
        const { impactTargets } = get();
        if (impactTargets.includes(target)) {
          set({ impactTargets: impactTargets.filter(t => t !== target) });
        } else {
          set({ impactTargets: [...impactTargets, target] });
        }
      },

      addMessage: msg => {
        const newMsg: ChatMessage = {
          ...msg,
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
        };
        set(state => ({ conversation: [...state.conversation, newMsg] }));
      },

      clearConversation: () => set({ conversation: [] }),

      setLeftOpen: leftOpen =>
        set(state => ({ panelStates: { ...state.panelStates, leftOpen } })),

      setRightOpen: rightOpen =>
        set(state => ({ panelStates: { ...state.panelStates, rightOpen } })),

      toggleLeftPanel: () =>
        set(state => ({
          panelStates: {
            ...state.panelStates,
            leftOpen: !state.panelStates.leftOpen,
          },
        })),

      toggleRightPanel: () =>
        set(state => ({
          panelStates: {
            ...state.panelStates,
            rightOpen: !state.panelStates.rightOpen,
          },
        })),

      setLeftWidth: leftWidth =>
        set(state => ({
          panelStates: {
            ...state.panelStates,
            leftWidth: Math.max(180, Math.min(480, leftWidth)),
          },
        })),

      setRightWidth: rightWidth =>
        set(state => ({
          panelStates: {
            ...state.panelStates,
            rightWidth: Math.max(260, Math.min(600, rightWidth)),
          },
        })),

      setPanelDefaultsForRoute: (pathname: string) => {
        const isGraphOrImpactOrConn =
          pathname.includes('/graph') ||
          pathname.includes('/impact') ||
          pathname.includes('/connections');
        if (isGraphOrImpactOrConn) {
          // Defaults: Graph, Impact and Connections = both collapsed
          set(state => ({
            panelStates: {
              ...state.panelStates,
              leftOpen: false,
              rightOpen: false,
            },
          }));
        } else {
          // Default: Code = both open
          set(state => ({
            panelStates: {
              ...state.panelStates,
              leftOpen: true,
              rightOpen: true,
            },
          }));
        }
      },

      disconnectGithub: () => {
        set({
          user: null,
          selectedRepo: null,
          openTabs: [],
          activeFile: null,
          multiSelection: [],
          graphSelection: null,
        });
      },
    }),
    {
      name: 'devgraph-app-store',
      partialize: state => ({
        user: state.user,
        selectedRepo: state.selectedRepo,
        panelStates: state.panelStates,
        openTabs: state.openTabs,
        activeFile: state.activeFile,
      }),
    }
  )
);
