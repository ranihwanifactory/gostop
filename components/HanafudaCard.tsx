
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
  const getImageUrl = () => {
    if (isHidden) return "https://raw.githubusercontent.com/shun-shun/hanafuda/master/images/cards/back.png";
    
    const monthStr = card.month.toString().padStart(2, '0');
    // Use the assigned index (1-4) for the specific image within the month
    return `https://raw.githubusercontent.com/shun-shun/hanafuda/master/images/cards/${monthStr}-${card.index}.png`;
  };

  return (
    <div 
      onClick={onClick}
      className={`
        ${isSmall ? 'w-10 h-16' : 'w-16 h-24'} 
        relative flex flex-col items-center justify-center
        rounded-md overflow-hidden shadow-lg
        ${onClick ? 'cursor-pointer hover:scale-110 hover:-translate-y-2 ring-2 ring-transparent hover:ring-yellow-400' : 'cursor-default'}
        transition-all duration-300 border border-black/20 bg-white
        ${className}
      `}
    >
      <img 
        src={getImageUrl()} 
        alt={card.name || 'Hanafuda Card'} 
        className="w-full h-full object-cover"
        loading="lazy"
        onError={(e) => {
            (e.target as HTMLImageElement).src = `https://via.placeholder.com/64x96?text=${card.month}-${card.index}`;
        }}
      />
      {!isHidden && (
         <div className="absolute top-0 left-0 bg-black/60 text-[8px] px-1 rounded-br text-white font-bold">
           {card.month}
         </div>
      )}
    </div>
  );
};

export default HanafudaCard;
