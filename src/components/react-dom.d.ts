// Only createPortal is used (fixed-bar.web.tsx); avoids adding @types/react-dom for one call.
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react';
  export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactPortal;
}
