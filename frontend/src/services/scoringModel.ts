/**
 * Client-side mirror of the backend scoring rules (backend/app/services/scoring.py
 * and recommendations.py), used only by the interactive simulator on the
 * Overview page. The real product always scores on the server.
 */
import type { ActionCode, Priority } from '../types';

export type SignalKey =
  | 'DEMO_REQUEST'
  | 'PRICING_PAGE_VIEW'
  | 'PRODUCT_PAGE_VIEW'
  | 'CONTENT_DOWNLOAD'
  | 'HIRING_ACTIVITY'
  | 'COMPANY_EXPANSION'
  | 'DECISION_MAKER_ENGAGEMENT'
  | 'EMAIL_CLICK'
  | 'EMAIL_OPEN'
  | 'WEBSITE_VISIT';

export type RecencyBand = '24h' | '3d' | '7d' | '14d' | 'older';

interface Rule {
  label: string;
  intent?: [points: number, maxCounted: number];
  engagement?: [points: number, maxCounted: number];
}

export const RULES: Record<SignalKey, Rule> = {
  DEMO_REQUEST: { label: 'Demo request', intent: [15, 1] },
  PRICING_PAGE_VIEW: { label: 'Pricing page view', intent: [8, 2] },
  PRODUCT_PAGE_VIEW: { label: 'Product page view', intent: [4, 3] },
  CONTENT_DOWNLOAD: { label: 'Content download', intent: [3, 3], engagement: [3, 3] },
  HIRING_ACTIVITY: { label: 'Hiring activity', intent: [5, 1] },
  COMPANY_EXPANSION: { label: 'Company expansion', intent: [5, 1] },
  DECISION_MAKER_ENGAGEMENT: { label: 'Decision-maker engagement', engagement: [8, 2] },
  EMAIL_CLICK: { label: 'Email click', engagement: [4, 2] },
  EMAIL_OPEN: { label: 'Email open', engagement: [2, 3] },
  WEBSITE_VISIT: { label: 'Website visit', engagement: [1, 5] },
};

export const SIGNAL_ORDER = Object.keys(RULES) as SignalKey[];

export const RECENCY: { key: RecencyBand; label: string; points: number }[] = [
  { key: '24h', label: '≤ 24 hours', points: 20 },
  { key: '3d', label: '≤ 3 days', points: 15 },
  { key: '7d', label: '≤ 7 days', points: 10 },
  { key: '14d', label: '≤ 14 days', points: 5 },
  { key: 'older', label: 'Older', points: 0 },
];

export interface SimInput {
  industryMatch: boolean;
  sizeMatch: boolean;
  counts: Record<SignalKey, number>;
  recency: RecencyBand;
  hasDecisionMaker: boolean;
}

export interface SimResult {
  fit: number;
  intent: number;
  engagement: number;
  recency: number;
  total: number;
  priority: Priority;
  intentRaw: number;
  engagementRaw: number;
  capped: SignalKey[];
  action: ActionCode;
  actionLabel: string;
  actionWhy: string;
}

export const emptyCounts = (): Record<SignalKey, number> =>
  Object.fromEntries(SIGNAL_ORDER.map((k) => [k, 0])) as Record<SignalKey, number>;

export function priorityFor(total: number): Priority {
  return total >= 80 ? 'HIGH' : total >= 50 ? 'MEDIUM' : 'LOW';
}

