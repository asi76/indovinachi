export type SessionStatus = 'draft' | 'lobby' | 'collecting' | 'ready' | 'revealing' | 'finished' | 'terminated';
export type RevealPhase = 'idle' | 'question' | 'answer' | 'complete';
export type QuestionMode = 'direct' | 'random';

export interface RevealAnswerEntry {
  playerId: string;
  nickname: string;
  avatar: string;
  text: string;
  startedAt?: string;
  votesShownAt?: string;
}

export interface GuessSummaryEntry {
  playerId: string;
  nickname: string;
  avatar: string;
  voteCount: number;
  percentage: number;
}

export interface RevealQuestionEntry {
  prompt: string;
  IT?: string;
  EN?: string;
  SV?: string;
  answers: RevealAnswerEntry[];
}

export type QuestionLanguage = 'IT' | 'EN' | 'SV';

export interface MultilingualQuestion {
  id: string;
  IT: string;
  EN: string;
  SV: string;
}

export interface IcebreakerSessionRecord {
  id: string;
  code: string;
  hostEmail: string;
  hostName: string;
  title: string;
  theme: string;
  status: SessionStatus;
  questions: string[];
  questionCount: number;
  questionMode: QuestionMode;
  assignedQuestionIds: string[];
  presenterToken: string;
  remoteToken: string;
  revealQueue: RevealQuestionEntry[];
  currentQuestionIndex: number;
  currentAnswerIndex: number;
  currentQuestionText: string;
  currentAnswerText: string;
  currentAnswerStartedAt: string;
  serverNow: string;
  clientReceivedAt?: number;
  revealPhase: RevealPhase;
  discoSpin: number;
  created: string;
  updated: string;
}

export interface PublicSessionView extends IcebreakerSessionRecord {
  playerCount: number;
  answeredCount: number;
  allAnswered: boolean;
  players: IcebreakerPlayerRecord[];
  currentAnswerPlayer: RevealAnswerEntry | null;
  currentAnswerPlayerVisible: boolean;
  currentGuessSummaryVisible: boolean;
  currentGuessSummary: GuessSummaryEntry[];
}

export interface IcebreakerPlayerRecord {
  id: string;
  sessionCode: string;
  nickname: string;
  avatar: string;
  questions?: MultilingualQuestion[];
  submitted: boolean;
  joinedAt: string;
  submittedAt?: string | null;
  created?: string;
  updated?: string;
}

export interface IcebreakerResponseRecord {
  id: string;
  sessionCode: string;
  playerId: string;
  playerNickname: string;
  playerAvatar: string;
  questionId?: string;
  questionIndex: number;
  questionText: string;
  answerText: string;
  submittedAt: string;
  created?: string;
  updated?: string;
}

export interface AuthSession {
  user: {
    email: string;
    name: string;
    picture?: string | null;
  };
  role: 'admin' | 'enabled';
}
