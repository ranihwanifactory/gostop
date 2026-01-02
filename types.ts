
export type CardType = 'Gwang' | 'Ddi' | 'Yeol' | 'Pi' | 'SsangPi';
export type DdiType = 'HongDan' | 'ChungDan' | 'ChoDan' | 'Normal';

export interface HwatuCard {
  id: string;
  month: number;
  type: CardType;
  name: string;
  ddiType?: DdiType;
  isGodori?: boolean;
}

export interface PlayerState {
  uid: string;
  name: string;
  photoURL?: string;
  selectedCards: string[]; // Card IDs
  goCount: number;
  isShaken: boolean;
  score: number;
  isWinner: boolean;
}

export interface GameRoom {
  roomId: string;
  hostId: string;
  status: 'waiting' | 'playing' | 'ended';
  players: { [uid: string]: PlayerState };
  playerLimit: 2 | 3;
}
