import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
}

export interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: string;
}

interface ChatStore {
  sessions: ChatSession[];
  activeSessionId: string | null;
  createSession: (name?: string) => string;
  setActiveSession: (id: string) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  renameSession: (id: string, name: string) => void;
  deleteSession: (id: string) => void;
}

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  createSession: (name = 'New Chat') => {
    const id = generateId();
    const session: ChatSession = {
      id,
      name,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: id,
    }));
    return id;
  },
  setActiveSession: (id) => set({ activeSessionId: id }),
  addMessage: (sessionId, message) => set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === sessionId ? { ...s, messages: [...s.messages, message] } : s
    ),
  })),
  renameSession: (id, name) => set((state) => ({
    sessions: state.sessions.map((s) => (s.id === id ? { ...s, name } : s)),
  })),
  deleteSession: (id) => set((state) => {
    const sessions = state.sessions.filter((s) => s.id !== id);
    const activeSessionId =
      state.activeSessionId === id && sessions.length > 0 ? sessions[0].id : sessions.length ? sessions[0].id : null;
    return { sessions, activeSessionId };
  }),
}));
