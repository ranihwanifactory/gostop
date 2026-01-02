
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
      <div className={`relative ${className} hwatu-card-shadow rounded-[4px] border border-black/30 bg-[#c0392b] overflow-hidden`}>
        <img 
          src={HWATU_BACK_IMAGE} 
          alt="back" 
          className={`w-full h-full object-cover transition-opacity duration-300 ${status === 'success' ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setStatus('success')}
          onError={() => setStatus('error')}
        />
        {status !== 'success' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#c0392b]">
            <div className="w-full h-full border-2 border-white/10 flex items-center justify-center">
              <span className="font-black text-white/20 text-[10px] rotate-45">MATGO</span>
            </div>
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
      className={`relative ${className} hwatu-card-shadow rounded-[4px] border border-black/20 bg-white overflow-hidden transition-all transform ${disabled ? 'opacity-60 cursor-default' : 'hover:z-30 hover:scale-110 active:scale-95 cursor-pointer'}`}
    >
      <img 
        src={card.image} 
        alt={card.name} 
        className={`w-full h-full object-fill transition-opacity duration-300 ${status === 'success' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setStatus('success')}
        onError={() => setStatus('error')}
      />
      
      {/* 이미지 로딩 중 또는 실패 시 대체 UI */}
      {status !== 'success' && (
        <div className="absolute inset-0 flex flex-col items-center justify-between p-1 bg-white select-none">
          <div className="w-full flex justify-between items-start">
             <span className="text-[14px] font-black leading-none" style={{ color: card.color }}>{card.month}</span>
             <span className="text-[7px] font-bold opacity-40">{card.name.substring(0,2)}</span>
          </div>
          <div className="flex-1 flex items-center justify-center">
             {status === 'loading' ? (
               <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
             ) : (
               <span className="text-xl opacity-20" style={{ color: card.color }}>🎴</span>
             )}
          </div>
          <div className="w-full text-right">
             <span className={`text-[9px] font-black px-1 rounded ${card.type === 'Kwang' ? 'bg-red-600 text-white' : 'text-black opacity-60'}`}>
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
    
    // 카드 섞기
    const shuffled = [...INITIAL_DECK].sort(() => Math.random() - 0.5);
    const players = { ...room.players };
    const pIds = Object.keys(players);
    
    // 맞고 기준: 각자 10장, 바닥 8장, 더미 20장
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

        // 1. 내 손패에서 카드 내기
        me.hand = (me.hand || []).filter((c: Card) => c.id !== card.id);
        const matchIdx = field.findIndex(fc => fc.month === card.month);
        if (matchIdx !== -1) {
          captured.push(card, field.splice(matchIdx, 1)[0]);
        } else {
          field.push(card);
        }

        // 2. 더미에서 카드 뒤집기
        if (deck.length > 0) {
          const flipped = deck.shift();
          const dMatchIdx = field.findIndex(fc => fc.month === flipped.month);
          if (dMatchIdx !== -1) {
            captured.push(flipped, field.splice(dMatchIdx, 1)[0]);
          } else {
            field.push(flipped);
          }
        }

        // 3. 점수 계산 (단순하게 획득 장수로 계산)
        me.captured = [...(me.captured || []), ...captured];
        me.score = me.captured.length;

        // 4. 턴 교체
        const opponentId = Object.keys(current.players).find(id => id !== user.uid);
        current.turn = opponentId || user.uid;

        // 5. 종료 체크 (둘 중 한 명이라도 손패가 없으면 종료)
        const anyHandEmpty = Object.values(current.players).some((p: any) => !p.hand || p.hand.length === 0);
        if (anyHandEmpty) {
          current.status = 'finished';
        }

        current.deck = deck;
        current.field = field;
        return current;
      });
    } catch (e) {
      console.error("Play Error:", e);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!room) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#1a3a16]">
       <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
       <p className="text-white font-bold animate-pulse tracking-widest uppercase">Matching Connection...</p>
    </div>
  );

  const me = room.players[user.uid] || { name: '나', photo: '', score: 0, hand: [], captured: [] };
  const opponentId = Object.keys(room.players).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;

  const isMyTurn = room.turn === user.uid && room.status === 'playing';

  return (
    <div className="h-screen w-screen flex bg-[#1a3a16] game-board-bg overflow-hidden text-white">
      {/* 메인 게임 영역 */}
      <div className="flex-1 flex flex-col p-4 relative border-r border-white/5">
        
        {/* 상대방 영역 */}
        <div className="h-[140px] flex justify-between items-start">
          <div className="w-1/3 flex flex-wrap gap-0.5 p-2 bg-black/20 rounded-xl min-h-[80px] content-start overflow-hidden border border-white/5">
            {opponent?.captured?.map((c, i) => (
               <img key={i} src={c.image} className="w-6 h-9 rounded-[2px] shadow-sm border border-black/10" alt="captured" />
            ))}
            {(!opponent?.captured || opponent.captured.length === 0) && <span className="text-[10px] text-white/20 p-2 uppercase">No Captured</span>}
          </div>
          
          <div className="flex -space-x-10 mt-4 transition-all duration-500">
            {opponent?.hand ? (
              opponent.hand.map((_, i) => <HwatuCard key={i} isBack className="w-14 h-20 rotate-180 transform hover:-translate-y-2 transition-transform" />)
            ) : (
              <div className="text-white/10 font-black text-4xl italic select-none">READY</div>
            )}
          </div>

          <div className="w-1/3 text-right">
             <div className="inline-block score-badge px-8 py-2 rounded-full text-3xl font-black italic shadow-2xl border-2 border-yellow-300/30">
                {opponent?.score || 0}
             </div>
             <p className="text-[10px] mt-1 font-bold text-white/40 uppercase mr-4 tracking-tighter">Opponent Points</p>
          </div>
        </div>

        {/* 바닥 영역 (Field) */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="grid grid-cols-6 gap-6 p-10 bg-black/10 rounded-[4rem] border border-white/5 shadow-inner min-w-[60%] min-h-[50%] place-items-center">
            {(room.field || []).map((c, idx) => (
              <HwatuCard key={`${c.id}-${idx}`} card={c} className="w-18 h-28 animate-deal" />
            ))}
            {room.status === 'waiting' && (
              <div className="col-span-6 flex flex-col items-center gap-4 opacity-30">
                <i className="fa-solid fa-hourglass-half text-6xl animate-pulse"></i>
                <p className="text-2xl font-black italic tracking-widest uppercase">Waiting for Opponent...</p>
              </div>
            )}
          </div>
          
          {/* 더미 (Deck) */}
          <div className="absolute right-12 top-1/2 -translate-y-1/2 flex flex-col items-center group">
            <div className="relative">
               {[...Array(Math.min(5, room.deck?.length || 0))].map((_, i) => (
                 <HwatuCard key={i} isBack className="w-20 h-30 shadow-2xl absolute" style={{ top: i*-2, left: i*-1 }} />
               ))}
               <HwatuCard isBack className="w-20 h-30 shadow-2xl relative" />
            </div>
            <span className="mt-4 font-black text-yellow-500 text-xl drop-shadow-lg">{room.deck?.length || 0}</span>
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Deck</span>
          </div>
        </div>

        {/* 내 영역 */}
        <div className="h-[280px] flex flex-col justify-end">
           <div className="flex justify-between items-end gap-8 mb-6">
              {/* 획득한 패 */}
              <div className="w-80 bg-black/40 p-4 rounded-3xl border border-white/10 shadow-2xl h-44 overflow-y-auto scrollbar-hide flex flex-wrap gap-1 content-start">
                 {me.captured?.map((c, i) => (
                    <img key={i} src={c.image} className="w-8 h-12 rounded-[2px] shadow-md border border-black/10" alt="my-captured" />
                 ))}
                 {(!me.captured || me.captured.length === 0) && <span className="text-[10px] text-white/20 p-2 uppercase">Nothing Captured</span>}
              </div>

              {/* 손패 */}
              <div className="flex-1 flex justify-center items-end px-4 gap-2">
                 {(me.hand || []).map(c => (
                   <HwatuCard 
                     key={c.id} 
                     card={c} 
                     onClick={() => handleCardPlay(c)}
                     disabled={!isMyTurn || isProcessing}
                     className={`w-24 h-36 shadow-2xl transition-all duration-300 ${isMyTurn ? 'hover:-translate-y-12 cursor-pointer ring-4 ring-yellow-400 ring-offset-4 ring-offset-transparent' : 'opacity-40 grayscale scale-95'}`}
                   />
                 ))}
                 {room.status === 'playing' && (!me.hand || me.hand.length === 0) && <p className="text-white/20 font-black uppercase text-xl animate-pulse">Waiting Turn Result...</p>}
              </div>

              {/* 내 정보/점수 */}
              <div className="w-56 text-right">
                 <div className="score-badge px-10 py-3 rounded-full text-5xl font-black italic shadow-2xl inline-block mb-4 border-2 border-yellow-300/50">
                    {me.score}
                 </div>
                 <div className={`px-6 py-3 rounded-2xl text-base font-black text-center transition-all shadow-xl ${isMyTurn ? 'bg-blue-600 border-2 border-blue-300 animate-bounce scale-110' : 'bg-white/5 opacity-50'}`}>
                    {isMyTurn ? 'MY TURN' : 'WAITING'}
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* 우측 사이드바 */}
      <div className="w-[240px] hud-panel p-8 flex flex-col gap-8 shadow-2xl z-50">
        <div className="text-center">
           <h1 className="text-4xl font-black italic text-red-600 tracking-tighter leading-none mb-1">MATGO</h1>
           <span className="text-[11px] font-bold text-white/40 uppercase tracking-[0.5em]">Master Pro</span>
        </div>

        <div className="bg-black/40 rounded-3xl p-6 border border-white/5 flex flex-col gap-4 shadow-inner">
           <div className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${room.turn !== user.uid ? 'bg-red-900/20 border-red-500/50 scale-105' : 'bg-transparent border-transparent'}`}>
              <img src={opponent?.photo || 'https://ui-avatars.com/api/?name=W'} className="w-10 h-10 rounded-xl border border-white/10" alt="opponent" />
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold truncate">{opponent?.name || 'Waiting...'}</p>
                <p className="text-[10px] text-white/40 uppercase font-black">{opponent?.hand?.length || 0} Cards</p>
              </div>
           </div>
           
           <div className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${isMyTurn ? 'bg-blue-900/20 border-blue-500/50 scale-105' : 'bg-transparent border-transparent'}`}>
              <img src={me.photo} className="w-10 h-10 rounded-xl border border-white/10 shadow-lg" alt="me" />
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold truncate text-blue-400">{me.name}</p>
                <p className="text-[10px] text-white/40 uppercase font-black">{me.hand?.length || 0} Cards</p>
              </div>
           </div>
        </div>

        <div className="mt-auto flex flex-col gap-4">
           {room.status === 'finished' && (
              <div className="bg-yellow-500 text-black p-4 rounded-2xl text-center font-black animate-in fade-in zoom-in duration-500 shadow-2xl">
                 <p className="text-sm mb-1 uppercase opacity-50 tracking-widest">Game Result</p>
                 <p className="text-2xl italic">{me.score > (opponent?.score || 0) ? 'WINNER!' : 'LOSE...'}</p>
              </div>
           )}

           <button 
             onClick={onLeave} 
             className="w-full py-4 rounded-2xl bg-neutral-950 hover:bg-red-950 font-black text-xs shadow-xl transition-all active:scale-95 border border-white/5 tracking-widest uppercase"
           >
             Leave Room
           </button>
        </div>

        {room.status === 'waiting' && room.hostId === user.uid && opponent && (
          <button 
            onClick={handleStartGame} 
            className="w-full py-10 rounded-[2.5rem] score-badge font-black text-4xl shadow-2xl animate-bounce active:scale-95 transition-all hover:scale-105 border-4 border-yellow-200/50"
          >
            START
          </button>
        )}
        
        {room.status === 'finished' && room.hostId === user.uid && (
          <button 
            onClick={handleStartGame} 
            className="w-full py-8 rounded-[2rem] score-badge font-black text-2xl shadow-2xl active:scale-95 transition-all hover:scale-105 border-2 border-white/20"
          >
            REMATCH
          </button>
        )}
      </div>
    </div>
  );
};

export default GameView;
