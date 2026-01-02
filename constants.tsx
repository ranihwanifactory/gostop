
import { Card, CardType } from './types';

export const INITIAL_DECK: Card[] = [];

const createCard = (month: number, index: number, type: CardType, name: string, subType?: string): Card => {
  const card: any = {
    id: `${month}-${index}-${Math.random().toString(36).substr(2, 9)}`,
    month,
    index,
    type,
    points: type === CardType.GWANG ? 20 : type === CardType.TTI ? 5 : type === CardType.YUL ? 10 : 1,
    name,
  };
  
  // Firebase does not allow 'undefined'. Use null or omit the key.
  if (subType) {
    card.subType = subType;
  }
  
  return card as Card;
};

// Populate months 1-12 (4 cards per month)
for (let m = 1; m <= 12; m++) {
  if (m === 1) { // Jan
    INITIAL_DECK.push(createCard(m, 1, CardType.GWANG, '송학 광'));
    INITIAL_DECK.push(createCard(m, 2, CardType.TTI, '송학 홍단', 'Hong-dan'));
    INITIAL_DECK.push(createCard(m, 3, CardType.PE, '송학 피 1'));
    INITIAL_DECK.push(createCard(m, 4, CardType.PE, '송학 피 2'));
  } else if (m === 3) { // Mar
    INITIAL_DECK.push(createCard(m, 1, CardType.GWANG, '벚꽃 광'));
    INITIAL_DECK.push(createCard(m, 2, CardType.TTI, '벚꽃 홍단', 'Hong-dan'));
    INITIAL_DECK.push(createCard(m, 3, CardType.PE, '벚꽃 피 1'));
    INITIAL_DECK.push(createCard(m, 4, CardType.PE, '벚꽃 피 2'));
  } else if (m === 8) { // Aug
    INITIAL_DECK.push(createCard(m, 1, CardType.GWANG, '공산 광'));
    INITIAL_DECK.push(createCard(m, 2, CardType.YUL, '공산 고도리'));
    INITIAL_DECK.push(createCard(m, 3, CardType.PE, '공산 피 1'));
    INITIAL_DECK.push(createCard(m, 4, CardType.PE, '공산 피 2'));
  } else if (m === 11) { // Nov
    INITIAL_DECK.push(createCard(m, 1, CardType.GWANG, '오동 광'));
    INITIAL_DECK.push(createCard(m, 2, CardType.PE, '오동 쌍피', 'Ssang-pe'));
    INITIAL_DECK.push(createCard(m, 3, CardType.PE, '오동 피 1'));
    INITIAL_DECK.push(createCard(m, 4, CardType.PE, '오동 피 2'));
  } else if (m === 12) { // Dec
    INITIAL_DECK.push(createCard(m, 1, CardType.GWANG, '비 광'));
    INITIAL_DECK.push(createCard(m, 2, CardType.YUL, '비 끗'));
    INITIAL_DECK.push(createCard(m, 3, CardType.TTI, '비 띠'));
    INITIAL_DECK.push(createCard(m, 4, CardType.PE, '비 쌍피', 'Ssang-pe'));
  } else {
    // Generic setup for other months
    INITIAL_DECK.push(createCard(m, 1, m % 3 === 0 ? CardType.YUL : CardType.TTI, `${m}월 특수`));
    INITIAL_DECK.push(createCard(m, 2, CardType.PE, `${m}월 피 1`));
    INITIAL_DECK.push(createCard(m, 3, CardType.PE, `${m}월 피 2`));
    INITIAL_DECK.push(createCard(m, 4, CardType.PE, `${m}월 피 3`));
  }
}

export const MONTH_NAMES = [
  "송학 (1월)", "매조 (2월)", "벚꽃 (3월)", "흑싸리 (4월)", 
  "난초 (5월)", "모란 (6월)", "홍싸리 (7월)", "공산 (8월)", 
  "국진 (9월)", "단풍 (10월)", "오동 (11월)", "비 (12월)"
];
