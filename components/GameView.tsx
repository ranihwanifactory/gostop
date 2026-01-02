
import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, update, runTransaction } from 'firebase/database';
import { db } from '../firebase';
import { GameRoom, Card } from '../types';
import { INITIAL_DECK, HWATU_BACK_IMAGE } from '../constants';
import { GoogleGenAI } from "@google/genai";

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

      const prompt = `당신은 화투(맞고) 마스터입니다. 현재 내 패와 바닥의 상황을 보고 전략을 한국어로 2문장 내외로 조언해 주세요.
내 패(월별): ${(me.hand || []).map(c => c.month).join(', ')}
바닥 패(월별): ${(room.field || []).map(c => c.month).join(', ')}
점수 - 나: ${me.score}, 상대: ${opponent?.score || 0}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      });
      setAiAdvice(response.text);
    } catch (error) {
      setAiAdvice('현재 분석이 어렵습니다. 자신의 감각을 믿고 진행하세요!');
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
    <div className="h-screen bg-neutral-900 flex flex-col items-center justify-center text-white">
      <div className="relative mb-4">
        <i className="fa-solid fa-spinner fa-spin text-5xl text-red-600"></i>
      </div>
      <p className="text-neutral-400 font-bold tracking-widest animate-pulse">데이터 로딩 중...</p>
    </div>
  );

  const me = room.players?.[user.uid];
  const opponentId = Object.keys(room.players || {}).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;

  const myCaptured = getGroupedCaptured(me?.captured);
  const oppCaptured = getGroupedCaptured(opponent?.captured);

  return (
    <div className="h-screen w-screen bg-[#0f172a] flex flex-col overflow-hidden select-none">
      {/* Header */}
      <div className="p-4 flex items-center justify-between bg-black/60 backdrop-blur-md border-b border-white/5 z-50">
        <button onClick={onLeave} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition shadow-inner">
          <i className="fa-solid fa-chevron-left text-sm"></i>
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs font-black text-red-600 uppercase tracking-widest drop-shadow-md">{room.name}</span>
          <div className="flex items-center gap-2 mt-1">
             <div className={`w-2 h-2 rounded-full ${room.turn === user.uid ? 'bg-green-500 animate-pulse' : 'bg-white/20'}`}></div>
             <span className={`text-[10px] font-bold uppercase ${room.turn === user.uid ? 'text-green-400' : 'text-white/40'}`}>
               {room.turn === user.uid ? '나의 차례' : '상대 차례'}
             </span>
          </div>
        </div>
        <button 
          onClick={getAiStrategyHint}
          disabled={room.turn !== user.uid || isAiLoading}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${room.turn === user.uid ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 hover:scale-110 active:scale-95' : 'bg-white/5 text-white/10'}`}
        >
          <i className={`fa-solid fa-brain ${isAiLoading ? 'animate-pulse' : ''}`}></i>
        </button>
      </div>

      {room.status === 'waiting' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-12 game-board">
          <div className="flex items-center gap-12 md:gap-24">
            <div className="flex flex-col items-center gap-6 group">
              <div className="relative">
                <div className="absolute inset-0 bg-red-600 rounded-3xl blur-2xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                <img src={room.players[room.hostId]?.photo} className="w-24 h-24 md:w-36 md:h-36 rounded-3xl border-4 border-red-600 shadow-2xl object-cover relative z-10" alt="host" />
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest z-20 shadow-lg">Host</div>
              </div>
              <span className="font-black text-xl text-white/90 drop-shadow-lg">{room.players[room.hostId]?.name}</span>
            </div>
            <div className="text-4xl md:text-7xl font-black italic text-white/5 select-none">VERSUS</div>
            <div className="flex flex-col items-center gap-6 group">
              {opponent ? (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-600 rounded-3xl blur-2xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                    <img src={opponent.photo} className="w-24 h-24 md:w-36 md:h-36 rounded-3xl border-4 border-blue-600 shadow-2xl object-cover relative z-10" alt="opponent" />
                    <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest z-20 shadow-lg">Guest</div>
                  </div>
                  <span className="font-black text-xl text-white/90 drop-shadow-lg">{opponent.name}</span>
                </>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-24 h-24 md:w-36 md:h-36 rounded-3xl border-4 border-dashed border-white/10 bg-white/5 flex flex-col items-center justify-center text-white/20 animate-pulse">
                    <i className="fa-solid fa-user-plus text-3xl mb-3"></i>
                    <span className="text-[10px] font-bold uppercase tracking-widest">Waiting</span>
                  </div>
                  <span className="text-white/10 font-bold uppercase tracking-tighter">참가자 대기 중</span>
                </div>
              )}
            </div>
          </div>
          {room.hostId === user.uid && opponent && (
            <button onClick={handleStartGame} className="px-16 py-5 bg-red-600 hover:bg-red-700 text-white font-black text-2xl rounded-2xl shadow-2xl shadow-red-900/50 transition-all hover:scale-105 active:scale-95 flex items-center gap-4">
              <i className="fa-solid fa-play"></i> 대결 시작
            </button>
          )}
        </div>
      ) : room.status === 'finished' ? (
        <div className="flex-1 flex flex-col items-center justify-center game-board">
           <div className="bg-black/80 p-12 rounded-[4rem] backdrop-blur-2xl border border-white/10 text-center shadow-[0_0_100px_rgba(220,38,38,0.3)] animate-in zoom-in duration-500">
              <h2 className="text-6xl font-black text-red-600 italic mb-10 tracking-tighter">대결 종료</h2>
              <div className="flex gap-12 mb-12">
                 <div className="flex flex-col gap-3">
                    <span className="text-xs font-black text-white/30 uppercase tracking-widest">나의 최종 점수</span>
                    <span className="text-6xl font-black text-blue-500 drop-shadow-lg">{me?.score || 0}</span>
                 </div>
                 <div className="w-px h-20 bg-white/10 self-center"></div>
                 <div className="flex flex-col gap-3">
                    <span className="text-xs font-black text-white/30 uppercase tracking-widest">상대 최종 점수</span>
                    <span className="text-6xl font-black text-red-500 drop-shadow-lg">{opponent?.score || 0}</span>
                 </div>
              </div>
              <button onClick={handleStartGame} className="w-full py-5 bg-white text-black font-black text-xl rounded-2xl hover:bg-neutral-200 transition-all active:scale-95 shadow-xl">
                복수혈전 (다시 시작)
              </button>
           </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between p-2 relative game-board">
          {aiAdvice && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-[90%] max-w-md">
              <div className="bg-neutral-900/90 backdrop-blur-3xl border border-indigo-500/50 p-8 rounded-[2.5rem] shadow-2xl animate-in fade-in zoom-in duration-300">
                <div className="flex items-center gap-3 mb-4">
                   <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                     <i className="fa-solid fa-brain text-sm"></i>
                   </div>
                   <span className="text-sm font-black text-indigo-400 uppercase tracking-widest">Master Advisor</span>
                </div>
                <p className="text-white text-xl leading-relaxed font-bold">{aiAdvice}</p>
                <button onClick={() => setAiAdvice(null)} className="mt-8 w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black rounded-xl transition-colors shadow-lg shadow-indigo-900/30">조언 닫기</button>
              </div>
            </div>
          )}

          {/* Opponent Area */}
          <div className="flex justify-between items-start p-2 h-[22%]">
             <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 bg-black/40 p-2.5 rounded-2xl border border-white/5 pr-5 backdrop-blur-sm">
                  <img src={opponent?.photo} className="w-10 h-10 rounded-xl object-cover border-2 border-red-500/50 shadow-md" alt="opponent" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-white/40 truncate max-w-[80px]">{opponent?.name}</span>
                    <span className="text-2xl font-black text-red-600 leading-none">{opponent?.score || 0} <span className="text-xs opacity-60">P</span></span>
                  </div>
                </div>
             </div>
             
             <div className="flex -space-x-8 md:-space-x-12">
                {(opponent?.hand || []).map((_, i) => (
                  <div key={i} className="w-12 h-18 md:w-16 md:h-24 hwatu-card shadow-2xl rotate-180 overflow-hidden relative border border-black/40 transform -translate-y-2">
                     <img src={HWATU_BACK_IMAGE} className="absolute inset-0 w-full h-full object-cover" alt="card back" />
                  </div>
                ))}
             </div>
             
             <div className="w-32 h-full grid grid-cols-4 gap-0.5 bg-black/30 rounded-2xl p-1.5 overflow-y-auto scrollbar-hide border border-white/5">
                {opponent?.captured?.map((c, i) => <img key={i} src={c.image} className="w-full h-auto rounded-[1px] shadow-sm" alt="captured" />)}
             </div>
          </div>

          {/* Table Center */}
          <div className="flex-1 flex flex-col items-center justify-center py-6">
             <div className="w-full max-w-5xl bg-black/10 rounded-[5rem] p-10 md:p-16 border border-white/5 flex flex-wrap items-center justify-center gap-3 md:gap-5 relative shadow-[inset_0_0_80px_rgba(0,0,0,0.5)]">
                {(room.field || []).map((c) => (
                  <div key={c.id} className="w-11 h-17 md:w-20 md:h-30 lg:w-24 lg:h-36 transform transition-all duration-300 hover:scale-110 hover:-translate-y-2">
                    <img src={c.image} className="w-full h-full rounded-md shadow-2xl border border-white/10 card-shadow object-cover" alt="field card" />
                  </div>
                ))}
                
                {/* Deck Pile */}
                <div className="absolute top-1/2 left-6 -translate-y-1/2 flex flex-col items-center group">
                    <div className="w-12 h-18 md:w-20 md:h-30 hwatu-card shadow-[0_12px_0_#3e0a0a] border border-black/60 overflow-hidden relative group-hover:scale-105 transition-transform">
                       <img src={HWATU_BACK_IMAGE} className="absolute inset-0 w-full h-full object-cover opacity-60" alt="deck back" />
                       <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-black text-white/50">{room.deck?.length || 0}</span>
                       </div>
                    </div>
                    <span className="text-[10px] font-black text-white/10 mt-5 uppercase tracking-[0.3em]">Deck</span>
                </div>
             </div>
          </div>

          {/* Player Area */}
          <div className="p-2 h-[38%] flex flex-col justify-end gap-5">
             <div className="flex justify-between items-end gap-6">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-4 bg-black/40 p-3 rounded-2xl border border-white/10 pr-6 backdrop-blur-sm shadow-xl">
                        <img src={me?.photo} className="w-14 h-14 rounded-xl object-cover border-2 border-blue-500/50 shadow-md" alt="me" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Score</span>
                            <span className="text-3xl font-black text-blue-500 leading-none">{me?.score || 0} <span className="text-sm">P</span></span>
                        </div>
                    </div>
                </div>

                {/* Hand */}
                <div className="flex-1 flex justify-center items-end px-4">
                   <div className="flex gap-1.5 md:gap-3 max-w-full overflow-x-auto pb-6 scrollbar-hide">
                      {(me?.hand || []).map(c => (
                        <button 
                          key={c.id} 
                          onClick={() => handleCardPlay(c)}
                          disabled={room.turn !== user.uid || isProcessing}
                          className={`group relative transition-all duration-300 transform shrink-0 ${room.turn === user.uid ? 'hover:-translate-y-16 z-50 cursor-pointer active:scale-95' : 'opacity-30 grayscale-[0.8]'}`}
                        >
                          <img src={c.image} className="w-14 h-21 md:w-24 md:h-36 lg:w-28 lg:h-42 rounded-xl shadow-2xl border border-white/10 group-hover:ring-4 ring-yellow-400 group-hover:shadow-[0_0_30px_rgba(250,204,21,0.4)]" alt="hand card" />
                          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-black text-yellow-400 uppercase tracking-widest hidden md:block">내기</div>
                        </button>
                      ))}
                   </div>
                </div>

                {/* Captured Cards */}
                <div className="w-56 md:w-80 h-36 bg-black/50 rounded-3xl border border-white/5 p-4 flex flex-col gap-2.5 overflow-hidden backdrop-blur-2xl shadow-inner">
                    <div className="flex gap-2.5 h-1/2">
                       <div className="flex-1 bg-white/5 rounded-2xl p-1.5 flex flex-wrap gap-0.5 overflow-y-auto scrollbar-hide border border-white/5">
                           <span className="w-full text-[9px] font-black text-yellow-500 uppercase px-1 mb-1 tracking-widest opacity-60">광</span>
                           {myCaptured.kwang.map((c, i) => <img key={i} src={c.image} className="w-5 h-7 rounded-[1px] shadow-sm" alt="kwang" />)}
                       </div>
                       <div className="flex-1 bg-white/5 rounded-2xl p-1.5 flex flex-wrap gap-0.5 overflow-y-auto scrollbar-hide border border-white/5">
                           <span className="w-full text-[9px] font-black text-red-400 uppercase px-1 mb-1 tracking-widest opacity-60">열</span>
                           {myCaptured.yul.map((c, i) => <img key={i} src={c.image} className="w-5 h-7 rounded-[1px] shadow-sm" alt="yul" />)}
                       </div>
                    </div>
                    <div className="flex gap-2.5 h-1/2">
                       <div className="flex-1 bg-white/5 rounded-2xl p-1.5 flex flex-wrap gap-0.5 overflow-y-auto scrollbar-hide border border-white/5">
                           <span className="w-full text-[9px] font-black text-blue-400 uppercase px-1 mb-1 tracking-widest opacity-60">띠</span>
                           {myCaptured.tti.map((c, i) => <img key={i} src={c.image} className="w-5 h-7 rounded-[1px] shadow-sm" alt="tti" />)}
                       </div>
                       <div className="flex-1 bg-white/5 rounded-2xl p-1.5 flex flex-wrap gap-0.5 overflow-y-auto scrollbar-hide border border-white/5">
                           <span className="w-full text-[9px] font-black text-green-400 uppercase px-1 mb-1 tracking-widest opacity-60">피</span>
                           {myCaptured.pi.map((c, i) => <img key={i} src={c.image} className="w-5 h-7 rounded-[1px] shadow-sm" alt="pi" />)}
                       </div>
                    </div>
                </div>
             </div>
             
             {/* Progress/Turn indicator */}
             <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden shadow-inner">
                <div className={`h-full transition-all duration-700 ease-out ${room.turn === user.uid ? 'w-full bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.8)]' : 'w-0 bg-red-600'}`}></div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameView;
