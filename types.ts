
export type CardType = 'Kwang' | 'Yul' | 'Tti' | 'Pi' | 'SsangPi';

export interface Card {
  id: number;
  month: number;
  type: CardType;
  image: string;
  altImage?: string; // 대체 이미지 소스
  name: string;      // 1월 송학, 3월 사쿠라 등
  color: string;     // 월별 대표 색상
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
  turn: string;
  deck: Card[];
  field: Card[];
  lastUpdate: number;
}
