
import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, update, runTransaction } from 'firebase/database';
import { db } from '../firebase';
import { GameRoom, Card } from '../types';
import { INITIAL_DECK, HWATU_BACK_IMAGE } from '../constants';
import { GoogleGenAI } from "@google/genai";

// 이미지가 없을 때도 화투 느낌을 주는 견고한 카드 컴포넌트
const HwatuCard: React.FC<{ card?: Card, isBack?: boolean, className?: string, onClick?: () => void, disabled?: boolean }> = ({ card, isBack, className, onClick, disabled }) => {
  const [error, setError] = useState(false);

  const getCardLabel = (c: Card) => {
    const typeNames: Record<string, string> = { Kwang: '광', Yul: '열', Tti: '띠', Pi: '피', SsangPi: '쌍피' };
    return `${c.month}${typeNames[c.type]}`;
  };

  const getCardStyle = (c: Card) => {
    if (c.type === 'Kwang') return 'bg-red-800 text-red-100 border-red-400';
    if (c.type === 'Tti') return 'bg-blue-800 text-blue-100 border-blue-400';
    if (c.type === 'Yul') return 'bg-amber-800 text-amber-100 border-amber-400';
    return 'bg-neutral-800 text-neutral-300 border-neutral-600';
  };

  if (isBack) {
    return (
      <div className={`relative ${className} overflow-hidden rounded-md border-2 border-black/50 shadow-lg bg-[#b91c1c]`}>
        <img 
          src={HWATU_BACK_IMAGE} 
          alt="back" 
          className="w-full h-full object-cover" 
          onError={() => setError(true)}
          referrerPolicy="no-referrer"
        />
        {error && <div className="absolute inset-0 flex items-center justify-center font-black text-white/20 text-[10px] uppercase">Hwatu</div>}
      </div>
    );
  }

  if (!card) return null;

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`relative ${className} overflow-hidden rounded-md border-2 shadow-xl transition-all ${error ? getCardStyle(card) : 'bg-white border-white/5 hover:border-yellow-400'}`}
    >
      <img 
        src={card.image} 
        alt={getCardLabel(card)} 
        className={`w-full h-full object-cover ${error ? 'hidden' : 'block'}`}
        onError={() => setError(true)}
        referrerPolicy="no-referrer"
      />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-1">
          <span className="text-sm font-black leading-none mb-1">{card.month}</span>
          <span className="text-[10px] font-bold opacity-80">{getCardLabel(card).slice(1)}</span>
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
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  const isLeavingRef = useRef(false);
  const initialLoadTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const roomRef = ref(db, `rooms/${roomId}`);
    
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      
      if (!data) {
        if (!initialLoadTimerRef.current && loading) {
            initialLoadTimerRef.current = window.setTimeout(() => {
                if (!isLeavingRef.current) {
                    isLeavingRef.current = true;
                    onLeave();
                }
            }, 2000);
        } else if (!loading) {
            onLeave();
        }
        return;
      }

      if (initialLoadTimerRef.current) {
          clearTimeout(initialLoadTimerRef.current);
          initialLoadTimerRef.current = null;
      }

      setRoom({ ...data, id: roomId });
      setLoading(false);

      const currentPlayers = data.players || {};
      if (data.status === 'waiting' && Object.keys(currentPlayers).length < 2 && !currentPlayers[user.uid]) {
        update(roomRef, {
          [`players/${user.uid}`]: {
            uid: user.uid,
            name: user.displayName || user.email?.split('@')[0] || 'Unknown',
            photo: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'G'}`,
            hand: [],
            captured: [],
            score: 0
          }
        }).catch(err => console.error("Update failed", err));
      }
    });
    
    return () => {
        unsubscribe();
        if (initialLoadTimerRef.current) clearTimeout(initialLoadTimerRef.current);
    };
  }, [roomId, user.uid, onLeave, loading]);

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
      else {
        const hasRainKwang = captured.some(c => c.month === 12 && c.type === 'Kwang');
        score += hasRainKwang ? 2 : 3;
      }
    }
    if (pis >= 10) score += (pis - 9);
    if (ttis >= 5) score += (ttis - 4);
    if (yuls >= 5) score += (yuls - 4);
    
    return score;
  };

  const getAiStrategyHint = async () => {
    if (!room || room.status !== 'playing' || room.turn !== user.uid || isAiLoading) return;
    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const me = room.players[user.uid];
      const opponentId = Object.keys(room.players).find(id => id !== user.uid);
      const opponent = opponentId ? room.players[opponentId] : null;

      const prompt = `당신은 대한민국 최고의 맞고 마스터입니다. 현재 상황을 분석하여 조언을 2문장 내외로 한국어로 해주세요.
내 핸드 패(월): ${(me.hand || []).map(c => c.month).join(', ')}
바닥 패(월): ${(room.field || []).map(c => c.month).join(', ')}
점수 상황 - 나: ${me.score}, 상대: ${opponent?.score || 0}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      });
      setAiAdvice(response.text);
    } catch (error) {
      setAiAdvice('현재 분석 엔진이 바쁩니다. 직감을 믿고 승부하세요!');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleStartGame = async () => {
    if (!room) return;
    const shuffled = [...INITIAL_DECK].sort(() => Math.random() - 0.5);
    const players = { ...room.players };
    const pIds = Object.keys(players);
    if (pIds.length < 2) return;

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
    setAiAdvice(null);
  };

  const handleCardPlay = async (card: Card) => {
    if (!room || room.status !== 'playing' || room.turn !== user.uid || isProcessing) return;
    setIsProcessing(true);
    setAiAdvice(null);

    const roomRef = ref(db, `rooms/${roomId}`);
    try {
      await runTransaction(roomRef, (current) => {
        if (!current) return current;
        let deck = [...(current.deck || [])];
        let field = [...(current.field || [])];
        let players = { ...current.players };
        let me = players[user.uid];
        let captured: Card[] = [];

        if (!me) return current;

        me.hand = (me.hand || []).filter((c: Card) => c.id !== card.id);
        const matchIdx = field.findIndex(fc => fc.month === card.month);
        if (matchIdx !== -1) {
          captured.push(card, field.splice(matchIdx, 1)[0]);
        } else {
          field.push(card);
        }

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
        me.score = calculateScore(me.captured);

        const playerIds = Object.keys(players);
        const nextTurn = playerIds.find(id => id !== user.uid) || user.uid;
        
        if (me.hand.length === 0) {
           current.status = 'finished';
        }

        current.players = players;
        current.field = field;
        current.deck = deck;
        current.turn = nextTurn;
        current.lastUpdate = Date.now();
        return current;
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getGroupedCaptured = (captured: Card[] = []) => {
      return {
          kwang: captured.filter(c => c.type === 'Kwang'),
          yul: captured.filter(c => c.type === 'Yul'),
          tti: captured.filter(c => c.type === 'Tti'),
          pi: captured.filter(c => c.type === 'Pi' || c.type === 'SsangPi')
      };
  };

  if (loading || !room) return (
    <div className="h-screen bg-[#0f172a] flex flex-col items-center justify-center text-white">
      <div className="relative">
        <i className="fa-solid fa-spinner fa-spin text-5xl text-red-600"></i>
        <div className="absolute inset-0 flex items-center justify-center">
          <i className="fa-solid fa-leaf text-[10px] text-white/40"></i>
        </div>
      </div>
      <p className="mt-8 font-black tracking-[0.4em] animate-pulse text-white/50 uppercase">Loading Session</p>
    </div>
  );

  const me = room.players?.[user.uid];
  const opponentId = Object.keys(room.players || {}).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;

  const myCaptured = getGroupedCaptured(me?.captured);
  const oppCaptured = getGroupedCaptured(opponent?.captured);

  return (
    <div className="h-screen w-screen bg-[#020617] flex flex-col overflow-hidden select-none">
      {/* Game Navbar */}
      <div className="p-4 flex items-center justify-between bg-black/80 backdrop-blur-3xl border-b border-white/5 z-50">
        <button onClick={onLeave} className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/5 hover:bg-white/10 transition active:scale-90">
          <i className="fa-solid fa-xmark text-sm"></i>
        </button>
        <div className="text-center">
          <h2 className="text-[10px] font-black text-red-600 uppercase tracking-widest leading-none mb-1">{room.name}</h2>
          <div className={`px-3 py-0.5 rounded-full text-[9px] font-bold inline-block border ${room.turn === user.uid ? 'bg-green-500/10 border-green-500/50 text-green-400 animate-pulse' : 'bg-white/5 border-white/10 text-white/30'}`}>
             {room.status === 'playing' ? (room.turn === user.uid ? '나의 차례' : '상대의 차례') : room.status.toUpperCase()}
          </div>
        </div>
        <button 
          onClick={getAiStrategyHint}
          disabled={room.turn !== user.uid || isAiLoading}
          className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${room.turn === user.uid ? 'bg-indigo-600 shadow-xl shadow-indigo-900/40 hover:scale-105 active:scale-95' : 'bg-white/5 opacity-20'}`}
        >
          <i className={`fa-solid fa-brain ${isAiLoading ? 'animate-bounce' : ''}`}></i>
        </button>
      </div>

      {room.status === 'waiting' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-12 game-board">
          <div className="flex items-center gap-12 md:gap-32">
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <div className="absolute inset-0 bg-red-600 blur-2xl opacity-20"></div>
                <img src={room.players[room.hostId]?.photo} className="w-24 h-24 md:w-40 md:h-40 rounded-[2.5rem] border-4 border-red-600 shadow-2xl relative z-10" alt="host" />
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-red-600 px-4 py-1 rounded-full text-[10px] font-black uppercase z-20">Host</div>
              </div>
              <span className="font-black text-xl tracking-tight">{room.players[room.hostId]?.name}</span>
            </div>
            <div className="text-6xl md:text-8xl font-black italic text-white/5">VS</div>
            <div className="flex flex-col items-center gap-6">
              {opponent ? (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-600 blur-2xl opacity-20"></div>
                    <img src={opponent.photo} className="w-24 h-24 md:w-40 md:h-40 rounded-[2.5rem] border-4 border-blue-600 shadow-2xl relative z-10" alt="opp" />
                    <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 px-4 py-1 rounded-full text-[10px] font-black uppercase z-20">Guest</div>
                  </div>
                  <span className="font-black text-xl tracking-tight">{opponent.name}</span>
                </>
              ) : (
                <div className="w-24 h-24 md:w-40 md:h-40 rounded-[2.5rem] border-4 border-dashed border-white/10 bg-white/5 flex flex-col items-center justify-center text-white/10 animate-pulse">
                   <i className="fa-solid fa-user-plus text-4xl mb-4"></i>
                   <span className="text-[10px] font-bold uppercase tracking-widest">Waiting</span>
                </div>
              )}
            </div>
          </div>
          {room.hostId === user.uid && opponent && (
            <button onClick={handleStartGame} className="px-20 py-5 bg-red-600 hover:bg-red-700 text-white font-black text-2xl rounded-[2rem] shadow-2xl shadow-red-900/40 transition-transform active:scale-95 group">
               게임 시작 <i className="fa-solid fa-play ml-3 group-hover:translate-x-1 transition-transform"></i>
            </button>
          )}
        </div>
      ) : room.status === 'finished' ? (
        <div className="flex-1 flex flex-col items-center justify-center game-board">
           <div className="bg-black/90 p-16 rounded-[4rem] backdrop-blur-3xl border border-white/10 text-center shadow-2xl animate-in zoom-in duration-500 max-w-lg w-[90%]">
              <h2 className="text-6xl font-black text-red-600 italic mb-12 tracking-tighter">FINISH</h2>
              <div className="grid grid-cols-2 gap-8 mb-12 border-y border-white/10 py-10">
                 <div>
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-3">나의 점수</p>
                    <p className="text-6xl font-black text-blue-500 drop-shadow-lg">{me?.score || 0}</p>
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-3">상대 점수</p>
                    <p className="text-6xl font-black text-red-600 drop-shadow-lg">{opponent?.score || 0}</p>
                 </div>
              </div>
              <button onClick={handleStartGame} className="w-full py-5 bg-white text-black font-black text-xl rounded-2xl hover:bg-neutral-200 transition-all active:scale-95 shadow-xl">
                한판 더 하기!
              </button>
           </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between p-2 relative game-board">
          {aiAdvice && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-[90%] max-w-md">
              <div className="bg-neutral-900/95 backdrop-blur-3xl border border-indigo-500/30 p-8 rounded-[3rem] shadow-2xl animate-in fade-in zoom-in duration-300">
                <div className="flex items-center gap-4 mb-6">
                   <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                     <i className="fa-solid fa-robot text-xl"></i>
                   </div>
                   <span className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em]">Master Advisor</span>
                </div>
                <p className="text-white text-2xl font-bold leading-tight mb-8 drop-shadow-md">{aiAdvice}</p>
                <button onClick={() => setAiAdvice(null)} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-900/30 active:scale-95">조언 확인</button>
              </div>
            </div>
          )}

          {/* Opponent HUD */}
          <div className="flex justify-between items-start p-2 h-[22%]">
             <div className="bg-black/60 p-2.5 rounded-3xl border border-white/5 pr-6 flex items-center gap-4 shadow-xl">
                <img src={opponent?.photo} className="w-12 h-12 rounded-2xl object-cover border-2 border-red-600/50" alt="opp" />
                <div className="flex flex-col">
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">{opponent?.name}</span>
                    <span className="text-3xl font-black text-red-600 leading-none">{opponent?.score || 0} <span className="text-xs opacity-40">P</span></span>
                </div>
             </div>
             
             <div className="flex -space-x-10 md:-space-x-14 translate-y-2">
                {(opponent?.hand || []).map((_, i) => (
                  <HwatuCard key={i} isBack className="w-14 h-21 md:w-20 md:h-30 shadow-2xl transform rotate-180 -translate-y-4 hover:-translate-y-8 transition-transform" />
                ))}
             </div>
             
             <div className="w-32 h-full grid grid-cols-4 gap-1 bg-black/40 rounded-3xl p-2 border border-white/5 overflow-y-auto scrollbar-hide shadow-inner">
                {opponent?.captured?.map((c, i) => <HwatuCard key={i} card={c} className="w-full h-auto rounded-[2px]" />)}
             </div>
          </div>

          {/* Center Table */}
          <div className="flex-1 flex items-center justify-center relative py-8">
             <div className="w-full max-w-5xl bg-black/20 rounded-[5rem] p-12 flex flex-wrap items-center justify-center gap-3 md:gap-5 border border-white/5 shadow-[inset_0_0_100px_rgba(0,0,0,0.6)]">
                {(room.field || []).map((c) => (
                  <HwatuCard key={c.id} card={c} className="w-14 h-21 md:w-24 md:h-36 lg:w-28 lg:h-42 transform transition-transform hover:scale-105" />
                ))}
                
                {/* Draw Pile */}
                <div className="absolute top-1/2 left-8 -translate-y-1/2 flex flex-col items-center">
                    <div className="relative group">
                       <HwatuCard isBack className="w-14 h-21 md:w-24 md:h-36 shadow-[0_12px_0_#450a0a] border-black group-hover:scale-105 transition-transform" />
                       <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-3xl font-black text-white/20">{room.deck?.length || 0}</span>
                       </div>
                    </div>
                    <span className="text-[10px] font-black text-white/10 mt-6 tracking-[0.5em] uppercase">Deck</span>
                </div>
             </div>
          </div>

          {/* My Area */}
          <div className="p-2 h-[40%] flex flex-col justify-end gap-6">
             <div className="flex justify-between items-end gap-6">
                <div className="bg-black/60 p-3 rounded-[2rem] border border-white/10 pr-8 flex items-center gap-5 shadow-2xl backdrop-blur-md">
                    <div className="relative">
                       <img src={me?.photo} className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-600/50 shadow-md" alt="me" />
                       <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-[10px]">
                          <i className="fa-solid fa-user text-white"></i>
                       </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">My Points</span>
                        <span className="text-5xl font-black text-blue-500 leading-none">{me?.score || 0} <span className="text-sm">P</span></span>
                    </div>
                </div>

                {/* My Hand */}
                <div className="flex-1 flex justify-center items-end px-4">
                   <div className="flex gap-2 md:gap-4 max-w-full overflow-x-auto pb-6 scrollbar-hide items-end">
                      {(me?.hand || []).map(c => (
                        <HwatuCard 
                          key={c.id} 
                          card={c} 
                          onClick={() => handleCardPlay(c)}
                          disabled={room.turn !== user.uid || isProcessing}
                          className={`w-16 h-24 md:w-28 md:h-42 lg:w-32 lg:h-48 transition-all transform shrink-0 ${room.turn === user.uid ? 'hover:-translate-y-16 hover:scale-110 ring-4 ring-white/5 cursor-pointer active:scale-90 shadow-[0_20px_40px_rgba(0,0,0,0.6)]' : 'opacity-20 grayscale scale-95'}`}
                        />
                      ))}
                   </div>
                </div>

                {/* Captured Slots */}
                <div className="w-64 md:w-96 h-40 bg-black/50 rounded-[2.5rem] border border-white/5 p-4 flex flex-col gap-3 shadow-inner backdrop-blur-3xl">
                    <div className="flex gap-3 h-1/2">
                       <div className="flex-1 bg-white/5 rounded-2xl p-2 flex flex-wrap gap-1 overflow-y-auto scrollbar-hide border border-white/5">
                           <span className="w-full text-[9px] font-black text-yellow-500 uppercase px-1 mb-1 tracking-widest opacity-40">광</span>
                           {myCaptured.kwang.map((c, i) => <HwatuCard key={i} card={c} className="w-6 h-9" />)}
                       </div>
                       <div className="flex-1 bg-white/5 rounded-2xl p-2 flex flex-wrap gap-1 overflow-y-auto scrollbar-hide border border-white/5">
                           <span className="w-full text-[9px] font-black text-red-500 uppercase px-1 mb-1 tracking-widest opacity-40">열</span>
                           {myCaptured.yul.map((c, i) => <HwatuCard key={i} card={c} className="w-6 h-9" />)}
                       </div>
                    </div>
                    <div className="flex gap-3 h-1/2">
                       <div className="flex-1 bg-white/5 rounded-2xl p-2 flex flex-wrap gap-1 overflow-y-auto scrollbar-hide border border-white/5">
                           <span className="w-full text-[9px] font-black text-blue-500 uppercase px-1 mb-1 tracking-widest opacity-40">띠</span>
                           {myCaptured.tti.map((c, i) => <HwatuCard key={i} card={c} className="w-6 h-9" />)}
                       </div>
                       <div className="flex-1 bg-white/5 rounded-2xl p-2 flex flex-wrap gap-1 overflow-y-auto scrollbar-hide border border-white/5">
                           <span className="w-full text-[9px] font-black text-green-500 uppercase px-1 mb-1 tracking-widest opacity-40">피</span>
                           {myCaptured.pi.map((c, i) => <HwatuCard key={i} card={c} className="w-6 h-9" />)}
                       </div>
                    </div>
                </div>
             </div>
             
             {/* Turn Indicator Bar */}
             <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden shadow-inner">
                <div className={`h-full transition-all duration-1000 ease-out ${room.turn === user.uid ? 'w-full bg-blue-600 shadow-[0_0_20px_rgba(37,99,235,0.8)]' : 'w-0 bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.8)]'}`}></div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameView;
