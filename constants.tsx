
import { Card, CardType } from './types';

/**
 * ga-on/hwatu 저장소의 이미지를 JSDelivr CDN을 통해 로드합니다.
 * 1.png ~ 48.png 구조이며, 각 월별로 4장씩 배치됩니다.
 */
const BASE_URL = "https://cdn.jsdelivr.net/gh/ga-on/hwatu@master/images/";
export const HWATU_BACK_IMAGE = `${BASE_URL}back.png`; // 뒷면 이미지 (만약 없으면 빨간색 폴백)

const getCardType = (month: number, index: number): CardType => {
  // 일반적인 화투 구성에 따른 타입 매핑 (월별 순서: 보통 광/열 -> 띠 -> 피 -> 피)
  if (month === 1 && index === 1) return 'Kwang';
  if (month === 3 && index === 1) return 'Kwang';
  if (month === 8 && index === 1) return 'Kwang';
  if (month === 11 && index === 1) return 'Kwang';
  if (month === 12 && index === 1) return 'Kwang';
  
  if (month === 11 && index === 2) return 'SsangPi';
  if (month === 12 && index === 4) return 'SsangPi';
  if (month === 9 && index === 1) return 'Yul'; // 국진 (열끗이자 쌍피로 쓰임)

  if (index === 2) return 'Tti';
  if (index === 1) return 'Yul';
  return 'Pi';
};

export const INITIAL_DECK: Card[] = Array.from({ length: 48 }, (_, i) => {
  const id = i + 1;
  const month = Math.ceil(id / 4);
  const index = ((id - 1) % 4) + 1;
  return {
    id,
    month,
    type: getCardType(month, index),
    image: `${BASE_URL}${id}.png`
  };
});
