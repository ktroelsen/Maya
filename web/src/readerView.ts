import { useCallback, useState } from 'react';

/** While reading aloud: scroll along with the text, or keep a slideshow of the section's picture on screen. */
export type ReaderView = 'follow' | 'pictures';

const Key = 'reader.view';

function load(): ReaderView {
  try {
    return localStorage.getItem(Key) === 'pictures' ? 'pictures' : 'follow';
  } catch {
    return 'follow';
  }
}

export function useReaderView() {
  const [view, setView] = useState<ReaderView>(load);
  const update = useCallback((next: ReaderView) => {
    setView(next);
    try {
      localStorage.setItem(Key, next);
    } catch {
      /* this session only */
    }
  }, []);
  return [view, update] as const;
}
