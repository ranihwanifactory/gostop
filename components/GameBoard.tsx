
import React, { useMemo } from 'react';
import { db } from '../firebase';
import { ref, set, update, remove } from 'firebase/database';
import { User } from 'firebase/auth';
import { GameRoom, PlayerState, CardType } from '../types';
import { HWATU_CARDS } from '../constants';
import { calculateScore } from '../services/gameLogic';

interface GameBoardProps {
  room: GameRoom;
  user: User;
}

const GameBoard: React.FC<GameBoardProps> = ({ room, user }) => {
  // Fixed: Cast Object.values to PlayerState[] to ensure members are correctly typed
  const players = Object.values(room.players || {}) as PlayerState[];
  const myState = room.players[user.uid];
  const isHost = room.hostId === user.uid;

  const handleExit = async () => {
    if (isHost) {
      if (confirm("방장이 나가면 방이 사라집니다. 정말 나가시겠습니까?")) {
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

  const shareRoom = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        alert("방 주소가 복사되었습니다. 친구에게 공유하세요!");
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Game Header */}
      <div className="flex justify-between items-center hanji-texture border border-amber-300 p-3 rounded shadow-sm">
        <div className="flex items-center gap-2">
            <span className="bg-red-800 text-white text-xs px-2 py-1 rounded font-bold">LIVE</span>
            <span className="text-sm font-semibold text-amber-900">{room.roomId.slice(-6)}번 대국실</span>
        </div>
        <div className="flex gap-2">
            <button onClick={shareRoom} className="text-xs bg-amber-100 border border-amber-300 px-3 py-1 rounded hover:bg-amber-200">초대 공유</button>
            <button onClick={handleExit} className="text-xs bg-gray-100 border border-gray-300 px-3 py-1 rounded hover:bg-gray-200">방 나가기</button>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {players.map(p => {
          const { breakdown } = calculateScore(p.selectedCards || [], p.goCount);
          return (
            <div key={p.uid} className={`relative p-4 rounded-xl border-2 transition-all ${p.uid === user.uid ? 'border-red-600 bg-red-50 shadow-lg' : 'border-amber-200 bg-white'}`}>
              {p.uid === user.uid && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">나</div>}
              <div className="flex items-center gap-3 mb-2">
                <img src={p.photoURL || `https://picsum.photos/seed/${p.uid}/40/40`} className="w-10 h-10 rounded-full border border-gray-300" alt={p.name} />
                <div>
                  <h3 className="font-bold text-sm truncate w-24">{p.name}</h3>
                  <p className="text-red-700 font-bold text-xl">{p.score}점</p>
                </div>
              </div>
              <div className="text-[10px] text-gray-500 flex flex-wrap gap-1 mt-2">
                {p.goCount > 0 && <span className="bg-red-100 text-red-600 px-1 rounded">{p.goCount}고!</span>}
                {breakdown.map((b, i) => <span key={i} className="bg-gray-100 px-1 rounded">{b}</span>)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Card Selection Tabs */}
      <div className="bg-white rounded-xl shadow-lg border border-amber-200 overflow-hidden">
        <div className="bg-amber-900 text-white p-3 flex justify-between items-center">
            <h3 className="traditional-font font-bold">내 패 관리</h3>
            <div className="flex gap-2">
                <button onClick={handleGo} className="bg-red-600 hover:bg-red-500 text-white px-4 py-1 rounded text-sm font-bold shadow-sm transition">고!</button>
                {isHost && <button onClick={resetGame} className="bg-amber-700 hover:bg-amber-600 text-white px-4 py-1 rounded text-sm font-bold shadow-sm transition">초기화</button>}
            </div>
        </div>
        
        <div className="p-4 overflow-y-auto max-h-[50vh]">
            <CardGroup 
                title="광 (Gwang)" 
                type="Gwang" 
                selectedCards={myState.selectedCards || []} 
                onToggle={toggleCard} 
            />
            <CardGroup 
                title="열끗 (Yeol)" 
                type="Yeol" 
                selectedCards={myState.selectedCards || []} 
                onToggle={toggleCard} 
            />
            <CardGroup 
                title="띠 (Ddi)" 
                type="Ddi" 
                selectedCards={myState.selectedCards || []} 
                onToggle={toggleCard} 
            />
            <CardGroup 
                title="피 / 쌍피 (Pi)" 
                type={['Pi', 'SsangPi']} 
                selectedCards={myState.selectedCards || []} 
                onToggle={toggleCard} 
            />
        </div>
      </div>
    </div>
  );
};

const CardGroup: React.FC<{ 
    title: string, 
    type: CardType | CardType[], 
    selectedCards: string[], 
    onToggle: (id: string) => void 
}> = ({ title, type, selectedCards, onToggle }) => {
    const types = Array.isArray(type) ? type : [type];
    const cards = HWATU_CARDS.filter(c => types.includes(c.type));

    return (
        <div className="mb-6">
            <h4 className="text-sm font-bold text-amber-900 border-b border-amber-100 mb-3 pb-1">{title}</h4>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {cards.map(card => {
                    const isSelected = selectedCards.includes(card.id);
                    return (
                        <button
                            key={card.id}
                            onClick={() => onToggle(card.id)}
                            className={`flex flex-col items-center p-2 rounded border-2 transition-all ${
                                isSelected 
                                ? 'bg-red-50 border-red-500 scale-95 shadow-inner' 
                                : 'bg-white border-gray-100 hover:border-amber-300'
                            }`}
                        >
                            <span className="text-[10px] text-gray-400 mb-1">{card.month}월</span>
                            <div className="w-10 h-14 bg-red-800 rounded-sm mb-1 flex items-center justify-center relative overflow-hidden">
                                <div className="absolute inset-1 border border-amber-500/30"></div>
                                {card.type === 'Gwang' && <span className="text-amber-400 text-lg font-bold">光</span>}
                                {card.type === 'Ddi' && (
                                    <div className={`w-1 h-8 ${
                                        card.ddiType === 'HongDan' ? 'bg-red-500' : 
                                        card.ddiType === 'ChungDan' ? 'bg-blue-500' : 
                                        card.ddiType === 'ChoDan' ? 'bg-purple-500' : 'bg-amber-100'
                                    }`}></div>
                                )}
                                {card.type === 'Yeol' && <span className="text-white text-xs">{card.isGodori ? '🐦' : '💮'}</span>}
                                {(card.type === 'Pi' || card.type === 'SsangPi') && <span className="text-amber-200 text-xs">{card.type === 'SsangPi' ? '双' : '皮'}</span>}
                            </div>
                            <span className={`text-[9px] font-bold leading-tight ${isSelected ? 'text-red-700' : 'text-gray-600'}`}>
                                {card.name.split(' ')[1]}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default GameBoard;
