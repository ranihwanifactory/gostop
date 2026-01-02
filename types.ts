
export enum CardType {
  GWANG = 'GWANG', // Bright
  TTI = 'TTI',     // Ribbon
  YUL = 'YUL',     // Animal/Special
  PE = 'PE'        // Junk
}

export interface Card {
  id: string;
  month: number;
  index: number; // 1 to 4 for image mapping
  type: CardType;
  points: number;
  name: string;
  subType?: string; // Optional: 'Hong-dan', 'Cho-dan', etc.
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
