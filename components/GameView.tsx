
import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, update, runTransaction } from 'firebase/database';
import { db } from '../firebase';
import { GameRoom, Card } from '../types';
import { INITIAL_DECK, HWATU_BACK_IMAGE } from '../constants';
import { GoogleGenAI } from "@google/genai";

// 이미지 로딩 실패 시 텍스트로 카드를 표시하는 안전한 컴포넌트
const HwatuCard: React.FC<{ card?: Card, isBack?: boolean, className?: string, onClick?: () => void, disabled?: boolean }> = ({ card, isBack, className, onClick, disabled }) => {
  const [error, setError] = useState(false);

  const getCardLabel = (c: Card) => {
    const typeNames: Record<string, string> = { Kwang: '광', Yul: '열', Tti: '띠', Pi: '피', SsangPi: '쌍피' };
    return `${c.month}${typeNames[c.type]}`;
  };

  const getCardColor = (c: Card) => {
    if (c.type === 'Kwang') return 'bg-red-900 border-red-500 text-red-100';
    if (c.type === 'Tti') return 'bg-blue-900 border-blue-500 text-blue-100';
    if (c.type === 'Yul') return 'bg-orange-900 border-orange-500 text-orange-100';
    return 'bg-neutral-800 border-neutral-600 text-neutral-300';
  };

  if (isBack) {
    return (
      <div className={`relative ${className} overflow-hidden rounded-md border-2 border-black/50 shadow-lg bg-red-950`}>
        <img 
          src={HWATU_BACK_IMAGE} 
          alt="back" 
          className="w-full h-full object-cover" 
          onError={() => setError(true)}
          referrerPolicy="no-referrer"
        />
        {error && <div className="absolute inset-0 flex items-center justify-center font-black text-white opacity-20 text-[10px]">HWATU</div>}
      </div>
    );
  }

  if (!card) return null;

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`relative ${className} overflow-hidden rounded-md border shadow-lg transition-transform ${error ? getCardColor(card) : 'bg-white border-white/10'}`}
    >
      <img 
        src={card.image} 
        alt={getCardLabel(card)} 
        className={`w-full h-full object-cover ${error ? 'hidden' : 'block'}`}
        onError={() => setError(true)}
        referrerPolicy="no-referrer"
      />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-1 text-center">
          <span className="text-xs font-black">{card.month}</span>
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

      const prompt = `맞고 마스터로서 현재 상황을 분석하고 한국어로 짧게 조언해줘.
내 패(월): ${(me.hand || []).map(c => c.month).join(', ')}
바닥 패(월): ${(room.field || []).map(c => c.month).join(', ')}
내 점수: ${me.score}, 상대 점수: ${opponent?.score || 0}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      });
      setAiAdvice(response.text);
    } catch (error) {
      setAiAdvice('지금은 분석이 어렵네요. 운을 믿으세요!');
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
      <i className="fa-solid fa-circle-notch fa-spin text-4xl text-red-600 mb-4"></i>
      <p className="font-bold tracking-widest animate-pulse">판 까는 중...</p>
    </div>
  );

  const me = room.players?.[user.uid];
  const opponentId = Object.keys(room.players || {}).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;

  const myCaptured = getGroupedCaptured(me?.captured);
  const oppCaptured = getGroupedCaptured(opponent?.captured);

  return (
    <div className="h-screen w-screen bg-[#0f172a] flex flex-col overflow-hidden select-none">
      {/* HUD Header */}
      <div className="p-3 flex items-center justify-between bg-black/80 backdrop-blur-xl border-b border-white/5 z-50">
        <button onClick={onLeave} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition">
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        <div className="text-center">
          <h2 className="text-xs font-black text-red-600 uppercase tracking-widest">{room.name}</h2>
          <div className="text-[10px] font-bold text-white/40 mt-0.5 uppercase">
             {room.status === 'playing' ? (room.turn === user.uid ? '나의 차례' : '상대 차례') : room.status}
          </div>
        </div>
        <button 
          onClick={getAiStrategyHint}
          disabled={room.turn !== user.uid || isAiLoading}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${room.turn === user.uid ? 'bg-indigo-600 shadow-lg shadow-indigo-900/40 animate-pulse' : 'bg-white/5 opacity-20'}`}
        >
          <i className="fa-solid fa-lightbulb"></i>
        </button>
      </div>

      {room.status === 'waiting' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-12 game-board">
          <div className="flex items-center gap-12 md:gap-24">
            <div className="flex flex-col items-center gap-4">
              <img src={room.players[room.hostId]?.photo} className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-red-600 shadow-2xl object-cover" alt="host" />
              <span className="font-black text-lg">{room.players[room.hostId]?.name}</span>
            </div>
            <div className="text-4xl md:text-6xl font-black italic text-white/10">VS</div>
            <div className="flex flex-col items-center gap-4">
              {opponent ? (
                <>
                  <img src={opponent.photo} className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-blue-600 shadow-2xl object-cover" alt="opponent" />
                  <span className="font-black text-lg">{opponent.name}</span>
                </>
              ) : (
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-dashed border-white/10 bg-white/5 flex items-center justify-center text-white/10">
                   <i className="fa-solid fa-user-plus text-3xl"></i>
                </div>
              )}
            </div>
          </div>
          {room.hostId === user.uid && opponent && (
            <button onClick={handleStartGame} className="px-16 py-4 bg-red-600 hover:bg-red-700 text-white font-black text-xl rounded-2xl shadow-xl transition-transform active:scale-95">
              대결 시작
            </button>
          )}
        </div>
      ) : room.status === 'finished' ? (
        <div className="flex-1 flex flex-col items-center justify-center game-board">
           <div className="bg-black/80 p-12 rounded-[3rem] backdrop-blur-3xl border border-white/10 text-center shadow-2xl animate-in zoom-in duration-500">
              <h2 className="text-5xl font-black text-red-600 italic mb-8">대결 종료</h2>
              <div className="flex gap-12 mb-10">
                 <div className="text-center">
                    <p className="text-[10px] font-bold text-white/40 uppercase mb-2">나의 점수</p>
                    <p className="text-5xl font-black text-blue-500">{me?.score || 0}</p>
                 </div>
                 <div className="text-center">
                    <p className="text-[10px] font-bold text-white/40 uppercase mb-2">상대 점수</p>
                    <p className="text-5xl font-black text-red-500">{opponent?.score || 0}</p>
                 </div>
              </div>
              <button onClick={handleStartGame} className="w-full py-4 bg-white text-black font-black rounded-xl hover:bg-neutral-200 transition">다시 한판!</button>
           </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between p-2 relative game-board">
          {aiAdvice && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-[90%] max-w-sm">
              <div className="bg-indigo-950/90 backdrop-blur-2xl border border-indigo-500/50 p-6 rounded-3xl shadow-2xl">
                <p className="text-white text-lg font-bold leading-relaxed mb-4">{aiAdvice}</p>
                <button onClick={() => setAiAdvice(null)} className="w-full py-2 bg-indigo-600 text-white text-xs font-black rounded-lg">확인</button>
              </div>
            </div>
          )}

          {/* Opponent Area */}
          <div className="flex justify-between items-start p-2 h-[20%]">
             <div className="flex items-center gap-3 bg-black/40 p-2 rounded-2xl border border-white/5 pr-4">
                <img src={opponent?.photo} className="w-10 h-10 rounded-xl object-cover border border-red-500/50" alt="opp" />
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-white/40 truncate max-w-[60px]">{opponent?.name}</span>
                    <span className="text-xl font-black text-red-500 leading-none">{opponent?.score || 0}</span>
                </div>
             </div>
             
             <div className="flex -space-x-8 md:-space-x-12">
                {(opponent?.hand || []).map((_, i) => (
                  <HwatuCard key={i} isBack className="w-12 h-18 md:w-16 md:h-24 shadow-2xl transform -translate-y-2 rotate-180" />
                ))}
             </div>
             
             <div className="w-32 h-full grid grid-cols-4 gap-0.5 bg-black/20 rounded-xl p-1 overflow-y-auto scrollbar-hide">
                {opponent?.captured?.map((c, i) => <HwatuCard key={i} card={c} className="w-full h-auto" />)}
             </div>
          </div>

          {/* Table Center */}
          <div className="flex-1 flex items-center justify-center relative">
             <div className="w-full max-w-4xl bg-black/5 rounded-[4rem] p-8 flex flex-wrap items-center justify-center gap-3 md:gap-5">
                {(room.field || []).map((c) => (
                  <HwatuCard key={c.id} card={c} className="w-12 h-18 md:w-20 md:h-30 transform hover:scale-105" />
                ))}
                
                {/* Deck */}
                <div className="absolute top-1/2 left-6 -translate-y-1/2 flex flex-col items-center">
                    <HwatuCard isBack className="w-12 h-18 md:w-20 md:h-30 shadow-[0_10px_0_#330000]" />
                    <span className="text-[10px] font-black text-white/10 mt-4">{room.deck?.length || 0}</span>
                </div>
             </div>
          </div>

          {/* Player Area */}
          <div className="p-2 h-[40%] flex flex-col justify-end gap-4">
             <div className="flex justify-between items-end gap-4">
                <div className="bg-black/40 p-3 rounded-2xl border border-white/10 pr-6 backdrop-blur-sm shadow-xl">
                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1">My Score</span>
                    <span className="text-3xl font-black text-blue-500 leading-none">{me?.score || 0}</span>
                </div>

                {/* Hand */}
                <div className="flex-1 flex justify-center items-end px-2">
                   <div className="flex gap-1.5 md:gap-3 max-w-full overflow-x-auto pb-4 scrollbar-hide">
                      {(me?.hand || []).map(c => (
                        <HwatuCard 
                          key={c.id} 
                          card={c} 
                          onClick={() => handleCardPlay(c)}
                          disabled={room.turn !== user.uid || isProcessing}
                          className={`w-16 h-24 md:w-24 md:h-36 lg:w-28 lg:h-42 transition-all transform shrink-0 ${room.turn === user.uid ? 'hover:-translate-y-12 ring-2 ring-white/10 active:scale-95' : 'opacity-30 grayscale'}`}
                        />
                      ))}
                   </div>
                </div>

                {/* Captured Cards Details */}
                <div className="w-56 md:w-80 h-36 bg-black/60 rounded-3xl border border-white/5 p-3 flex flex-col gap-2 overflow-hidden shadow-inner">
                    <div className="flex gap-2 h-1/2">
                       <div className="flex-1 bg-white/5 rounded-xl p-1.5 flex flex-wrap gap-0.5 overflow-y-auto scrollbar-hide">
                           <span className="w-full text-[8px] font-bold text-yellow-500 uppercase px-1 mb-1">광</span>
                           {myCaptured.kwang.map((c, i) => <HwatuCard key={i} card={c} className="w-5 h-7" />)}
                       </div>
                       <div className="flex-1 bg-white/5 rounded-xl p-1.5 flex flex-wrap gap-0.5 overflow-y-auto scrollbar-hide">
                           <span className="w-full text-[8px] font-bold text-red-400 uppercase px-1 mb-1">열</span>
                           {myCaptured.yul.map((c, i) => <HwatuCard key={i} card={c} className="w-5 h-7" />)}
                       </div>
                    </div>
                    <div className="flex gap-2 h-1/2">
                       <div className="flex-1 bg-white/5 rounded-xl p-1.5 flex flex-wrap gap-0.5 overflow-y-auto scrollbar-hide">
                           <span className="w-full text-[8px] font-bold text-blue-400 uppercase px-1 mb-1">띠</span>
                           {myCaptured.tti.map((c, i) => <HwatuCard key={i} card={c} className="w-5 h-7" />)}
                       </div>
                       <div className="flex-1 bg-white/5 rounded-xl p-1.5 flex flex-wrap gap-0.5 overflow-y-auto scrollbar-hide">
                           <span className="w-full text-[8px] font-bold text-green-400 uppercase px-1 mb-1">피</span>
                           {myCaptured.pi.map((c, i) => <HwatuCard key={i} card={c} className="w-5 h-7" />)}
                       </div>
                    </div>
                </div>
             </div>
             
             {/* Turn indicator */}
             <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-1000 ${room.turn === user.uid ? 'w-full bg-blue-600' : 'w-0 bg-red-600'}`}></div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameView;
