
import React from 'react';
import { Card } from '../types';

interface Props {
  card: Card;
  onClick?: () => void;
  isHidden?: boolean;
  isSmall?: boolean;
  className?: string;
}

const HanafudaCard: React.FC<Props> = ({ card, onClick, isHidden, isSmall, className }) => {
  // Real Hanafuda Image mapping based on month and unique identifier
  // Using a stable public source for Hanafuda images
  const getImageUrl = () => {
    if (isHidden) return "https://raw.githubusercontent.com/shun-shun/hanafuda/master/images/cards/back.png";
    
    // We derive an index 1-4 for the month based on the id/name
    const cardIndex = card.name.includes('1') ? 1 : card.name.includes('2') ? 2 : card.name.includes('3') ? 3 : 4;
    const monthStr = card.month.toString().padStart(2, '0');
    
    // Fallback logic for various types
    return `https://raw.githubusercontent.com/shun-shun/hanafuda/master/images/cards/${monthStr}-${cardIndex}.png`;
  };

  return (
    <div 
      onClick={onClick}
      className={`
        ${isSmall ? 'w-10 h-16' : 'w-16 h-24'} 
        relative flex flex-col items-center justify-center
        rounded-md overflow-hidden card-shadow
        ${onClick ? 'cursor-pointer hover:scale-110 hover:-translate-y-2 ring-2 ring-transparent hover:ring-yellow-400' : 'cursor-default'}
        transition-all duration-300 border border-black/20
        ${className}
      `}
    >
      <img 
        src={getImageUrl()} 
        alt={card.name} 
        className="w-full h-full object-cover"
        onError={(e) => {
            // Fallback if image fails
            (e.target as HTMLImageElement).src = "https://via.placeholder.com/64x96?text=" + card.month;
        }}
      />
      {!isHidden && (
         <div className="absolute top-0 left-0 bg-black/40 text-[8px] px-1 rounded-br">{card.month}월</div>
      )}
    </div>
  );
};

export default HanafudaCard;
