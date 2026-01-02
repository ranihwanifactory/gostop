
import { Card, CardType } from './types';

// 더 안정적인 이미지 소스로 교체
export const HWATU_BACK_IMAGE = "https://raw.githubusercontent.com/ga-on/hwatu/master/images/back.png";

const createCard = (id: number, month: number, type: CardType): Card => ({
  id,
  month,
  type,
  image: `https://raw.githubusercontent.com/ga-on/hwatu/master/images/${id}.png`
});

export const INITIAL_DECK: Card[] = [
  // Month 1 (Pine)
  createCard(1, 1, 'Kwang'), createCard(2, 1, 'Tti'), createCard(3, 1, 'Pi'), createCard(4, 1, 'Pi'),
  // Month 2 (Plum)
  createCard(5, 2, 'Yul'), createCard(6, 2, 'Tti'), createCard(7, 2, 'Pi'), createCard(8, 2, 'Pi'),
  // Month 3 (Cherry)
  createCard(9, 3, 'Kwang'), createCard(10, 3, 'Tti'), createCard(11, 3, 'Pi'), createCard(12, 3, 'Pi'),
  // Month 4 (Wisteria)
  createCard(13, 4, 'Yul'), createCard(14, 4, 'Tti'), createCard(15, 4, 'Pi'), createCard(16, 4, 'Pi'),
  // Month 5 (Iris)
  createCard(17, 5, 'Yul'), createCard(18, 5, 'Tti'), createCard(19, 5, 'Pi'), createCard(20, 5, 'Pi'),
  // Month 6 (Peony)
  createCard(21, 6, 'Yul'), createCard(22, 6, 'Tti'), createCard(23, 6, 'Pi'), createCard(24, 6, 'Pi'),
  // Month 7 (Clover)
  createCard(25, 7, 'Yul'), createCard(26, 7, 'Tti'), createCard(27, 7, 'Pi'), createCard(28, 7, 'Pi'),
  // Month 8 (Pampas)
  createCard(29, 8, 'Kwang'), createCard(30, 8, 'Yul'), createCard(31, 8, 'Pi'), createCard(32, 8, 'Pi'),
  // Month 9 (Chrysanthemum)
  createCard(33, 9, 'Yul'), createCard(34, 9, 'Tti'), createCard(35, 9, 'Pi'), createCard(36, 9, 'Pi'),
  // Month 10 (Maple)
  createCard(37, 10, 'Yul'), createCard(38, 10, 'Tti'), createCard(39, 10, 'Pi'), createCard(40, 10, 'Pi'),
  // Month 11 (Paulownia)
  createCard(41, 11, 'Kwang'), createCard(42, 11, 'SsangPi'), createCard(43, 11, 'Pi'), createCard(44, 11, 'Pi'),
  // Month 12 (Willow)
  createCard(45, 12, 'Kwang'), createCard(46, 12, 'Yul'), createCard(47, 12, 'Tti'), createCard(48, 12, 'Pi'),
];
