
import { Card, CardType } from './types';

// 프로젝트 루트에 업로드된 로컬 이미지 파일들을 사용합니다.
// 파일명은 1.png, 2.png ... 48.png 형태입니다.
export const HWATU_BACK_IMAGE = "back.png"; // 뒷면 이미지가 있다면 사용

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
  if ([1, 3, 8, 11, 12].includes(month) && index === 1) return 'Kwang';
  if (month === 11 && index === 2) return 'SsangPi';
  if (month === 12 && index === 4) return 'SsangPi';
  if (month === 9 && index === 1) return 'Yul';
  if (index === 1 && ![1,3,8,11,12].includes(month)) return 'Yul';
  if (index === 2 && month !== 11) return 'Tti';
  if (month === 12 && index === 3) return 'Tti';
  return 'Pi';
};

export const INITIAL_DECK: Card[] = [];
for (let m = 1; m <= 12; m++) {
  for (let i = 1; i <= 4; i++) {
    const id = (m - 1) * 4 + i; // 1부터 48까지 생성
    const type = getCardType(m, i);
    INITIAL_DECK.push({
      id,
      month: m,
      type,
      name: MONTH_DATA[m].name,
      color: MONTH_DATA[m].color,
      // 업로드된 파일명 규칙(1.png, 2.png...)에 맞게 경로 설정
      image: `${id}.png`,
      altImage: `${id}.png` 
    });
  }
}
