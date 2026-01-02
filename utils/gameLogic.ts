
import { Card, CardType, Player } from '../types';

export const shuffle = <T,>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

export const calculateScore = (captured: Card[]): number => {
  let score = 0;
  
  const gwang = captured.filter(c => c.type === CardType.GWANG);
  const tti = captured.filter(c => c.type === CardType.TTI);
  const yul = captured.filter(c => c.type === CardType.YUL);
  const pe = captured.filter(c => c.type === CardType.PE);

  // Gwang scoring
  if (gwang.length === 5) score += 15;
  else if (gwang.length === 4) score += 4;
  else if (gwang.length === 3) {
    const hasRainGwang = gwang.some(c => c.month === 12);
    score += hasRainGwang ? 2 : 3;
  }

  // Tti scoring
  if (tti.length >= 5) score += (tti.length - 4);
  const hongDan = tti.filter(c => c.subType === 'Hong-dan');
  if (hongDan.length === 3) score += 3;
  // (Simplified: Add more Dan rules here)

  // Yul scoring
  if (yul.length >= 5) score += (yul.length - 4);
  const godori = yul.filter(c => [2, 4, 8].includes(c.month)); // Bird months
  if (godori.length === 3) score += 5;

  // Pe scoring
  let junkCount = pe.length;
  // Double junks
  pe.forEach(c => { if (c.name.includes('Double Junk')) junkCount++; });
  if (junkCount >= 10) score += (junkCount - 9);

  return score;
};

export const findMatches = (card: Card, floor: Card[]): Card[] => {
  return floor.filter(f => f.month === card.month);
};
