
import { Card, CardType } from './types';

// 가장 안정적인 Hwatu 이미지 오픈소스 에셋 경로
const BASE_URL = "https://raw.githubusercontent.com/theeluwin/hwatupedia/master/images/";
export const HWATU_BACK_IMAGE = `${BASE_URL}back.png`;

// month-index.png 구조로 되어 있는 이미지 소스에 맞춰 생성
const createCard = (id: number, month: number, index: number, type: CardType): Card => ({
  id,
  month,
  type,
  image: `${BASE_URL}${month}-${index}.png`
});

export const INITIAL_DECK: Card[] = [
  // 1월 (송학): 광, 홍단, 피, 피
  createCard(1, 1, 1, 'Kwang'), createCard(2, 1, 2, 'Tti'), createCard(3, 1, 3, 'Pi'), createCard(4, 1, 4, 'Pi'),
  // 2월 (매조): 열끗, 홍단, 피, 피
  createCard(5, 2, 1, 'Yul'), createCard(6, 2, 2, 'Tti'), createCard(7, 2, 3, 'Pi'), createCard(8, 2, 4, 'Pi'),
  // 3월 (벚꽃): 광, 홍단, 피, 피
  createCard(9, 3, 1, 'Kwang'), createCard(10, 3, 2, 'Tti'), createCard(11, 3, 3, 'Pi'), createCard(12, 3, 4, 'Pi'),
  // 4월 (흑싸리): 열끗, 초단, 피, 피
  createCard(13, 4, 1, 'Yul'), createCard(14, 4, 2, 'Tti'), createCard(15, 4, 3, 'Pi'), createCard(16, 4, 4, 'Pi'),
  // 5월 (난초): 열끗, 초단, 피, 피
  createCard(17, 5, 1, 'Yul'), createCard(18, 5, 2, 'Tti'), createCard(19, 5, 3, 'Pi'), createCard(20, 5, 4, 'Pi'),
  // 6월 (모란): 열끗, 청단, 피, 피
  createCard(21, 6, 1, 'Yul'), createCard(22, 6, 2, 'Tti'), createCard(23, 6, 3, 'Pi'), createCard(24, 6, 4, 'Pi'),
  // 7월 (홍싸리): 열끗, 초단, 피, 피
  createCard(25, 7, 1, 'Yul'), createCard(26, 7, 2, 'Tti'), createCard(27, 7, 3, 'Pi'), createCard(28, 7, 4, 'Pi'),
  // 8월 (공산명월): 광, 열끗, 피, 피
  createCard(29, 8, 1, 'Kwang'), createCard(30, 8, 2, 'Yul'), createCard(31, 8, 3, 'Pi'), createCard(32, 8, 4, 'Pi'),
  // 9월 (국화): 열끗, 청단, 피, 피
  createCard(33, 9, 1, 'Yul'), createCard(34, 9, 2, 'Tti'), createCard(35, 9, 3, 'Pi'), createCard(36, 9, 4, 'Pi'),
  // 10월 (단풍): 열끗, 청단, 피, 피
  createCard(37, 10, 1, 'Yul'), createCard(38, 10, 2, 'Tti'), createCard(39, 10, 3, 'Pi'), createCard(40, 10, 4, 'Pi'),
  // 11월 (오동): 광, 쌍피, 피, 피
  createCard(41, 11, 1, 'Kwang'), createCard(42, 11, 2, 'SsangPi'), createCard(43, 11, 3, 'Pi'), createCard(44, 11, 4, 'Pi'),
  // 12월 (비): 광, 열끗, 초단, 쌍피
  createCard(45, 12, 1, 'Kwang'), createCard(46, 12, 2, 'Yul'), createCard(47, 12, 3, 'Tti'), createCard(48, 12, 4, 'SsangPi'),
];
