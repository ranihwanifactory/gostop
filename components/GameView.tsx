
import React, { useState, useEffect } from 'react';
import { ref, onValue, update, runTransaction } from 'firebase/database';
import { db } from '../firebase';
import { GameRoom, Card } from '../types';
import { INITIAL_DECK, HWATU_BACK_IMAGE } from '../constants';
// Correct import for Google GenAI SDK
import { GoogleGenAI } from "@google/genai";

interface GameViewProps {
  roomId: string;
  user: any;
  onLeave: () => void;
}

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

const GameView: React.FC<GameViewProps> = ({ roomId, user, onLeave }) => {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        onLeave();
        return;
      }
      setRoom({ ...data, id: roomId });
      setLoading(false);

      if (data.status === 'waiting' && Object.keys(data.players || {}).length < 2 && !data.players[user.uid]) {
        update(roomRef, {
          [`players/${user.uid}`]: {
            uid: user.uid,
            name: user.displayName || 'Guest',
            photo: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`,
            hand: [],
            captured: [],
            score: 0
          }
        });
      }
    });
    
    return () => unsubscribe();
  }, [roomId, user.uid, onLeave, user.displayName, user.photoURL]);

  // Fix: Gemini API Strategy Advisor following strict GenAI SDK guidelines
  const getAiStrategyHint = async () => {
    if (!room || room.status !== 'playing' || room.turn !== user.uid || isAiLoading) return;
    setIsAiLoading(true);
    try {
      // Correct initialization using named parameter and direct process.env.API_KEY
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const me = room.players[user.uid];
      const opponentId = Object.keys(room.players).find(id => id !== user.uid);
      const opponent = opponentId ? room.players[opponentId] : null;

      const prompt = `You are a Matgo (Korean Hwatu game) master. 
Analyze the current game state and give expert, brief strategy advice in Korean.
My hand months: ${me.hand.map(c => c.month).join(', ')}
Field cards months: ${room.field.map(c => c.month).join(', ')}
My score: ${me.score}, Opponent score: ${opponent?.score || 0}
Provide advice on what card months to prioritize for matching or what to watch out for. Limit to 2 sentences.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      });
      // Directly access .text property from GenerateContentResponse
      setAiAdvice(response.text);
    } catch (error) {
      console.error('Gemini error:', error);
      setAiAdvice('AI 조언을 가져오는 데 실패했습니다.');
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
        const opponentId = playerIds.find(id => id !== user.uid);
        const opponent = opponentId ? players[opponentId] : null;

        if (me.hand.length === 0 && (!opponent || (opponent.hand?.length || 0) === 0)) {
          current.status = 'finished';
        }

        current.players = players;
        current.field = field;
        current.deck = deck;
        current.turn = nextTurn;
        current.lastUpdate = Date.now();
        return current;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading || !room) return (
    <div className="h-screen bg-neutral-900 flex flex-col items-center justify-center text-white">
      <i className="fa-solid fa-sync fa-spin text-4xl text-red-600 mb-4"></i>
      <p className="text-xl font-bold">대결 준비 중...</p>
    </div>
  );

  const me = room.players[user.uid];
  const opponentId = Object.keys(room.players).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;

  return (
    <div className="h-screen w-screen bg-[#0f172a] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-800 to-neutral-950 flex flex-col p-4 md:p-6 overflow-hidden select-none text-white font-sans">
      {/* Top HUD */}
      <div className="flex justify-between items-center z-10 mb-2">
        <button onClick={onLeave} className="bg-white/10 hover:bg-white/20 p-3 rounded-full border border-white/20 transition">
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        <div className="text-center">
            <h1 className="text-xl font-black italic tracking-tighter text-red-500 uppercase drop-shadow-lg">{room.name}</h1>
            <div className={`text-[10px] font-black px-4 py-1 rounded-full mt-1 ${room.turn === user.uid ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/40'}`}>
                {room.status === 'playing' ? (room.turn === user.uid ? '나의 차례' : '상대 차례') : '대결 전'}
            </div>
        </div>
        <button 
          onClick={getAiStrategyHint}
          disabled={room.turn !== user.uid || isAiLoading}
          className={`p-3 rounded-full transition border ${room.turn === user.uid ? 'bg-indigo-600/20 border-indigo-400 text-indigo-400 hover:bg-indigo-600/40' : 'bg-neutral-800/50 border-white/5 text-neutral-600'}`}
          title="AI 조언 받기"
        >
          <i className={`fa-solid fa-brain ${isAiLoading ? 'animate-pulse' : ''}`}></i>
        </button>
      </div>

      {room.status === 'waiting' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-10">
          <div className="flex flex-col md:flex-row items-center gap-10 md:gap-20">
            <div className="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-left-8">
               <img src={room.players[room.hostId]?.photo} className="w-28 h-28 md:w-40 md:h-40 rounded-full border-4 border-red-600 shadow-2xl object-cover" alt="host" />
               <div className="font-black text-xl text-white">{room.players[room.hostId]?.name}</div>
            </div>
            <div className="text-4xl md:text-7xl font-black italic text-white/5 tracking-widest">VERSUS</div>
            <div className="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-right-8">
               {opponent ? (
                 <>
                   <img src={opponent.photo} className="w-28 h-28 md:w-40 md:h-40 rounded-full border-4 border-blue-600 shadow-2xl object-cover" alt="opponent" />
                   <div className="font-black text-xl text-white">{opponent.name}</div>
                 </>
               ) : (
                 <div className="w-28 h-28 md:w-40 md:h-40 rounded-full border-4 border-dashed border-white/10 flex flex-col items-center justify-center bg-white/5">
                   <i className="fa-solid fa-user-plus text-white/10 text-3xl mb-2"></i>
                   <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Waiting</span>
                 </div>
               )}
            </div>
          </div>
          {room.hostId === user.uid && opponent && (
            <button onClick={handleStartGame} className="bg-red-600 hover:bg-red-700 text-white font-black px-12 py-5 rounded-2xl text-2xl shadow-xl transition-all hover:scale-110 active:scale-95">
              대결 시작
            </button>
          )}
        </div>
      ) : room.status === 'finished' ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
           <h2 className="text-6xl md:text-8xl font-black italic text-red-600 mb-6 drop-shadow-[0_0_30px_rgba(220,38,38,0.5)]">GAME OVER</h2>
           <div className="flex gap-6 md:gap-12 mb-12">
              <div className="p-8 bg-black/40 rounded-3xl border border-white/5">
                 <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest mb-1">나의 점수</div>
                 <div className="text-5xl font-black text-blue-400">{me?.score || 0}</div>
              </div>
              <div className="p-8 bg-black/40 rounded-3xl border border-white/5">
                 <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest mb-1">상대 점수</div>
                 <div className="text-5xl font-black text-red-400">{opponent?.score || 0}</div>
              </div>
           </div>
           <button onClick={handleStartGame} className="bg-white text-black font-black px-16 py-5 rounded-2xl hover:bg-neutral-200 transition-all active:scale-95 shadow-xl text-xl">
             다시 대결하기
           </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between py-2 relative">
          {/* AI Advice Tooltip */}
          {aiAdvice && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md animate-in zoom-in duration-300">
              <div className="bg-indigo-950/90 backdrop-blur-xl border border-indigo-500/50 p-6 rounded-3xl shadow-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <i className="fa-solid fa-brain text-indigo-400"></i>
                  <h3 className="text-indigo-400 font-black text-xs uppercase tracking-widest">Master Advisor</h3>
                </div>
                <p className="text-indigo-50 text-lg leading-relaxed">{aiAdvice}</p>
                <button onClick={() => setAiAdvice(null)} className="mt-4 text-[10px] font-bold uppercase text-indigo-400 hover:text-white transition">닫기</button>
              </div>
            </div>
          )}

          {/* Opponent Zone */}
          <div className="flex justify-between items-start">
             <div className="flex gap-4 p-3 bg-black/40 rounded-2xl border border-white/5 backdrop-blur-sm">
                <img src={opponent?.photo} className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-red-500 object-cover shadow-lg" alt="opponent" />
                <div className="flex flex-col justify-center">
                   <div className="text-[10px] opacity-40 truncate max-w-[80px] uppercase font-bold">{opponent?.name}</div>
                   <div className="text-xl font-black text-red-500 leading-none">{opponent?.score || 0} <span className="text-[10px] opacity-60 font-bold">PTS</span></div>
                </div>
             </div>
             <div className="flex -space-x-8 md:-space-x-10">
                {(opponent?.hand || []).map((_, i) => (
                  <img key={i} src={HWATU_BACK_IMAGE} className="w-10 h-14 md:w-12 md:h-18 rounded-sm border border-black/50 shadow-lg brightness-75 rotate-180" alt="opponent card" />
                ))}
             </div>
             <div className="w-32 md:w-64 h-16 md:h-24 bg-black/30 rounded-2xl grid grid-cols-5 md:grid-cols-6 gap-1 p-2 overflow-y-auto border border-white/5">
                {(opponent?.captured || []).map((c, i) => <img key={`${c.id}-${i}`} src={c.image} className="w-full h-auto rounded-[1px] shadow-sm" alt="captured" />)}
             </div>
          </div>

          {/* Table Center */}
          <div className="flex-1 flex items-center justify-center relative my-4">
             <div className="w-full max-w-4xl p-6 md:p-12 bg-white/5 rounded-[40px] md:rounded-[80px] border border-white/10 grid grid-cols-4 md:grid-cols-8 gap-3 md:gap-5 place-items-center shadow-[inset_0_0_100px_rgba(0,0,0,0.5)]">
                {(room.field || []).map(c => (
                  <div key={c.id} className="hwatu-card w-12 md:w-16 lg:w-20 hover:scale-110 transition-transform">
                     <img src={c.image} className="w-full h-auto rounded-sm shadow-2xl border border-white/5" alt="field" />
                  </div>
                ))}
                {/* Deck Pile */}
                <div className="relative w-12 h-18 md:w-16 md:h-24 lg:w-20 lg:h-28 bg-red-950 rounded-lg shadow-2xl flex items-center justify-center border-b-8 border-red-950/50 transform hover:scale-105 transition-transform">
                    <img src={HWATU_BACK_IMAGE} className="absolute inset-0 w-full h-full object-cover opacity-20" alt="deck back" />
                    <div className="relative z-10 flex flex-col items-center">
                      <span className="font-black text-2xl md:text-3xl text-white drop-shadow-2xl">{room.deck?.length || 0}</span>
                      <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">DECK</span>
                    </div>
                </div>
             </div>
          </div>

          {/* My Zone */}
          <div className="flex justify-between items-end gap-6">
             <div className="flex gap-4 p-3 bg-black/40 rounded-2xl border border-white/5 backdrop-blur-sm">
                <img src={me?.photo} className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-blue-500 object-cover shadow-lg" alt="me" />
                <div className="flex flex-col justify-center">
                   <div className="text-[10px] font-bold opacity-40 uppercase">나의 점수</div>
                   <div className="text-xl font-black text-blue-500 leading-none">{me?.score || 0} <span className="text-[10px] opacity-60 font-bold">PTS</span></div>
                </div>
             </div>
             <div className="flex-1 flex justify-center items-end px-4">
                <div className="flex gap-1 md:gap-2 max-w-full overflow-x-auto pb-4 scrollbar-hide">
                  {(me?.hand || []).map(c => (
                    <button 
                      key={c.id} 
                      onClick={() => handleCardPlay(c)}
                      disabled={room.turn !== user.uid || isProcessing}
                      className={`hwatu-card group relative transition-all duration-300 transform shrink-0 ${room.turn === user.uid ? 'hover:-translate-y-16 hover:scale-125 z-10 cursor-pointer active:scale-95' : 'opacity-60 grayscale-[0.2]'} ${isProcessing ? 'animate-pulse' : ''}`}
                    >
                      <img src={c.image} className="w-14 md:w-20 lg:w-24 rounded-md shadow-[0_15px_30px_rgba(0,0,0,0.6)] border border-white/10 group-hover:ring-4 ring-yellow-400/30" alt="hand card" />
                      {room.turn === user.uid && <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-yellow-400 text-black text-[10px] font-black px-2 py-1 rounded-full whitespace-nowrap shadow-xl">PLAY CARD</div>}
                    </button>
                  ))}
                </div>
             </div>
             <div className="w-32 md:w-64 h-16 md:h-24 bg-black/30 rounded-2xl grid grid-cols-5 md:grid-cols-6 gap-1 p-2 overflow-y-auto border border-white/5">
                {(me?.captured || []).map((c, i) => <img key={`${c.id}-${i}`} src={c.image} className="w-full h-auto rounded-[1px] shadow-sm" alt="my captured" />)}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameView;
