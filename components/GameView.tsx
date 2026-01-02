
import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, update, runTransaction } from 'firebase/database';
import { db } from '../firebase';
import { GameRoom, Card } from '../types';
import { INITIAL_DECK, HWATU_BACK_IMAGE } from '../constants';
import { GoogleGenAI } from "@google/genai";

const HwatuCard: React.FC<{ card?: Card, isBack?: boolean, className?: string, onClick?: () => void, disabled?: boolean, small?: boolean }> = ({ card, isBack, className, onClick, disabled, small }) => {
  const [error, setError] = useState(false);

  if (isBack) {
    return (
      <div className={`relative ${className} hwatu-card-shadow rounded-sm border border-black/30 bg-[#c0392b]`}>
        <img 
          src={HWATU_BACK_IMAGE} 
          alt="back" 
          className="w-full h-full object-cover" 
          onError={() => setError(true)}
          referrerPolicy="no-referrer"
        />
        {error && <div className="absolute inset-0 flex items-center justify-center font-black text-white/20 text-[8px] uppercase">Hwatu</div>}
      </div>
    );
  }

  if (!card) return null;

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`relative ${className} hwatu-card-shadow rounded-sm border border-white/20 bg-white overflow-hidden transition-all transform hover:z-10`}
    >
      <img 
        src={card.image} 
        alt={`${card.month}월`} 
        className="w-full h-full object-fill" 
        onError={(e) => {
            setError(true);
            // Fallback: ga-on repo가 안될 경우 hwatupedia 시도
            (e.target as HTMLImageElement).src = `https://cdn.jsdelivr.net/gh/theeluwin/hwatupedia@master/images/${card.month}-${card.id % 4 || 4}.png`;
        }}
        referrerPolicy="no-referrer"
      />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white text-black p-0.5">
          <span className="text-[10px] font-black leading-none">{card.month}</span>
        </div>
      )}
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
      if (!data) return;
      setRoom({ ...data, id: roomId });
      setLoading(false);
    });
    return () => unsubscribe();
  }, [roomId]);

  const calculateScore = (captured: Card[] = []) => {
    if (!captured.length) return 0;
    const kwangs = captured.filter(c => c.type === 'Kwang').length;
    const pis = captured.filter(c => c.type === 'Pi' || c.type === 'SsangPi').reduce((acc, c) => acc + (c.type === 'SsangPi' ? 2 : 1), 0);
    const ttis = captured.filter(c => c.type === 'Tti').length;
    const yuls = captured.filter(c => c.type === 'Yul').length;

    let score = 0;
    if (kwangs >= 3) {
      if (kwangs === 5) score += 15;
      else if (kwangs === 4) score += 4;
      else score += (captured.some(c => c.month === 12 && c.type === 'Kwang') ? 2 : 3);
    }
    if (pis >= 10) score += (pis - 9);
    if (ttis >= 5) score += (ttis - 4);
    if (yuls >= 5) score += (yuls - 4);
    return score;
  };

  const handleStartGame = async () => {
    const shuffled = [...INITIAL_DECK].sort(() => Math.random() - 0.5);
    const players = { ...room!.players };
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
      turn: room!.hostId,
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

        me.hand = me.hand.filter((c: Card) => c.id !== card.id);
        const matchIdx = field.findIndex(fc => fc.month === card.month);
        if (matchIdx !== -1) captured.push(card, field.splice(matchIdx, 1)[0]);
        else field.push(card);

        if (deck.length > 0) {
          const flipped = deck.shift();
          const dMatchIdx = field.findIndex(fc => fc.month === flipped.month);
          if (dMatchIdx !== -1) captured.push(flipped, field.splice(dMatchIdx, 1)[0]);
          else field.push(flipped);
        }

        me.captured = [...(me.captured || []), ...captured];
        me.score = calculateScore(me.captured);
        current.turn = Object.keys(current.players).find(id => id !== user.uid);
        if (me.hand.length === 0) current.status = 'finished';
        return current;
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading || !room) return <div className="h-screen flex items-center justify-center font-bold">판 까는 중...</div>;

  const me = room.players[user.uid];
  const opponentId = Object.keys(room.players).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;

  return (
    <div className="h-screen w-screen flex overflow-hidden game-board-bg">
      {/* Main Game Area */}
      <div className="flex-1 flex flex-col p-4 relative">
        
        {/* Opponent Captured */}
        <div className="flex justify-between h-[120px]">
          <div className="flex flex-col gap-1 w-1/3">
             <div className="flex items-center gap-2 bg-black/30 p-2 rounded-lg border border-white/10 w-fit">
                <img src={opponent?.photo} className="w-8 h-8 rounded-full border border-red-500" />
                <span className="text-xs font-bold">{opponent?.name}</span>
             </div>
             <div className="flex flex-wrap gap-0.5 bg-black/20 p-1 rounded min-h-[50px] overflow-y-auto scrollbar-hide">
                {opponent?.captured?.map((c, i) => <img key={i} src={c.image} className="w-5 h-7" />)}
             </div>
          </div>
          <div className="flex -space-x-8 mt-2">
            {(opponent?.hand || []).map((_, i) => <HwatuCard key={i} isBack className="w-10 h-15 rotate-180" />)}
          </div>
          <div className="text-right w-1/3">
             <span className="text-3xl font-black text-yellow-400 drop-shadow-lg">{opponent?.score || 0}점</span>
          </div>
        </div>

        {/* Center Table */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="grid grid-cols-6 gap-3 p-8 bg-black/5 rounded-3xl border border-white/5 shadow-inner">
            {(room.field || []).map((c) => (
              <HwatuCard key={c.id} card={c} className="w-14 h-21 animate-deal" />
            ))}
          </div>
          {/* Deck */}
          <div className="absolute right-10 top-1/2 -translate-y-1/2">
            <HwatuCard isBack className="w-14 h-21 shadow-[4px_4px_0_rgba(0,0,0,0.5)]" />
            <div className="text-center mt-2 text-[10px] font-black text-white/30 uppercase tracking-widest">{room.deck?.length || 0}</div>
          </div>
        </div>

        {/* My Hand & Score */}
        <div className="h-[250px] flex flex-col justify-end gap-4">
          <div className="flex justify-between items-end">
            <div className="flex flex-col gap-2">
               <div className="flex items-center gap-2 bg-black/30 p-2 rounded-lg border border-white/10 w-fit">
                  <img src={me.photo} className="w-10 h-10 rounded-full border border-blue-500 shadow-lg" />
                  <span className="font-black text-blue-400">{me.name}</span>
               </div>
               <span className="text-5xl font-black text-yellow-400 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">{me.score}점</span>
            </div>
            
            <div className="flex-1 flex justify-center items-end px-10">
               <div className="flex gap-2 max-w-full overflow-x-auto pb-4 scrollbar-hide">
                  {me.hand?.map(c => (
                    <HwatuCard 
                      key={c.id} 
                      card={c} 
                      onClick={() => handleCardPlay(c)}
                      disabled={room.turn !== user.uid}
                      className={`w-18 h-27 md:w-22 md:h-33 shadow-2xl transition-all ${room.turn === user.uid ? 'hover:-translate-y-8 cursor-pointer ring-2 ring-yellow-400' : 'opacity-40 grayscale'}`}
                    />
                  ))}
               </div>
            </div>

            <div className="w-72 bg-black/40 rounded-xl p-3 border border-white/10 shadow-2xl backdrop-blur-sm">
                <div className="grid grid-cols-2 gap-2 h-full">
                    <div className="bg-white/5 p-1 rounded border border-white/5 flex flex-wrap gap-0.5 overflow-y-auto h-16 scrollbar-hide">
                        <span className="w-full text-[8px] font-black text-yellow-500 border-b border-yellow-500/20 mb-1">광</span>
                        {me.captured?.filter(c => c.type === 'Kwang').map((c, i) => <img key={i} src={c.image} className="w-4 h-6" />)}
                    </div>
                    <div className="bg-white/5 p-1 rounded border border-white/5 flex flex-wrap gap-0.5 overflow-y-auto h-16 scrollbar-hide">
                        <span className="w-full text-[8px] font-black text-red-400 border-b border-red-500/20 mb-1">열</span>
                        {me.captured?.filter(c => c.type === 'Yul').map((c, i) => <img key={i} src={c.image} className="w-4 h-6" />)}
                    </div>
                    <div className="bg-white/5 p-1 rounded border border-white/5 flex flex-wrap gap-0.5 overflow-y-auto h-16 scrollbar-hide">
                        <span className="w-full text-[8px] font-black text-blue-400 border-b border-blue-500/20 mb-1">띠</span>
                        {me.captured?.filter(c => c.type === 'Tti').map((c, i) => <img key={i} src={c.image} className="w-4 h-6" />)}
                    </div>
                    <div className="bg-white/5 p-1 rounded border border-white/5 flex flex-wrap gap-0.5 overflow-y-auto h-16 scrollbar-hide">
                        <span className="w-full text-[8px] font-black text-green-400 border-b border-green-500/20 mb-1">피</span>
                        {me.captured?.filter(c => c.type === 'Pi' || c.type === 'SsangPi').map((c, i) => <img key={i} src={c.image} className="w-4 h-6" />)}
                    </div>
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right HUD Sidebar */}
      <div className="w-[180px] hud-panel p-4 flex flex-col gap-4 shadow-2xl">
        <div className="text-center mb-4">
          <h1 className="text-xl font-black italic text-red-600 tracking-tighter leading-none">MATGO</h1>
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Master Pro</span>
        </div>

        <div className="bg-black/40 rounded-xl p-3 border border-white/5">
           <span className="text-[10px] font-bold text-yellow-500 uppercase block mb-2">Mission</span>
           <div className="h-20 flex items-center justify-center border-2 border-dashed border-white/10 rounded-lg">
              <span className="text-[10px] text-white/20 font-bold">NO MISSION</span>
           </div>
        </div>

        <div className="flex flex-col gap-2 mt-auto">
          <button className="w-full py-3 rounded-lg bg-green-700 hover:bg-green-600 font-bold text-sm shadow-lg transition active:scale-95">이모티콘</button>
          <button onClick={onLeave} className="w-full py-3 rounded-lg bg-neutral-800 hover:bg-red-900 font-bold text-sm shadow-lg border border-white/5 transition active:scale-95">나가기</button>
        </div>

        {room.status === 'waiting' && room.hostId === user.uid && opponent && (
          <button onClick={handleStartGame} className="w-full py-6 rounded-2xl score-badge font-black text-xl shadow-2xl animate-pulse">시작</button>
        )}
        
        {room.status === 'finished' && (
          <button onClick={handleStartGame} className="w-full py-6 rounded-2xl score-badge font-black text-xl shadow-2xl">다시하기</button>
        )}

        <div className={`mt-4 p-3 rounded-xl border text-center ${room.turn === user.uid ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-red-600/20 border-red-500 text-red-400'}`}>
          <p className="text-[10px] font-black uppercase tracking-widest mb-1">Turn</p>
          <p className="font-bold">{room.turn === user.uid ? '나의 차례' : '상대 차례'}</p>
        </div>
      </div>
    </div>
  );
};

export default GameView;
