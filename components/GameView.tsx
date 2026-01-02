
import React, { useState, useEffect } from 'react';
import { ref, onValue, update, runTransaction, get } from 'firebase/database';
import { db } from '../firebase';
import { GameRoom, Card, Player } from '../types';
import { INITIAL_DECK, HWATU_BACK_IMAGE } from '../constants';

const HwatuCard: React.FC<{ card?: Card, isBack?: boolean, className?: string, onClick?: () => void, disabled?: boolean }> = ({ card, isBack, className, onClick, disabled }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  // 뒷면 처리
  if (isBack) {
    return (
      <div className={`relative ${className} hwatu-card-shadow rounded-[3px] border border-black/30 bg-[#c0392b] overflow-hidden flex-shrink-0`}>
        <img 
          src={HWATU_BACK_IMAGE} 
          alt="back" 
          loading="eager"
          className={`w-full h-full object-cover transition-opacity duration-200 ${status === 'success' ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setStatus('success')}
          onError={() => setStatus('error')}
        />
        {status !== 'success' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#c0392b]">
            <span className="font-black text-white/20 text-[8px] rotate-45 select-none">MATGO</span>
          </div>
        )}
      </div>
    );
  }

  if (!card) return null;

  const typeLabels: Record<string, string> = { 
    Kwang: '光', Yul: '열', Tti: '띠', Pi: '피', SsangPi: '쌍' 
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`relative ${className} hwatu-card-shadow rounded-[3px] border border-black/20 bg-white overflow-hidden transition-all transform flex-shrink-0 ${disabled ? 'opacity-60 grayscale-[0.5]' : 'hover:z-30 hover:scale-105 active:scale-90 cursor-pointer'}`}
    >
      <img 
        src={card.image} 
        alt={card.name} 
        loading="eager"
        className={`w-full h-full object-fill transition-opacity duration-200 ${status === 'success' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setStatus('success')}
        onError={() => setStatus('error')}
      />
      
      {status !== 'success' && (
        <div className="absolute inset-0 flex flex-col items-center justify-between p-0.5 bg-white select-none">
          <div className="w-full flex justify-between items-start">
             <span className="text-[10px] sm:text-[14px] font-black leading-none" style={{ color: card.color }}>{card.month}</span>
          </div>
          <div className="flex-1 flex items-center justify-center">
             <span className="text-[10px] opacity-30" style={{ color: card.color }}>🎴</span>
          </div>
          <div className="w-full text-right">
             <span className={`text-[8px] font-black px-0.5 rounded ${card.type === 'Kwang' ? 'bg-red-600 text-white' : 'text-black opacity-60'}`}>
                {typeLabels[card.type]}
             </span>
          </div>
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
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) { onLeave(); return; }
      setRoom({ ...data, id: roomId });
    });

    const joinRoom = async () => {
      const snapshot = await get(roomRef);
      const data = snapshot.val();
      if (data && data.status === 'waiting' && !data.players[user.uid] && Object.keys(data.players).length < 2) {
        await update(ref(db, `rooms/${roomId}/players`), {
          [user.uid]: {
            uid: user.uid,
            name: user.displayName || '플레이어',
            photo: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'P'}`,
            hand: [],
            captured: [],
            score: 0
          }
        });
      }
    };
    joinRoom();
    return () => unsubscribe();
  }, [roomId, user.uid, onLeave]);

  const handleStartGame = async () => {
    if (!room || Object.keys(room.players).length < 2) return;
    const shuffled = [...INITIAL_DECK].sort(() => Math.random() - 0.5);
    const players = { ...room.players };
    const pIds = Object.keys(players);
    
    pIds.forEach(id => {
      players[id].hand = shuffled.splice(0, 10);
      players[id].captured = [];
      players[id].score = 0;
    });

    const field = shuffled.splice(0, 8);
    const deck = shuffled;

    await update(ref(db, `rooms/${roomId}`), {
      status: 'playing',
      players,
      field,
      deck,
      turn: room.hostId,
      lastUpdate: Date.now()
    });
  };

  const handleCardPlay = async (card: Card) => {
    if (!room || room.turn !== user.uid || isProcessing || room.status !== 'playing') return;
    setIsProcessing(true);
    
    try {
      await runTransaction(ref(db, `rooms/${roomId}`), (current) => {
        if (!current) return current;
        let deck = [...(current.deck || [])];
        let field = [...(current.field || [])];
        let me = current.players[user.uid];
        let captured: Card[] = [];

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
        me.score = me.captured.length;
        const opponentId = Object.keys(current.players).find(id => id !== user.uid);
        current.turn = opponentId || user.uid;
        const anyHandEmpty = Object.values(current.players).some((p: any) => !p.hand || p.hand.length === 0);
        if (anyHandEmpty) current.status = 'finished';

        current.deck = deck;
        current.field = field;
        return current;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!room) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#1a3a16] p-4 text-center">
       <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
       <p className="text-white font-black animate-pulse tracking-widest uppercase text-sm">Loading Match...</p>
    </div>
  );

  const me = room.players[user.uid] || { name: '나', photo: '', score: 0, hand: [], captured: [] };
  const opponentId = Object.keys(room.players).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;
  const isMyTurn = room.turn === user.uid && room.status === 'playing';

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row bg-[#1a3a16] game-board-bg overflow-hidden text-white font-sans">
      
      {/* 상단바 (모바일용 정보창) */}
      <div className="md:hidden flex justify-between items-center p-3 bg-black/40 border-b border-white/10 z-50">
         <div className="flex items-center gap-2">
            <img src={opponent?.photo || 'https://ui-avatars.com/api/?name=W'} className="w-6 h-6 rounded border border-red-500" />
            <span className="text-[10px] font-bold opacity-60 truncate max-w-[60px]">{opponent?.name || '대기중'}</span>
            <span className="score-badge px-2 py-0.5 rounded-full text-xs font-black italic">{opponent?.score || 0}</span>
         </div>
         <h1 className="text-lg font-black italic text-red-600 tracking-tighter">MATGO</h1>
         <div className="flex items-center gap-2">
            <span className="score-badge px-2 py-0.5 rounded-full text-xs font-black italic">{me.score}</span>
            <span className="text-[10px] font-bold text-blue-400 truncate max-w-[60px]">{me.name}</span>
            <img src={me.photo} className="w-6 h-6 rounded border border-blue-500" />
         </div>
      </div>

      {/* 메인 게임 테이블 */}
      <div className="flex-1 flex flex-col p-2 sm:p-4 relative overflow-hidden">
        
        {/* 상대방 영역 (PC에선 상단, 모바일에선 바닥 가이드) */}
        <div className="hidden md:flex justify-between items-start h-[120px]">
          <div className="w-1/3 flex flex-wrap gap-0.5 p-2 bg-black/20 rounded-xl content-start overflow-hidden border border-white/5">
            {opponent?.captured?.map((c, i) => <img key={i} src={c.image} className="w-5 h-8 rounded-[1px]" />)}
          </div>
          <div className="flex -space-x-8 mt-2 opacity-60">
            {(opponent?.hand || []).map((_, i) => <HwatuCard key={i} isBack className="w-12 h-18 rotate-180" />)}
          </div>
          <div className="w-1/3 text-right">
             <div className="score-badge px-6 py-1 rounded-full text-2xl font-black italic shadow-lg">{opponent?.score || 0}</div>
          </div>
        </div>

        {/* 바닥 (Field) */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-4 p-4 sm:p-10 bg-black/10 rounded-[2rem] sm:rounded-[4rem] border border-white/5 shadow-inner place-items-center w-full max-w-4xl">
            {(room.field || []).map((c, idx) => (
              <HwatuCard key={`${c.id}-${idx}`} card={c} className="w-12 h-18 sm:w-18 sm:h-28 animate-deal" />
            ))}
            {room.status === 'waiting' && (
              <div className="col-span-4 sm:col-span-6 flex flex-col items-center gap-2 opacity-20">
                <i className="fa-solid fa-gamepad text-4xl animate-bounce"></i>
                <p className="text-xs sm:text-xl font-black italic tracking-widest uppercase">Waiting Turn...</p>
              </div>
            )}
          </div>
          
          {/* 더미 (Deck) - 모바일에서 위치 조정 */}
          <div className="absolute right-2 sm:right-8 top-1/2 -translate-y-1/2 flex flex-col items-center">
            <div className="relative">
               <HwatuCard isBack className="w-10 h-14 sm:w-16 sm:h-24 shadow-2xl" />
               <div className="absolute -top-1 -left-1 w-full h-full border border-white/10 rounded-[3px]"></div>
            </div>
            <span className="mt-2 font-black text-yellow-500 text-sm sm:text-xl">{room.deck?.length || 0}</span>
          </div>
        </div>

        {/* 내 영역 (손패 및 획득패) */}
        <div className="h-auto md:h-[260px] flex flex-col justify-end gap-2">
           {/* 획득패 (모바일: 작게 표시) */}
           <div className="hidden md:flex w-full bg-black/40 p-2 rounded-2xl border border-white/10 h-32 overflow-y-auto scrollbar-hide flex-wrap gap-1 content-start">
              {me.captured?.map((c, i) => <img key={i} src={c.image} className="w-6 h-9 rounded-[1px]" />)}
           </div>

           <div className="flex justify-between items-end gap-2 sm:gap-6">
              {/* 내 손패 - 모바일에서 겹치기 효과 강화 */}
              <div className="flex-1 flex justify-center items-end -space-x-4 sm:space-x-1 pb-2">
                 {(me.hand || []).map(c => (
                   <HwatuCard 
                     key={c.id} 
                     card={c} 
                     onClick={() => handleCardPlay(c)}
                     disabled={!isMyTurn || isProcessing}
                     className={`w-14 h-22 sm:w-24 sm:h-36 shadow-2xl transition-all duration-200 ${isMyTurn ? 'hover:-translate-y-8 active:-translate-y-12 ring-2 sm:ring-4 ring-yellow-400 z-10' : 'opacity-40 grayscale-[0.3]'}`}
                   />
                 ))}
                 {room.status === 'playing' && (!me.hand || me.hand.length === 0) && <p className="text-[10px] text-white/20 font-black animate-pulse">FINISHING...</p>}
              </div>

              {/* 내 점수 (PC 전용 크게 표시) */}
              <div className="hidden md:flex flex-col items-end w-40">
                 <div className="score-badge px-8 py-2 rounded-full text-4xl font-black italic shadow-2xl border-2 border-yellow-300/30 mb-3">{me.score}</div>
                 <div className={`w-full py-2 rounded-xl text-xs font-black text-center ${isMyTurn ? 'bg-blue-600 border-blue-400 animate-pulse' : 'bg-white/5 opacity-40'}`}>
                    {isMyTurn ? 'MY TURN' : 'WAITING'}
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* 우측 사이드바 (모바일은 가로 스크롤 또는 숨김 처리 가능하지만 여기서는 PC 최적화로 유지하며 모바일에서 하단 배치 고려) */}
      <div className="w-full md:w-[220px] hud-panel p-4 md:p-6 flex flex-row md:flex-col items-center md:items-stretch gap-4 md:gap-6 shadow-2xl bg-black/40 z-50 border-t md:border-t-0 md:border-l border-white/10">
        <div className="hidden md:block text-center">
           <h1 className="text-3xl font-black italic text-red-600 tracking-tighter leading-none mb-1">MATGO</h1>
           <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.4em]">Master Pro</span>
        </div>

        <div className="hidden md:flex bg-black/40 rounded-2xl p-4 border border-white/5 flex-col gap-3 shadow-inner">
           <div className={`flex items-center gap-2 p-2 rounded-xl border ${!isMyTurn && room.status === 'playing' ? 'bg-red-900/20 border-red-500/50' : 'border-transparent'}`}>
              <img src={opponent?.photo || 'https://ui-avatars.com/api/?name=W'} className="w-8 h-8 rounded border border-white/10" />
              <div className="flex-1 overflow-hidden">
                <p className="text-[10px] font-bold truncate opacity-80">{opponent?.name || 'Waiting'}</p>
                <p className="text-[9px] text-white/40 font-black uppercase">{opponent?.hand?.length || 0} Cards</p>
              </div>
           </div>
           <div className={`flex items-center gap-2 p-2 rounded-xl border ${isMyTurn ? 'bg-blue-900/20 border-blue-500/50' : 'border-transparent'}`}>
              <img src={me.photo} className="w-8 h-8 rounded border border-white/10" />
              <div className="flex-1 overflow-hidden">
                <p className="text-[10px] font-bold truncate text-blue-400">{me.name}</p>
                <p className="text-[9px] text-white/40 font-black uppercase">{me.hand?.length || 0} Cards</p>
              </div>
           </div>
        </div>

        <div className="flex-1 md:mt-auto flex flex-row md:flex-col gap-2 w-full">
           <button onClick={onLeave} className="flex-1 md:w-full py-2 sm:py-3 rounded-xl bg-neutral-900 hover:bg-red-950 font-black text-[10px] sm:text-xs shadow-xl border border-white/5 uppercase tracking-widest">Exit</button>
           
           {room.status === 'waiting' && room.hostId === user.uid && opponent && (
              <button onClick={handleStartGame} className="flex-[2] md:w-full py-3 md:py-8 rounded-xl md:rounded-[2rem] score-badge font-black text-sm md:text-3xl shadow-2xl animate-pulse">START</button>
           )}

           {room.status === 'finished' && room.hostId === user.uid && (
              <button onClick={handleStartGame} className="flex-[2] md:w-full py-3 md:py-6 rounded-xl md:rounded-[1.5rem] score-badge font-black text-sm md:text-xl shadow-2xl">REMATCH</button>
           )}
        </div>
        
        {/* 모바일 턴 표시기 */}
        <div className="md:hidden">
           <div className={`px-4 py-2 rounded-full text-[10px] font-black ${isMyTurn ? 'bg-blue-600 animate-bounce' : 'bg-red-600 opacity-50'}`}>
              {isMyTurn ? 'YOUR TURN' : 'OPPONENT'}
           </div>
        </div>
      </div>

      {/* 게임 종료 레이어 */}
      {room.status === 'finished' && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-center">
           <div className="bg-neutral-900 border-4 border-red-600 p-8 rounded-[3rem] shadow-[0_0_50px_rgba(220,38,38,0.5)] max-w-sm w-full animate-in zoom-in duration-300">
              <h2 className="text-5xl font-black italic text-yellow-500 mb-2 tracking-tighter uppercase">GameOver</h2>
              <div className="my-6 space-y-2">
                 <p className="text-xl font-bold flex justify-between px-4"><span>Me</span> <span className="text-blue-400">{me.score}</span></p>
                 <p className="text-xl font-bold flex justify-between px-4 opacity-50"><span>Enemy</span> <span>{opponent?.score || 0}</span></p>
              </div>
              <div className="text-3xl font-black mb-8 animate-bounce">
                 {me.score > (opponent?.score || 0) ? 'YOU WIN! 🏆' : 'YOU LOSE... 💀'}
              </div>
              <button onClick={onLeave} className="w-full py-4 bg-white text-black font-black rounded-2xl hover:bg-neutral-200 transition">BACK TO LOBBY</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default GameView;
