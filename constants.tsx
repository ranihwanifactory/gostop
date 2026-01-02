
import { Card, CardType } from './types';

/**
 * 이미지 로딩 실패를 방지하기 위해 Proxy 서버를 사용합니다.
 * weserv.nl은 이미지를 최적화하고 CORS 문제를 해결해주는 무료 프록시입니다.
 */
const GITHUB_RAW = "raw.githubusercontent.com/theeluwin/hwatupedia/master/images/";
const PROXY_URL = "https://images.weserv.nl/?url=";

const SOURCE_A = `${PROXY_URL}${GITHUB_RAW}`; // 1순위: 프록시 우회
const SOURCE_B = "https://cdn.jsdelivr.net/gh/theeluwin/hwatupedia@master/images/"; // 2순위: CDN

export const HWATU_BACK_IMAGE = `${SOURCE_A}back.png`;

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
    const id = (m - 1) * 4 + i;
    const type = getCardType(m, i);
    INITIAL_DECK.push({
      id,
      month: m,
      type,
      name: MONTH_DATA[m].name,
      color: MONTH_DATA[m].color,
      image: `${SOURCE_A}${m}-${i}.png`,
      altImage: `${SOURCE_B}${m}-${i}.png`
    });
  }
}
