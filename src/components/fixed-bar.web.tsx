import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A bar fixed to the bottom of the browser viewport. It is rendered straight into <body>, outside the page's
 * scroll view and the navigator's screen container: any ancestor with a transform, filter or overflow turns
 * `position: fixed` into "fixed to that ancestor", which is what made the bar drift to the middle of the page.
 */
export function FixedBar({ bottom = 0, children }: { bottom?: number; children: ReactNode }) {
  if (typeof document === 'undefined') return <>{children}</>;
  return createPortal(<div style={{ position: 'fixed', left: 0, right: 0, bottom, zIndex: 100, boxSizing: 'border-box' }}>{children}</div>, document.body);
}
