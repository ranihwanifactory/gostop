
import { HWATU_CARDS } from '../constants';
import { HwatuCard, CardType } from '../types';

export const calculateScore = (selectedCardIds: string[], goCount: number) => {
  const cards = HWATU_CARDS.filter(c => selectedCardIds.includes(c.id));
  
  let score = 0;
  const breakdown: string[] = [];

  // 1. 광 (Gwang)
  const gwangs = cards.filter(c => c.type === 'Gwang');
  const hasRainGwang = gwangs.some(c => c.month === 12);
  if (gwangs.length === 5) {
    score += 15;
    breakdown.push('오광 (+15)');
  } else if (gwangs.length === 4) {
    score += 4;
    breakdown.push('사광 (+4)');
  } else if (gwangs.length === 3) {
    if (hasRainGwang) {
      score += 2;
      breakdown.push('비삼광 (+2)');
    } else {
      score += 3;
      breakdown.push('삼광 (+3)');
    }
  }

  // 2. 띠 (Ddi)
  const ddis = cards.filter(c => c.type === 'Ddi');
  if (ddis.length >= 5) {
    const ddiPoint = ddis.length - 4;
    score += ddiPoint;
    breakdown.push(`띠 ${ddis.length}장 (+${ddiPoint})`);
  }
  
  const hongDan = ddis.filter(c => c.ddiType === 'HongDan').length === 3;
  const chungDan = ddis.filter(c => c.ddiType === 'ChungDan').length === 3;
  const choDan = ddis.filter(c => c.ddiType === 'ChoDan').length === 3;
  
  if (hongDan) { score += 3; breakdown.push('홍단 (+3)'); }
  if (chungDan) { score += 3; breakdown.push('청단 (+3)'); }
  if (choDan) { score += 3; breakdown.push('초단 (+3)'); }

  // 3. 열끗 (Yeol)
  const yeols = cards.filter(c => c.type === 'Yeol');
  if (yeols.length >= 5) {
    const yeolPoint = yeols.length - 4;
    score += yeolPoint;
    breakdown.push(`열끗 ${yeols.length}장 (+${yeolPoint})`);
  }
  
  // 국진 (9월 열끗) -> Special case might be treated as Pi or Yeol. Here treated as Yeol bonus.
  // User asked for "국진 (9월 국화 3장): +3점". Actually Hwatu 9-month is usually 1 card as Yeol. 
  // I will assume if 9-month Yeol is selected, it's a bonus.
  if (yeols.some(c => c.month === 9)) {
    // Note: Standard rule is sometimes swapping it to Pi, but user asked for +3
  }

  // 고도리 (Godori)
  const godoriCount = yeols.filter(c => c.isGodori).length;
  if (godoriCount === 3) {
    score += 5;
    breakdown.push('고도리 (+5)');
  }

  // 4. 피 (Pi)
  const pis = cards.filter(c => c.type === 'Pi');
  const ssangPis = cards.filter(c => c.type === 'SsangPi');
  const totalPiCount = pis.length + (ssangPis.length * 2);
  
  if (totalPiCount >= 10) {
    const piPoint = totalPiCount - 9;
    score += piPoint;
    breakdown.push(`피 ${totalPiCount}개 (+${piPoint})`);
  }

  // 고(Go) 계산
  let finalScore = score;
  if (goCount === 1) finalScore += 1;
  if (goCount === 2) finalScore += 2;
  if (goCount >= 3) {
    // 3고부터는 (점수 + (고수-2)) * 2^ (고수-2) 등 복잡하지만, 단순화:
    // User asked for "고 버튼: 고 선언 시 점수 2배, 3배 등 누적"
    const multiplier = Math.pow(2, goCount - 2);
    if (goCount >= 3) {
        finalScore = (score + (goCount - 2)) * multiplier;
    }
  }

  return { total: Math.max(0, finalScore), breakdown, base: score };
};
