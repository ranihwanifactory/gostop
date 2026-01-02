
import { Card, CardType } from './types';

/**
 * 사용자가 업로드한 1.png ~ 48.png 파일을 사용합니다.
 * 배포 환경에 따라 도메인 루트가 다를 수 있으므로 상대 경로를 사용합니다.
 */
export const HWATU_BACK_IMAGE = "back.png";

const MONTH_DATA: Record<number, { name: string, color: string }> = {
  1: { name: '송학', color: '#e74c3c' },
  2: { name: '매조', color: '#ff7eb3' },
  3: { name: '벚꽃', color: '#ff9ff3' },
  4: { name: '흑싸리', color: '#2c3e50' },
  5: { name: '난초', color: '#3498db' },
  6: { name: '모란', color: '#9b59b6' },
  7: { name: '홍싸리', color: '#d35400' },
  8: { name: '공산명월', color: '#7f8c8d' },
  9: { name: '국진', color: '#f1c40f' },
  10: { name: '단풍', color: '#e67e22' },
  11: { name: '오동', color: '#2ecc71' },
  12: { name: '비', color: '#34495e' }
};

const getCardType = (month: number, index: number): CardType => {
  // 1 index based
  if ([1, 3, 8, 11, 12].includes(month) && index === 1) return 'Kwang';
  if (month === 11 && index === 2) return 'SsangPi';
  if (month === 12 && index === 4) return 'SsangPi';
  if (month === 9 && index === 1) return 'Yul'; // 국진은 열끗/피 선택 가능하나 기본 열끗 처리
  if (index === 1 && ![1,3,8,11,12].includes(month)) return 'Yul';
  if (index === 2 && month !== 11) return 'Tti';
  if (month === 12 && index === 3) return 'Tti';
  return 'Pi';
};

export const INITIAL_DECK: Card[] = [];
for (let m = 1; m <= 12; m++) {
  for (let i = 1; i <= 4; i++) {
    const id = (m - 1) * 4 + i;
    const type = getCardType(m, i);
    INITIAL_DECK.push({
      id,
      month: m,
      type,
      name: MONTH_DATA[m].name,
      color: MONTH_DATA[m].color,
      image: `${id}.png` // 상대 경로 사용
    });
  }
}
