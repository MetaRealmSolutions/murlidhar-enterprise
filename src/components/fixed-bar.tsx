import type { ReactNode } from 'react';

// Native: there is no browser viewport to fix to, so the bar stays in the page flow (see fixed-bar.web.tsx).
export function FixedBar({ children }: { bottom?: number; children: ReactNode }) {
  return <>{children}</>;
}
