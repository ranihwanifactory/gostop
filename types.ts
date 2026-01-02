
export type CardType = 'Kwang' | 'Yul' | 'Tti' | 'Pi' | 'SsangPi';

export interface Card {
  id: number;
  month: number;
  type: CardType;
  image: string;
}

export interface Player {
  uid: string;
  name: string;
  photo: string;
  hand: Card[];
  captured: Card[];
  score: number;
}

export interface GameRoom {
  id: string;
  name: string;
  hostId: string;
  status: 'waiting' | 'playing' | 'finished';
  players: Record<string, Player>;
  turn: string; // uid of current player
  deck: Card[];
  field: Card[];
  lastUpdate: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
}
