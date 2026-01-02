
import { Card, CardType } from './types';

/**
 * 전 세계적으로 가장 안정적인 화투 에셋인 hwatupedia 저장소를 사용합니다.
 * 파일명 규칙: {월}-{인덱스}.png (예: 1-1.png)
 */
const BASE_URL = "https://cdn.jsdelivr.net/gh/theeluwin/hwatupedia@master/images/";
export const HWATU_BACK_IMAGE = `${BASE_URL}back.png`;

const getCardType = (month: number, index: number): CardType => {
  // hwatupedia 에셋 인덱스 기준 매핑
  if (month === 1 && index === 1) return 'Kwang';
  if (month === 3 && index === 1) return 'Kwang';
  if (month === 8 && index === 1) return 'Kwang';
  if (month === 11 && index === 1) return 'Kwang';
  if (month === 12 && index === 1) return 'Kwang';
  
  if (month === 11 && index === 2) return 'SsangPi';
  if (month === 12 && index === 4) return 'SsangPi';
  if (month === 9 && index === 1) return 'Yul'; // 국진

  // 띠 (홍단/청단/초단)
  if ((month <= 3 && index === 2) || (month >= 4 && month <= 10 && index === 2) || (month === 12 && index === 3)) return 'Tti';
  
  // 열끗
  if (index === 1 && ![1,3,8,11,12].includes(month)) return 'Yul';
  
  return 'Pi';
};

export const INITIAL_DECK: Card[] = [];
for (let month = 1; month <= 12; month++) {
  for (let index = 1; index <= 4; index++) {
    const id = (month - 1) * 4 + index;
    INITIAL_DECK.push({
      id,
      month,
      type: getCardType(month, index),
      image: `${BASE_URL}${month}-${index}.png`
    });
  }
}
