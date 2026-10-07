import { useEffect } from 'react';

/** Sets the browser tab title while the page is open and puts the previous one back when it closes. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
