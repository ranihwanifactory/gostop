
import { Card, CardType } from './types';

// Simplified Hanafuda Deck (12 Months * 4 Cards)
export const INITIAL_DECK: Card[] = [];

const createCard = (month: number, type: CardType, name: string, subType?: string): Card => ({
  id: `${month}-${name}-${Math.random().toString(36).substr(2, 9)}`,
  month,
  type,
  points: type === CardType.GWANG ? 20 : type === CardType.TTI ? 5 : type === CardType.YUL ? 10 : 1,
  name,
  subType
});

// Populate months 1-12
for (let m = 1; m <= 12; m++) {
  if (m === 1) { // Jan
    INITIAL_DECK.push(createCard(m, CardType.GWANG, 'Crane'));
    INITIAL_DECK.push(createCard(m, CardType.TTI, 'Hong-dan', 'Hong-dan'));
    INITIAL_DECK.push(createCard(m, CardType.PE, 'Junk 1'));
    INITIAL_DECK.push(createCard(m, CardType.PE, 'Junk 2'));
  } else if (m === 3) { // Mar
    INITIAL_DECK.push(createCard(m, CardType.GWANG, 'Cherry Blossom'));
    INITIAL_DECK.push(createCard(m, CardType.TTI, 'Hong-dan', 'Hong-dan'));
    INITIAL_DECK.push(createCard(m, CardType.PE, 'Junk 1'));
    INITIAL_DECK.push(createCard(m, CardType.PE, 'Junk 2'));
  } else if (m === 8) { // Aug
    INITIAL_DECK.push(createCard(m, CardType.GWANG, 'Moon'));
    INITIAL_DECK.push(createCard(m, CardType.YUL, 'Geese'));
    INITIAL_DECK.push(createCard(m, CardType.PE, 'Junk 1'));
    INITIAL_DECK.push(createCard(m, CardType.PE, 'Junk 2'));
  } else if (m === 11) { // Nov
    INITIAL_DECK.push(createCard(m, CardType.GWANG, 'Paulownia'));
    INITIAL_DECK.push(createCard(m, CardType.PE, 'Double Junk 1'));
    INITIAL_DECK.push(createCard(m, CardType.PE, 'Junk 2'));
    INITIAL_DECK.push(createCard(m, CardType.PE, 'Junk 3'));
  } else if (m === 12) { // Dec
    INITIAL_DECK.push(createCard(m, CardType.GWANG, 'Rain'));
    INITIAL_DECK.push(createCard(m, CardType.YUL, 'Swallow'));
    INITIAL_DECK.push(createCard(m, CardType.TTI, 'Rain Ribbon'));
    INITIAL_DECK.push(createCard(m, CardType.PE, 'Double Junk'));
  } else {
    // Other months generic
    INITIAL_DECK.push(createCard(m, m % 3 === 0 ? CardType.YUL : CardType.TTI, `Special ${m}`));
    INITIAL_DECK.push(createCard(m, CardType.PE, `Junk ${m}-1`));
    INITIAL_DECK.push(createCard(m, CardType.PE, `Junk ${m}-2`));
    INITIAL_DECK.push(createCard(m, CardType.PE, `Junk ${m}-3`));
  }
}

export const MONTH_NAMES = [
  "송학 (1월)", "매조 (2월)", "벚꽃 (3월)", "흑싸리 (4월)", 
  "난초 (5월)", "모란 (6월)", "홍싸리 (7월)", "공산 (8월)", 
  "국진 (9월)", "단풍 (10월)", "오동 (11월)", "비 (12월)"
];
