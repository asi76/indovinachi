export type SessionStatus = 'draft' | 'lobby' | 'collecting' | 'ready' | 'revealing' | 'finished' | 'terminated';
export type RevealPhase = 'idle' | 'question' | 'answer' | 'complete';

export interface RevealAnswerEntry {
  playerId: string;
  nickname: string;
  avatar: string;
  text: string;
}

export interface RevealQuestionEntry {
  prompt: string;
  answers: RevealAnswerEntry[];
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
  presenterToken: string;
  remoteToken: string;
  revealQueue: RevealQuestionEntry[];
  currentQuestionIndex: number;
  currentAnswerIndex: number;
  currentQuestionText: string;
  currentAnswerText: string;
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
}

export interface IcebreakerPlayerRecord {
  id: string;
  sessionCode: string;
  nickname: string;
  avatar: string;
  submitted: boolean;
  joinedAt: string;
  submittedAt?: string | null;
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
