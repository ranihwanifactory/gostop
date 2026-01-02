
import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, update, runTransaction } from 'firebase/database';
import { db } from '../firebase';
import { GameRoom, Card, Player } from '../types';
import { INITIAL_DECK, HWATU_BACK_IMAGE } from '../constants';
import { GoogleGenAI } from "@google/genai";

const HwatuCard: React.FC<{ card?: Card, isBack?: boolean, className?: string, onClick?: () => void, disabled?: boolean }> = ({ card, isBack, className, onClick, disabled }) => {
  const [error, setError] = useState(false);

  const getLabel = (c: Card) => {
    const types: any = { Kwang: '광', Yul: '열', Tti: '띠', Pi: '피', SsangPi: '쌍' };
    return `${c.month}${types[c.type]}`;
  };

  if (isBack) {
    return (
      <div className={`relative ${className} hwatu-card-shadow rounded-[2px] border border-black/40 bg-[#c0392b] overflow-hidden`}>
        <img 
          src={HWATU_BACK_IMAGE} 
          alt="back" 
          className="w-full h-full object-cover" 
          onError={() => setError(true)}
          referrerPolicy="no-referrer"
        />
        {error && <div className="absolute inset-0 flex items-center justify-center font-black text-white/20 text-[8px]">HWATU</div>}
      </div>
    );
  }

  if (!card) return null;

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`relative ${className} hwatu-card-shadow rounded-[2px] border border-black/20 bg-white overflow-hidden transition-all transform hover:scale-105 active:scale-95`}
    >
      <img 
        src={card.image} 
        alt={getLabel(card)} 
        className={`w-full h-full object-fill ${error ? 'hidden' : 'block'}`}
        onError={() => setError(true)}
        referrerPolicy="no-referrer"
      />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#fdfdfd] text-black">
          <span className="text-[14px] font-black leading-none">{card.month}</span>
          <span className="text-[8px] font-bold opacity-60">
            {card.type === 'Kwang' ? '光' : card.type === 'Pi' ? 'P' : card.type}
          </span>
        </div>
      )}
      {disabled && <div className="absolute inset-0 bg-black/20" />}
    </button>
  );
};

interface GameViewProps {
  roomId: string;
  user: any;
  onLeave: () => void;
}

