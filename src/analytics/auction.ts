import { useEffect, useRef } from 'react';

export type AuctionRole = 'seller' | 'buyer';
export type GoalParams = {
  role: AuctionRole;
  step: number;
  screen: string;
  flow_id?: string;
  attempt_id?: string;
  auction_id?: string;
  result?: string;
  source?: string;
  target_role?: AuctionRole;
};
export type GoalRecord = {
  event_id: string;
  goal: string;
  timestamp: number;
  params: GoalParams & {
    session_id: string;
    flow_id: string;
    event_id: string;
    timestamp_ms: number;
    prototype: true;
  };
};

declare global {
  interface Window {
    ym?: (counter: number, method: 'reachGoal', goal: string, params: GoalRecord['params']) => void;
    __auctionGoals?: GoalRecord[];
  }
}

// Replace with a real counter ID and initialize the official tag when connecting Metrika.
// Zero means local debug mode: no tag is loaded and no requests leave the browser.
export const METRIKA_COUNTER_ID: number = 0;
let fallbackSession = '';
const flows: Partial<Record<AuctionRole, string>> = {};
export const newEventId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function sessionId() {
  try {
    const saved = sessionStorage.getItem('auction-analytics-session');
    if (saved) return saved;
    const id = newEventId();
    sessionStorage.setItem('auction-analytics-session', id);
    return id;
  } catch {
    return (fallbackSession ||= newEventId());
  }
}

export function flowId(role: AuctionRole) {
  try {
    const key = `auction-analytics-flow-${role}`;
    const id = sessionStorage.getItem(key) || (flows[role] ||= newEventId());
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return (flows[role] ||= newEventId());
  }
}

export function restartFlow(role: AuctionRole) {
  flows[role] = newEventId();
  try {
    sessionStorage.setItem(`auction-analytics-flow-${role}`, flows[role]!);
  } catch {
    /* Works in memory. */
  }
}

export function trackGoal(goal: string, params: GoalParams) {
  const eventId = newEventId();
  const timestamp = Date.now();
  const record: GoalRecord = {
    event_id: eventId,
    goal,
    timestamp,
    params: {
      ...params,
      event_id: eventId,
      timestamp_ms: timestamp,
      session_id: sessionId(),
      flow_id: params.flow_id ?? flowId(params.role),
      prototype: true,
    },
  };
  // Bounded journal for local verification. No prices, addresses or personal data.
  window.__auctionGoals = [...(window.__auctionGoals ?? []).slice(-199), record];
  window.dispatchEvent(new CustomEvent('auction:goal', { detail: record }));
  if (METRIKA_COUNTER_ID > 0 && typeof window.ym === 'function') {
    try {
      window.ym(METRIKA_COUNTER_ID, 'reachGoal', goal, record.params);
    } catch {
      /* Analytics must not block the scenario. */
    }
  }
  return record;
}

export function useScreenGoal(
  role: AuctionRole,
  screen: string,
  step: number,
  preview = false,
  auctionId?: string,
) {
  const previous = useRef('');
  useEffect(() => {
    if (preview || previous.current === screen) return;
    previous.current = screen;
    trackGoal('auction_screen_view', { role, screen, step, auction_id: auctionId });
  }, [role, screen, step, preview, auctionId]);
}
