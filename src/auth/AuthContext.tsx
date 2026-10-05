import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Role = 'owner' | 'employee';

export type User = {
  id: string;
  name: string;
  role: Role;
};

export const FAKE_USERS: User[] = [
  { id: 'owner', name: 'Owner', role: 'owner' },
  { id: 'employee1', name: 'Employee 1', role: 'employee' },
  { id: 'employee2', name: 'Employee 2', role: 'employee' },
];

type AuthContextValue = {
  user: User | null;
  login: (userId: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Local-only auth state. Swap the login/logout bodies for Firebase Auth later.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = useCallback((userId: string) => {
    setUser(FAKE_USERS.find((u) => u.id === userId) ?? null);
  }, []);

  const logout = useCallback(() => setUser(null), []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
