
export enum CardType {
  GWANG = 'GWANG', // Bright
  TTI = 'TTI',     // Ribbon
  YUL = 'YUL',     // Animal/Special
  PE = 'PE'        // Junk
}

export interface Card {
  id: string;
  month: number;
  type: CardType;
  points: number;
  name: string;
  subType?: string; // e.g., 'Hong-dan', 'Cho-dan'
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  captured: Card[];
  score: number;
  goCount: number;
}

export interface GameState {
  deck: Card[];
  floor: Card[];
  players: Player[];
  currentPlayerIndex: number;
  isGameOver: boolean;
  winner: string | null;
  logs: string[];
}
