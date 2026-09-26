export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
export type PriorityFilter = 'ALL' | Priority;
export type SortKey = 'score' | 'score_change' | 'recent_activity';

export type ActionCode =
  | 'CONTACT_DECISION_MAKER'
  | 'SEND_PERSONALIZED_EMAIL'
  | 'SCHEDULE_DEMO'
  | 'NURTURE_ACCOUNT'
  | 'MONITOR_ACCOUNT';

export interface Account {
  id: number;
  name: string;
  industry: string | null;
  employeeCount: number | null;
  website: string | null;
  targetIndustry: boolean | null;
  createdAt: string | null;
}

export interface ScoreBreakdown {
  fit: number;
  intent: number;
  engagement: number;
  recency: number;
  total: number;
  priority: Priority;
  calculatedAt: string;
}

export interface ScoreChange {
  current: number;
  previous: number | null;
  delta: number;
  previousAt: string | null;
  hasPrevious: boolean;
}

export interface SignalRef {
  id: number | null;
  activityType: string;
  title: string;
  detail: string | null;
  timestamp: string;
}

export interface AccountListItem extends Account {
  score: number;
  priority: Priority;
  scoreChange: ScoreChange;
  latestSignal: SignalRef | null;
  lastActivityAt: string | null;
  recommendedAction: { action: ActionCode; label: string };
}

export interface DashboardSummary {
  total: number;
  high: number;
  medium: number;
  low: number;
}

export interface AccountListResponse {
  accounts: AccountListItem[];
  summary: DashboardSummary;
}

export interface Contact {
  id: number | null;
  name: string;
  jobTitle: string | null;
  email: string | null;
  persona: string;
  isDecisionMaker: boolean;
  engaged: boolean;
  engagementCount: number;
  relevance: number;
}

export interface ContactsResponse {
  contacts: Contact[];
  primaryContact: Contact | null;
  message: string | null;
  decisionMakerMessage: string | null;
}

export interface ScoreComponent {
  key: 'fit' | 'intent' | 'engagement' | 'recency';
  label: string;
  points: number;
  max: number;
  lines: string[];
}

export interface ScorePoint {
  calculatedAt: string;
  total: number;
  fit: number;
  intent: number;
  engagement: number;
  recency: number;
}

export interface ScoreDetail {
  accountId: number;
  current: ScoreBreakdown;
  components: ScoreComponent[];
  change: ScoreChange;
  history: ScorePoint[];
  dataQuality: {
    futureActivities: number;
    duplicateActivities: number;
    outsideWindow: number;
    missingFields: string[];
  };
}

export interface ChangeDriver {
  label: string;
  points: number;
  kind: 'signal' | 'recency' | 'fit' | 'decay' | 'other';
  activityId: number | null;
  activityType: string | null;
  timestamp: string | null;
  note: string | null;
}

export interface WhatChanged {
  hasPrevious: boolean;
  previousScore: number | null;
  currentScore: number;
  delta: number;
  previousAt: string | null;
  drivers: ChangeDriver[];
  newSignalCount: number;
  zeroPointSignals: number;
  explanation: string;
}

export interface ProductInterest {
  product: string;
  confidence: 'high' | 'medium' | 'low' | 'none';
  evidence: string[];
  scores: Record<string, number>;
}

export interface NextAction {
  action: ActionCode;
  label: string;
  explanation: string;
  reasons: string[];
  target: Contact | null;
  notes: string[];
}

export interface TrendPoint {
  date: string;
  intent: number;
  engagement: number;
  trigger: number;
}

export interface Intelligence {
  account: Account;
  score: ScoreDetail;
  whatChanged: WhatChanged;
  productInterest: ProductInterest;
  contacts: ContactsResponse;
  nextBestAction: NextAction;
  activityTrend: TrendPoint[];
  signalStatus: { hasMeaningfulActivity: boolean; message: string | null };
  aiConfigured: boolean;
}

export interface TimelineItem {
  id: number;
  activityType: string;
  category: 'intent' | 'engagement' | 'trigger' | 'other';
  title: string;
  detail: string | null;
  timestamp: string;
  isFuture: boolean;
  countedInScore: boolean;
  excludedReason: string | null;
}

export interface TimelineResponse {
  accountId: number;
  items: TimelineItem[];
  message: string | null;
}

export interface AIAnalysis {
  summary: string;
  whyImportant: string;
  likelyNeed: string;
  recommendedPersona: string;
  nextBestAction: string;
  reasonForAction: string;
  personalizedMessage: string;
}

export interface AnalyzeResponse {
  status: 'ok' | 'unavailable';
  analysis: AIAnalysis | null;
  model: string | null;
  generatedAt: string;
  errorCode: string | null;
  message: string | null;
  deterministicNextAction: NextAction;
  groundingNotes: string[];
}

export interface ActivityCreate {
  activityType: string;
  timestamp: string;
  metadata: Record<string, string> | null;
}
