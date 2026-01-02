
import React, { useMemo } from 'react';
import { db } from '../firebase';
import { ref, update, remove } from 'firebase/database';
import { User } from 'firebase/auth';
import { GameRoom, PlayerState, CardType } from '../types';
import { HWATU_CARDS } from '../constants';
import { calculateScore } from '../services/gameLogic';

interface GameBoardProps {
  room: GameRoom;
  user: User;
}

const GameBoard: React.FC<GameBoardProps> = ({ room, user }) => {
  const players = Object.values(room.players || {}) as PlayerState[];
  const myState = room.players ? room.players[user.uid] : null;
  const opponents = players.filter(p => p.uid !== user.uid);
  const isHost = room.hostId === user.uid;

  if (!myState) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white">
        <p className="animate-pulse">대국장에 입장 중...</p>
      </div>
    );
  }

  const handleExit = async () => {
    if (isHost) {
      if (confirm("방장이 퇴장하면 대국이 종료됩니다. 정말 나가시겠습니까?")) {
        await remove(ref(db, `rooms/${room.roomId}`));
      }
    } else {
      await remove(ref(db, `rooms/${room.roomId}/players/${user.uid}`));
    }
  };

  const toggleCard = (cardId: string) => {
    const currentCards = myState.selectedCards || [];
    let newCards;
    if (currentCards.includes(cardId)) {
      newCards = currentCards.filter(id => id !== cardId);
    } else {
      newCards = [...currentCards, cardId];
    }
    
    const { total } = calculateScore(newCards, myState.goCount);
    update(ref(db, `rooms/${room.roomId}/players/${user.uid}`), {
      selectedCards: newCards,
      score: total
    });
  };

  const handleGo = () => {
    const nextGo = (myState.goCount || 0) + 1;
    const { total } = calculateScore(myState.selectedCards || [], nextGo);
    update(ref(db, `rooms/${room.roomId}/players/${user.uid}`), {
      goCount: nextGo,
      score: total
    });
  };

  const resetGame = () => {
    if (!isHost) return;
    const updatedPlayers: any = {};
    players.forEach(p => {
      updatedPlayers[p.uid] = {
        ...p,
        selectedCards: [],
        goCount: 0,
        score: 0,
        isShaken: false,
        isWinner: false
      };
    });
    update(ref(db, `rooms/${room.roomId}`), {
      players: updatedPlayers,
      status: 'playing'
    });
  };

  return (
    <div className="game-board h-screen w-full flex flex-col overflow-hidden text-white relative">
      
      {/* 상단바: 방 정보 및 시스템 버튼 */}
      <div className="flex justify-between items-center p-2 bg-black/40 backdrop-blur-sm z-50">
        <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
            <span className="text-xs font-bold tracking-tighter">ROOM: {room.roomId.slice(-4)}</span>
        </div>
        <div className="flex gap-2">
            {isHost && (
                <button onClick={resetGame} className="bg-orange-600 hover:bg-orange-500 text-[10px] px-3 py-1 rounded font-bold transition shadow-lg">새 판</button>
            )}
            <button onClick={handleExit} className="bg-gray-700 hover:bg-gray-600 text-[10px] px-3 py-1 rounded font-bold transition shadow-lg">나가기</button>
        </div>
      </div>

      {/* 대국판 (Main Table Area) */}
      <div className="flex-1 relative flex flex-col p-4">
        
        {/* 상단: 상대방 영역 (이미지의 위쪽 플레이어들) */}
        <div className="flex justify-around items-start w-full">
            {opponents.map((opp, idx) => (
                <PlayerPanel key={opp.uid} player={opp} isMe={false} position={idx === 0 ? 'top-left' : 'top-right'} />
            ))}
        </div>

        {/* 중앙: 바닥 패 느낌의 장식 요소 (실제 게임 기능을 위한 공간 확보) */}
        <div className="flex-1 flex items-center justify-center pointer-events-none opacity-20">
            <div className="grid grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <div key={i} className="w-12 h-20 border-2 border-white/20 rounded-md card-slot"></div>)}
            </div>
        </div>

        {/* 하단: 내 상태 영역 (이미지의 아래쪽 플레이어) */}
        <div className="w-full flex justify-center pb-2">
            <PlayerPanel player={myState} isMe={true} position="bottom" onGo={handleGo} />
        </div>

      </div>

      {/* 카드 선택 패널 (Overlay/Modal or Bottom Drawer) */}
      <div className="bg-black/60 backdrop-blur-md p-3 border-t border-white/10 max-h-[40%] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
            <h4 className="text-xs font-bold text-amber-400">획득한 패 선택</h4>
            <span className="text-[10px] text-gray-400">클릭하여 점수에 포함</span>
        </div>
        <div className="grid grid-cols-1 gap-4">
            <CompactCardGroup title="광" type="Gwang" selectedCards={myState.selectedCards || []} onToggle={toggleCard} />
            <CompactCardGroup title="열" type="Yeol" selectedCards={myState.selectedCards || []} onToggle={toggleCard} />
            <CompactCardGroup title="띠" type="Ddi" selectedCards={myState.selectedCards || []} onToggle={toggleCard} />
            <CompactCardGroup title="피" type={['Pi', 'SsangPi']} selectedCards={myState.selectedCards || []} onToggle={toggleCard} />
        </div>
      </div>
    </div>
  );
};