export function simulate(input: SimInput): SimResult {
  const fit = (input.industryMatch ? 15 : 0) + (input.sizeMatch ? 15 : 0);
  let intentRaw = 0;
  let engagementRaw = 0;
  const capped: SignalKey[] = [];
  for (const key of SIGNAL_ORDER) {
    const n = input.counts[key];
    const r = RULES[key];
    if (r.intent) {
      intentRaw += Math.min(n, r.intent[1]) * r.intent[0];
      if (n > r.intent[1]) capped.push(key);
    }
    if (r.engagement) {
      engagementRaw += Math.min(n, r.engagement[1]) * r.engagement[0];
      if (n > r.engagement[1] && !capped.includes(key)) capped.push(key);
    }
  }
  const intent = Math.min(30, intentRaw);
  const engagement = Math.min(20, engagementRaw);

  // Recency needs at least one "meaningful" signal: email opens never count.
  const meaningful = SIGNAL_ORDER.some((k) => k !== 'EMAIL_OPEN' && input.counts[k] > 0);
  const recency = meaningful ? RECENCY.find((b) => b.key === input.recency)!.points : 0;
  const total = Math.max(0, Math.min(100, fit + intent + engagement + recency));
  const priority = priorityFor(total);

  const signalCount = SIGNAL_ORDER.reduce((s, k) => s + input.counts[k], 0);
  let action: ActionCode;
  let actionLabel: string;
  let actionWhy: string;
  if (signalCount === 0) {
    action = 'MONITOR_ACCOUNT';
    actionLabel = 'Monitor account';
    actionWhy = 'No activity yet, so outreach would be premature.';
  } else if (input.counts.DEMO_REQUEST > 0) {
    action = 'SCHEDULE_DEMO';
    actionLabel = 'Schedule demo';
    actionWhy = 'An explicit demo request overrides every other rule.';
  } else if (priority === 'HIGH' && intent >= 15) {
    if (input.hasDecisionMaker) {
      action = 'CONTACT_DECISION_MAKER';
      actionLabel = 'Contact decision-maker';
      actionWhy = 'High score + strong intent + a decision-maker on file.';
    } else {
      action = 'SEND_PERSONALIZED_EMAIL';
      actionLabel = 'Send personalized email';
      actionWhy = 'Strong intent, but no decision-maker on file, so engage the best available contact.';
    }
  } else if ((priority === 'HIGH' || priority === 'MEDIUM') && (engagement >= 6 || intent >= 8)) {
    action = 'SEND_PERSONALIZED_EMAIL';
    actionLabel = 'Send personalized email';
    actionWhy = 'Moderate engagement: turn interest into a conversation.';
  } else if (signalCount < 2 && intent === 0) {
    action = 'MONITOR_ACCOUNT';
    actionLabel = 'Monitor account';
    actionWhy = 'A single low-value signal is not enough evidence.';
  } else {
    action = 'NURTURE_ACCOUNT';
    actionLabel = 'Add to nurture';
    actionWhy = 'Weak signals: keep the account warm with relevant content.';
  }

  return { fit, intent, engagement, recency, total, priority, intentRaw, engagementRaw, capped, action, actionLabel, actionWhy };
}

const counts = (partial: Partial<Record<SignalKey, number>>) => ({ ...emptyCounts(), ...partial });

export const PRESETS: { key: string; label: string; hint: string; input: SimInput }[] = [
  {
    key: 'acme-yesterday',
    label: 'Acme · yesterday',
    hint: 'Marketing engagement only',
    input: {
      industryMatch: true,
      sizeMatch: true,
      counts: counts({ EMAIL_OPEN: 2, EMAIL_CLICK: 1, WEBSITE_VISIT: 3 }),
      recency: '24h',
      hasDecisionMaker: true,
    },
  },
  {
    key: 'acme-today',
    label: 'Acme · today',
    hint: '+ pricing, doc, hiring, VP engagement',
    input: {
      industryMatch: true,
      sizeMatch: true,
      counts: counts({
        EMAIL_OPEN: 2,
        EMAIL_CLICK: 1,
        WEBSITE_VISIT: 3,
        HIRING_ACTIVITY: 1,
        CONTENT_DOWNLOAD: 1,
        PRICING_PAGE_VIEW: 1,
        DECISION_MAKER_ENGAGEMENT: 1,
      }),
      recency: '24h',
      hasDecisionMaker: true,
    },
  },
  {
    key: 'spam',
    label: 'Bot spam',
    hint: '40 pricing views, 200 visits',
    input: {
      industryMatch: false,
      sizeMatch: false,
      counts: counts({ PRICING_PAGE_VIEW: 40, WEBSITE_VISIT: 200 }),
      recency: '24h',
      hasDecisionMaker: false,
    },
  },
  {
    key: 'demo',
    label: 'Demo request',
    hint: 'Good fit, one explicit ask',
    input: { industryMatch: true, sizeMatch: true, counts: counts({ DEMO_REQUEST: 1 }), recency: '24h', hasDecisionMaker: true },
  },
  {
    key: 'cold',
    label: 'Cold account',
    hint: 'Perfect fit, no activity',
    input: { industryMatch: true, sizeMatch: true, counts: counts({}), recency: 'older', hasDecisionMaker: true },
  },
];
