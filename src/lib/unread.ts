import { createContext, useContext } from 'react';

/** Unread counts for the top menu (Ali's change list 3, item 1): Inbox pings and new messages. */
export interface Unread {
  inbox: number;
  messages: number;
}
export const UnreadContext = createContext<Unread>({ inbox: 0, messages: 0 });
export function useUnread(): Unread {
  return useContext(UnreadContext);
}
