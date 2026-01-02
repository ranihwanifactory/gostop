
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ref, onValue, update, runTransaction, off } from 'firebase/database';
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
        // 방이 없을 경우 즉시 나가지 않고 잠시 기다려 레이스 컨디션 방지
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

      // 데이터가 있으면 타이머 클리어
      if (initialLoadTimerRef.current) {
          clearTimeout(initialLoadTimerRef.current);
          initialLoadTimerRef.current = null;
      }

      setRoom({ ...data, id: roomId });
      setLoading(false);

      // 자동 참가 로직
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
        });
      }
    });
    
    return () => {
        unsubscribe();
        if (initialLoadTimerRef.current) clearTimeout(initialLoadTimerRef.current);
    };
  }, [roomId, user.uid, onLeave]);

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

      const prompt = `맞고 게임 마스터로서 조언해줘.
내 패(월): ${(me.hand || []).map(c => c.month).join(', ')}
바닥 패(월): ${(room.field || []).map(c => c.month).join(', ')}
내 점수: ${me.score}, 상대 점수: ${opponent?.score || 0}
현재 상황에서 어떤 패를 먼저 내서 바닥의 패를 가져오는 것이 유리할지 한국어로 2문장 이내로 짧고 명확하게 조언해줘.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      });
      setAiAdvice(response.text);
    } catch (error) {
      setAiAdvice('지금은 분석이 어렵습니다. 자신의 실력을 믿으세요!');
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

        // 1. 패에서 카드 내기
        me.hand = (me.hand || []).filter((c: Card) => c.id !== card.id);
        const matchIdx = field.findIndex(fc => fc.month === card.month);
        if (matchIdx !== -1) {
          captured.push(card, field.splice(matchIdx, 1)[0]);
        } else {
          field.push(card);
        }

        // 2. 덱에서 뒤집기
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

        // 차례 변경
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

  // 획득한 패 정렬 헬퍼
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
      <div className="relative">
        <i className="fa-solid fa-fan fa-spin text-5xl text-red-600"></i>
        <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-bold">판</span>
        </div>
      </div>
      <p className="mt-4 text-neutral-400 font-medium">대결 데이터를 불러오는 중...</p>
    </div>
  );

  const me = room.players?.[user.uid];
  const opponentId = Object.keys(room.players || {}).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;

  const myCaptured = getGroupedCaptured(me?.captured);
  const oppCaptured = getGroupedCaptured(opponent?.captured);

  return (
    <div className="h-screen w-screen bg-[#0f172a] flex flex-col overflow-hidden select-none">
      {/* HUD 상단 */}
      <div className="p-4 flex items-center justify-between bg-black/40 backdrop-blur-md border-b border-white/5 z-50">
        <button onClick={onLeave} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition">
          <i className="fa-solid fa-chevron-left text-sm"></i>
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs font-bold text-red-500 uppercase tracking-tighter">{room.name}</span>
          <div className="flex items-center gap-2 mt-1">
             <div className={`w-2 h-2 rounded-full animate-pulse ${room.status === 'playing' ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
             <span className="text-[10px] font-bold text-white/40 uppercase">{room.status}</span>
          </div>
        </div>
        <button 
          onClick={getAiStrategyHint}
          disabled={room.turn !== user.uid || isAiLoading}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition ${room.turn === user.uid ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'bg-white/5 text-white/20'}`}
        >
          <i className={`fa-solid fa-lightbulb ${isAiLoading ? 'animate-bounce' : ''}`}></i>
        </button>
      </div>

      {room.status === 'waiting' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-12 game-board">
          <div className="flex items-center gap-12 md:gap-24">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <img src={room.players[room.hostId]?.photo} className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-red-600 shadow-2xl object-cover" alt="host" />
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-red-600 text-[10px] font-black px-3 py-1 rounded-full uppercase">Host</div>
              </div>
              <span className="font-bold text-lg">{room.players[room.hostId]?.name}</span>
            </div>
            <div className="text-4xl md:text-6xl font-black italic text-white/20">VS</div>
            <div className="flex flex-col items-center gap-4">
              {opponent ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <img src={opponent.photo} className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-blue-600 shadow-2xl object-cover" alt="opponent" />
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-blue-600 text-[10px] font-black px-3 py-1 rounded-full uppercase">Guest</div>
                  </div>
                  <span className="font-bold text-lg">{opponent.name}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-dashed border-white/10 bg-white/5 flex flex-col items-center justify-center text-white/20">
                    <i className="fa-solid fa-user-plus text-2xl mb-2"></i>
                    <span className="text-[10px] font-bold uppercase tracking-widest">Waiting</span>
                  </div>
                  <span className="text-white/20 font-bold">상대 대기 중</span>
                </div>
              )}
            </div>
          </div>
          {room.hostId === user.uid && opponent && (
            <button onClick={handleStartGame} className="px-12 py-4 bg-red-600 hover:bg-red-700 text-white font-black text-xl rounded-2xl shadow-xl shadow-red-900/40 transition-all hover:scale-105 active:scale-95">
              대결 시작하기
            </button>
          )}
        </div>
      ) : room.status === 'finished' ? (
        <div className="flex-1 flex flex-col items-center justify-center game-board">
           <div className="bg-black/60 p-12 rounded-[3rem] backdrop-blur-xl border border-white/10 text-center shadow-2xl">
              <h2 className="text-5xl font-black text-red-500 italic mb-8">대결 종료</h2>
              <div className="flex gap-8 mb-10">
                 <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold text-white/40 uppercase">나의 점수</span>
                    <span className="text-4xl font-black text-white">{me?.score || 0}</span>
                 </div>
                 <div className="w-px h-12 bg-white/10 self-center"></div>
                 <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold text-white/40 uppercase">상대 점수</span>
                    <span className="text-4xl font-black text-white">{opponent?.score || 0}</span>
                 </div>
              </div>
              <button onClick={handleStartGame} className="w-full py-4 bg-white text-black font-black rounded-2xl hover:bg-neutral-200 transition active:scale-95">
                다시 한판 더!
              </button>
           </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between p-2 relative game-board">
          {/* AI 조언 레이어 */}
          {aiAdvice && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-[90%] max-w-md">
              <div className="bg-indigo-950/90 backdrop-blur-2xl border border-indigo-500/50 p-6 rounded-3xl shadow-2xl animate-in zoom-in duration-300">
                <div className="flex items-center gap-3 mb-3">
                   <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs">
                     <i className="fa-solid fa-brain"></i>
                   </div>
                   <span className="text-xs font-black text-indigo-300 uppercase">AI Master Advice</span>
                </div>
                <p className="text-white text-lg leading-relaxed font-medium">{aiAdvice}</p>
                <button onClick={() => setAiAdvice(null)} className="mt-4 w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition">조언 닫기</button>
              </div>
            </div>
          )}

          {/* 상대방 영역 */}
          <div className="flex justify-between items-start p-2 h-[20%]">
             <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 bg-black/30 p-2 rounded-2xl border border-white/5 pr-4">
                  <img src={opponent?.photo} className="w-10 h-10 rounded-xl object-cover border-2 border-red-500/50" alt="opp" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-white/40">{opponent?.name}</span>
                    <span className="text-xl font-black text-red-500 leading-none">{opponent?.score || 0} <span className="text-[10px]">점</span></span>
                  </div>
                </div>
                {/* 상대방 획득패 (작게) */}
                <div className="flex gap-1 overflow-x-auto scrollbar-hide max-w-[200px]">
                   {opponent?.captured && opponent.captured.length > 0 && opponent.captured.map((c, i) => (
                       <img key={i} src={c.image} className="w-4 h-6 rounded-[1px]" alt="cap" />
                   ))}
                </div>
             </div>
             
             <div className="flex -space-x-6 md:-space-x-8">
                {(opponent?.hand || []).map((_, i) => (
                  <div key={i} className="w-10 h-14 md:w-14 md:h-20 bg-red-900 rounded-sm border border-black/40 shadow-lg rotate-180 overflow-hidden relative">
                     <img src={HWATU_BACK_IMAGE} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="back" />
                  </div>
                ))}
             </div>
             
             {/* 상대 획득패 상세 그리드 */}
             <div className="w-32 h-full grid grid-cols-4 gap-0.5 bg-black/20 rounded-xl p-1 overflow-y-auto scrollbar-hide">
                {opponent?.captured?.map((c, i) => <img key={i} src={c.image} className="w-full h-auto rounded-[1px]" alt="cap" />)}
             </div>
          </div>

          {/* 바닥 패 (중앙 필드) */}
          <div className="flex-1 flex flex-col items-center justify-center py-4">
             <div className="w-full max-w-4xl bg-black/10 rounded-[4rem] p-8 md:p-12 border border-white/5 flex flex-wrap items-center justify-center gap-2 md:gap-4 relative">
                {(room.field || []).map((c, i) => (
                  <div key={c.id} className="w-10 h-15 md:w-16 md:h-24 lg:w-20 lg:h-30 transform transition-transform hover:scale-110">
                    <img src={c.image} className="w-full h-full rounded-md shadow-2xl border border-white/10 card-shadow" alt="field" />
                  </div>
                ))}
                
                {/* 덱 더미 */}
                <div className="absolute top-1/2 left-4 -translate-y-1/2 flex flex-col items-center">
                    <div className="w-10 h-14 md:w-16 md:h-24 bg-red-950 rounded-lg shadow-[0_10px_0_#450a0a] border border-black/50 overflow-hidden relative">
                       <img src={HWATU_BACK_IMAGE} className="absolute inset-0 w-full h-full object-cover opacity-30" alt="deck" />
                       <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xl font-black text-white/40">{room.deck?.length || 0}</span>
                       </div>
                    </div>
                    <span className="text-[8px] font-bold text-white/20 mt-3 uppercase tracking-widest">Deck</span>
                </div>
             </div>
          </div>

          {/* 나의 영역 */}
          <div className="p-2 h-[35%] flex flex-col justify-end gap-4">
             <div className="flex justify-between items-end gap-4">
                {/* 내 정보 및 점수 */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 bg-black/30 p-2 rounded-2xl border border-white/5 pr-4">
                        <img src={me?.photo} className="w-12 h-12 rounded-xl object-cover border-2 border-blue-500/50" alt="me" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-white/40 uppercase">My Status</span>
                            <span className="text-2xl font-black text-blue-500 leading-none">{me?.score || 0} <span className="text-xs">점</span></span>
                        </div>
                    </div>
                </div>

                {/* 내 패 (핸드) */}
                <div className="flex-1 flex justify-center items-end px-4">
                   <div className="flex gap-1 md:gap-2 max-w-full overflow-x-auto pb-4 scrollbar-hide">
                      {(me?.hand || []).map(c => (
                        <button 
                          key={c.id} 
                          onClick={() => handleCardPlay(c)}
                          disabled={room.turn !== user.uid || isProcessing}
                          className={`group relative transition-all duration-300 transform shrink-0 ${room.turn === user.uid ? 'hover:-translate-y-12 z-50 cursor-pointer' : 'opacity-40 grayscale-[0.5]'}`}
                        >
                          <img src={c.image} className="w-14 h-21 md:w-20 md:h-30 lg:w-24 lg:h-36 rounded-xl shadow-2xl border border-white/10 group-hover:ring-4 ring-yellow-400" alt="hand" />
                          {room.turn === user.uid && (
                              <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-yellow-400 text-black text-[10px] font-black px-3 py-1 rounded-full whitespace-nowrap">
                                내기
                              </div>
                          )}
                        </button>
                      ))}
                   </div>
                </div>

                {/* 내 획득패 분류 레이아웃 */}
                <div className="w-48 md:w-72 h-32 bg-black/40 rounded-3xl border border-white/10 p-3 flex flex-col gap-2 overflow-hidden backdrop-blur-md">
                    <div className="flex gap-2 h-1/2">
                       <div className="flex-1 bg-white/5 rounded-xl p-1 flex flex-wrap gap-0.5 overflow-y-auto scrollbar-hide">
                           <span className="w-full text-[8px] font-bold text-yellow-500 uppercase px-1">광</span>
                           {myCaptured.kwang.map((c, i) => <img key={i} src={c.image} className="w-4 h-6 rounded-[1px]" alt="kw" />)}
                       </div>
                       <div className="flex-1 bg-white/5 rounded-xl p-1 flex flex-wrap gap-0.5 overflow-y-auto scrollbar-hide">
                           <span className="w-full text-[8px] font-bold text-red-400 uppercase px-1">열끗</span>
                           {myCaptured.yul.map((c, i) => <img key={i} src={c.image} className="w-4 h-6 rounded-[1px]" alt="yul" />)}
                       </div>
                    </div>
                    <div className="flex gap-2 h-1/2">
                       <div className="flex-1 bg-white/5 rounded-xl p-1 flex flex-wrap gap-0.5 overflow-y-auto scrollbar-hide">
                           <span className="w-full text-[8px] font-bold text-blue-400 uppercase px-1">띠</span>
                           {myCaptured.tti.map((c, i) => <img key={i} src={c.image} className="w-4 h-6 rounded-[1px]" alt="tti" />)}
                       </div>
                       <div className="flex-1 bg-white/5 rounded-xl p-1 flex flex-wrap gap-0.5 overflow-y-auto scrollbar-hide">
                           <span className="w-full text-[8px] font-bold text-green-400 uppercase px-1">피</span>
                           {myCaptured.pi.map((c, i) => <img key={i} src={c.image} className="w-4 h-6 rounded-[1px]" alt="pi" />)}
                       </div>
                    </div>
                </div>
             </div>
             
             {/* 현재 턴 표시바 */}
             <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-500 ${room.turn === user.uid ? 'w-full bg-blue-500' : 'w-0 bg-red-500'}`}></div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameView;