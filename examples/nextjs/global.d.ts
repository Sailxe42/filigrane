// Lets TypeScript accept the Filigrane custom elements in React JSX.
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type CustomElement<A> = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & A;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ai-disclosure': CustomElement<{ model?: string; href?: string; dismissible?: boolean; remember?: string; variant?: 'banner' | 'compact' }>;
      'ai-label': CustomElement<{ kind?: 'generated' | 'modified'; model?: string; href?: string; variant?: 'badge' | 'overlay'; compact?: boolean }>;
    }
  }
}