// 플레이어 정보 패널 (이미지 스타일 적용)
const PlayerPanel: React.FC<{ 
    player: PlayerState, 
    isMe: boolean, 
    position: string,
    onGo?: () => void 
}> = ({ player, isMe, position, onGo }) => {
    return (
        <div className={`flex items-center gap-3 p-2 rounded-lg bg-black/20 border border-white/10 ${isMe ? 'w-full max-w-md' : 'w-48'}`}>
            <div className="relative">
                <img src={player.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.uid}`} className={`rounded-full border-2 ${isMe ? 'w-14 h-14 border-amber-400' : 'w-10 h-10 border-gray-400'}`} alt={player.name} />
                <div className={`absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${isMe ? 'bg-amber-500 text-black' : 'bg-gray-600 text-white'}`}>
                    {isMe ? '본인' : '상대'}
                </div>
            </div>
            
            <div className="flex-1 overflow-hidden">
                <div className="flex justify-between items-center">
                    <span className="text-xs font-bold truncate pr-2 opacity-80">{player.name}</span>
                    {player.goCount > 0 && <span className="bg-red-600 text-[10px] px-1 rounded animate-bounce">{player.goCount}고</span>}
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <div className="score-badge px-3 py-0.5 rounded-full text-sm font-bold flex items-center gap-1">
                        <span className="text-[10px] opacity-60">SCORE</span>
                        {player.score}점
                    </div>
                    {isMe && onGo && (
                        <button onClick={onGo} className="bg-red-600 hover:bg-red-500 text-[10px] px-2 py-1 rounded font-bold shadow-lg">GO!</button>
                    )}
                </div>
            </div>
        </div>
    );
};

// 화투패 선택 그룹
const CompactCardGroup: React.FC<{ 
    title: string, 
    type: CardType | CardType[], 
    selectedCards: string[], 
    onToggle: (id: string) => void 
}> = ({ title, type, selectedCards, onToggle }) => {
    const types = Array.isArray(type) ? type : [type];
    const cards = HWATU_CARDS.filter(c => types.includes(c.type));

    return (
        <div className="flex items-center gap-2">
            <div className="w-8 text-[10px] font-bold text-amber-200/50">{title}</div>
            <div className="flex-1 flex gap-1.5 overflow-x-auto py-1 scrollbar-hide">
                {cards.map(card => {
                    const isSelected = (selectedCards || []).includes(card.id);
                    return (
                        <button
                            key={card.id}
                            onClick={() => onToggle(card.id)}
                            className={`flex-shrink-0 hwatu-card-ui w-7 h-11 relative flex flex-col items-center justify-center transition-all ${
                                isSelected ? 'ring-2 ring-yellow-400 scale-110' : 'grayscale-[0.4] opacity-70'
                            }`}
                        >
                            <span className="text-[7px] text-white/50 absolute top-0.5">{card.month}</span>
                            <div className="text-[9px] font-bold leading-tight">
                                {card.type === 'Gwang' && <span className="text-yellow-300">光</span>}
                                {card.type === 'Yeol' && (card.isGodori ? '🐦' : '💮')}
                                {card.type === 'Ddi' && (
                                    <div className={`w-0.5 h-6 ${card.ddiType === 'HongDan' ? 'bg-red-400' : card.ddiType === 'ChungDan' ? 'bg-blue-400' : 'bg-purple-400'}`}></div>
                                )}
                                {(card.type === 'Pi' || card.type === 'SsangPi') && (card.type === 'SsangPi' ? '双' : '皮')}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default GameBoard;