const GameView: React.FC<GameViewProps> = ({ roomId, user, onLeave }) => {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);

  useEffect(() => {
    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        onLeave();
        return;
      }
      
      const currentRoom = { ...data, id: roomId } as GameRoom;
      setRoom(currentRoom);
      setLoading(false);

      // 입장한 유저가 플레이어 목록에 없으면 추가 (대기 중일 때만)
      if (currentRoom.status === 'waiting' && !currentRoom.players[user.uid] && Object.keys(currentRoom.players).length < 2) {
        update(roomRef, {
          [`players/${user.uid}`]: {
            uid: user.uid,
            name: user.displayName || 'Guest',
            photo: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'G'}`,
            hand: [],
            captured: [],
            score: 0
          }
        });
      }
    });
    return () => unsubscribe();
  }, [roomId, user.uid, onLeave]);

  const handleStartGame = async () => {
    if (!room) return;
    const shuffled = [...INITIAL_DECK].sort(() => Math.random() - 0.5);
    const players = { ...room.players };
    const pIds = Object.keys(players);
    
    pIds.forEach(id => {
      players[id].hand = shuffled.splice(0, 10);
      players[id].captured = [];
      players[id].score = 0;
    });

    await update(ref(db, `rooms/${roomId}`), {
      status: 'playing',
      players,
      field: shuffled.splice(0, 8),
      deck: shuffled,
      turn: room.hostId,
      lastUpdate: Date.now()
    });
  };

  const handleCardPlay = async (card: Card) => {
    if (room?.turn !== user.uid || isProcessing) return;
    setIsProcessing(true);
    try {
      await runTransaction(ref(db, `rooms/${roomId}`), (current) => {
        if (!current) return current;
        let deck = [...(current.deck || [])];
        let field = [...(current.field || [])];
        let me = current.players[user.uid];
        let captured: Card[] = [];

        // 내 패에서 제거
        me.hand = (me.hand || []).filter((c: Card) => c.id !== card.id);
        
        // 바닥 패와 매칭
        const matchIdx = field.findIndex(fc => fc.month === card.month);
        if (matchIdx !== -1) {
          captured.push(card, field.splice(matchIdx, 1)[0]);
        } else {
          field.push(card);
        }

        // 덱에서 한 장 뒤집기
        if (deck.length > 0) {
          const flipped = deck.shift();
          const dMatchIdx = field.findIndex(fc => fc.month === flipped.month);
          if (dMatchIdx !== -1) {
            captured.push(flipped, field.splice(dMatchIdx, 1)[0]);
          } else {
            field.push(flipped);
          }
        }

        me.captured = [...(me.captured || []), ...captured];
        
        // 점수 계산 생략 (단순화된 버전)
        me.score = (me.captured.length); // 예시: 먹은 장수당 1점

        // 턴 넘기기
        const opponentId = Object.keys(current.players).find(id => id !== user.uid);
        current.turn = opponentId || user.uid;

        if (me.hand.length === 0) {
          current.status = 'finished';
        }

        return current;
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading || !room) return (
    <div className="h-screen bg-[#1a3a16] flex flex-col items-center justify-center text-white">
      <i className="fa-solid fa-circle-notch fa-spin text-4xl text-yellow-500 mb-4"></i>
      <p className="font-bold">접속 중...</p>
    </div>
  );

  // Fix: Ensure the fallback object matches the Player interface by including missing properties like 'photo' and 'uid'
  const me: Player = room.players[user.uid] || { 
    uid: user.uid, 
    name: user.displayName || '나', 
    photo: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'U'}`, 
    score: 0, 
    captured: [], 
    hand: [] 
  };
  const opponentId = Object.keys(room.players).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;

  return (
    <div className="h-screen w-screen flex overflow-hidden game-board-bg">
      {/* Main Game Area */}
      <div className="flex-1 flex flex-col p-4 relative overflow-hidden">
        
        {/* Opponent Info */}
        <div className="flex justify-between h-[100px] items-start">
          <div className="flex flex-col gap-1">
             <div className="flex items-center gap-2 bg-black/40 p-2 rounded-lg border border-white/10">
                <img src={opponent?.photo} className="w-8 h-8 rounded-full border border-red-500" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-white/60">{opponent?.name || '상대 대기 중'}</span>
                  <span className="text-xl font-black text-yellow-400 leading-none">{opponent?.score || 0} <span className="text-xs">점</span></span>
                </div>
             </div>
          </div>
          <div className="flex -space-x-6 mt-2 opacity-80">
            {(opponent?.hand || []).map((_, i) => <HwatuCard key={i} isBack className="w-10 h-15 rotate-180" />)}
          </div>
          <div className="w-1/3 flex flex-wrap gap-0.5 justify-end content-start h-full overflow-y-auto scrollbar-hide">
             {opponent?.captured?.map((c, i) => <img key={i} src={c.image} className="w-4 h-6 rounded-[1px] shadow-sm" />)}
          </div>
        </div>

        {/* Center Table (Field) */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="bg-black/10 rounded-3xl p-6 border border-white/5 flex flex-wrap items-center justify-center gap-2 max-w-2xl min-h-[200px]">
            {room.status === 'waiting' ? (
              <div className="text-white/20 font-black text-4xl italic tracking-widest uppercase">READY</div>
            ) : (
              (room.field || []).map((c) => (
                <HwatuCard key={c.id} card={c} className="w-14 h-21" />
              ))
            )}
          </div>
          
          {/* Deck */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
            <HwatuCard isBack className="w-14 h-21 shadow-[4px_4px_0_rgba(0,0,0,0.4)]" />
            <span className="text-xs font-black text-white/40">{room.deck?.length || 0}</span>
          </div>
        </div>

        {/* My Hand & Captured */}
        <div className="h-[220px] flex flex-col justify-end">
          <div className="flex justify-between items-end gap-4 h-full">
            {/* My Score & Info */}
            <div className="flex flex-col gap-2 mb-2">
               <div className="flex items-center gap-2 bg-black/40 p-2 rounded-lg border border-white/10">
                  <img src={me.photo} className="w-10 h-10 rounded-full border border-blue-500" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-white/60">{me.name}</span>
                    <span className="text-3xl font-black text-yellow-400 leading-none">{me.score} <span className="text-sm">점</span></span>
                  </div>
               </div>
               <div className={`px-3 py-1 rounded-full text-[10px] font-bold text-center border ${room.turn === user.uid ? 'bg-blue-600 border-blue-400 animate-pulse' : 'bg-white/5 border-white/10 opacity-30'}`}>
                 {room.turn === user.uid ? '내 차례' : '상대 차례'}
               </div>
            </div>
            
            {/* My Hand */}
            <div className="flex-1 flex justify-center items-end px-4 overflow-x-auto scrollbar-hide">
               <div className="flex gap-1 md:gap-2 pb-2">
                  {(me.hand || []).map(c => (
                    <HwatuCard 
                      key={c.id} 
                      card={c} 
                      onClick={() => handleCardPlay(c)}
                      disabled={room.turn !== user.uid || isProcessing}
                      className={`w-16 h-24 md:w-20 md:h-30 shadow-2xl transition-all ${room.turn === user.uid ? 'hover:-translate-y-6 cursor-pointer ring-1 ring-yellow-400' : 'opacity-40 grayscale'}`}
                    />
                  ))}
               </div>
            </div>

            {/* My Captured Cards */}
            <div className="w-64 h-32 bg-black/40 rounded-xl p-2 border border-white/10 flex flex-wrap gap-0.5 content-start overflow-y-auto scrollbar-hide shadow-inner mb-2">
                {me.captured?.map((c, i) => <img key={i} src={c.image} className="w-5 h-7 rounded-[1px] shadow-sm" />)}
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar HUD */}
      <div className="w-[180px] hud-panel p-4 flex flex-col gap-4 shadow-2xl z-20">
        <div className="text-center mb-2">
          <h1 className="text-2xl font-black italic text-red-600 leading-none">MATGO</h1>
          <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em]">Master Pro</span>
        </div>

        <div className="bg-black/30 rounded-xl p-3 border border-white/5">
           <span className="text-[10px] font-black text-yellow-500 uppercase block mb-2 tracking-widest">Mission</span>
           <div className="h-24 flex items-center justify-center border-2 border-dashed border-white/5 rounded-lg bg-black/20">
              <span className="text-[10px] text-white/10 font-bold uppercase tracking-tighter">No Active Mission</span>
           </div>
        </div>

        <div className="flex flex-col gap-2 mt-auto">
          <button className="w-full py-3 rounded-lg bg-[#2e5e26] hover:bg-[#3e7e36] font-bold text-xs border border-white/10 shadow-lg transition active:scale-95">이모티콘</button>
          <button onClick={onLeave} className="w-full py-3 rounded-lg bg-neutral-900 hover:bg-red-950 font-bold text-xs border border-white/5 shadow-lg transition active:scale-95">게임 나가기</button>
        </div>

        {room.status === 'waiting' && room.hostId === user.uid && opponent && (
          <button onClick={handleStartGame} className="w-full py-6 rounded-2xl score-badge font-black text-2xl shadow-2xl animate-pulse active:scale-95">시작</button>
        )}
        
        {room.status === 'finished' && room.hostId === user.uid && (
          <button onClick={handleStartGame} className="w-full py-6 rounded-2xl score-badge font-black text-xl shadow-2xl">다시하기</button>
        )}

        <div className="text-[10px] text-center text-white/20 font-bold uppercase mt-2">
          Room: {room.name}
        </div>
      </div>
    </div>
  );
};

export default GameView;
