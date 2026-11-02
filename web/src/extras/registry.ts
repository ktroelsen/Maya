import type { ComponentType } from 'react';

// Interactive extras a topic can switch on in topic.json ("extras": [{ id, title, … }]).
// The engine only knows the ids; each extra lives in its own folder and is loaded on demand.
export const extras: Record<string, () => Promise<{ default: ComponentType }>> = {
  'maya-kalender': () => import('./maya/CalendarExtra'),
  'maya-tal': () => import('./maya/NumbersExtra'),
};
