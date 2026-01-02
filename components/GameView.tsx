
import React, { useState, useEffect, useMemo } from 'react';
import { ref, onValue, update, runTransaction, get } from 'firebase/database';
import { db } from '../firebase';
import { GameRoom, Card, Player, CardType } from '../types';
import { INITIAL_DECK, HWATU_BACK_IMAGE } from '../constants';

const HwatuCard: React.FC<{ card?: Card, isBack?: boolean, className?: string, onClick?: () => void, disabled?: boolean }> = ({ card, isBack, className, onClick, disabled }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  if (isBack) {
    return (
      <div className={`relative ${className} hwatu-card-shadow rounded-[3px] border border-black/30 bg-[#c0392b] overflow-hidden flex-shrink-0`}>
        <img 
          src={HWATU_BACK_IMAGE} 
          alt="back" 
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

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`relative ${className} hwatu-card-shadow rounded-[3px] border border-black/10 bg-white overflow-hidden transition-all transform flex-shrink-0 ${disabled ? 'opacity-50 grayscale-[0.2]' : 'hover:z-30 hover:scale-105 active:scale-90 cursor-pointer'}`}
    >
      <img 
        src={card.image} 
        alt={card.name} 
        className={`w-full h-full object-fill transition-opacity duration-200 ${status === 'success' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setStatus('success')}
        onError={() => setStatus('error')}
      />
      
      {status !== 'success' && (
        <div className="absolute inset-0 flex flex-col items-center justify-between p-0.5 bg-white">
          <span className="text-[10px] font-black" style={{ color: card.color }}>{card.month}</span>
          <span className="text-[10px] opacity-20">🎴</span>
          <span className="text-[8px] font-bold opacity-40 uppercase">{card.type[0]}</span>
        </div>
      )}
    </button>
  );
};

// 획득한 패를 종류별로 보여주는 컴포넌트
const CapturedBoard: React.FC<{ cards: Card[], isCompact?: boolean }> = ({ cards, isCompact }) => {
  const groups = useMemo(() => {
    const res: Record<string, Card[]> = { Kwang: [], Yul: [], Tti: [], Pi: [] };
    cards.forEach(c => {
      if (c.type === 'Kwang') res.Kwang.push(c);
      else if (c.type === 'Yul') res.Yul.push(c);
      else if (c.type === 'Tti') res.Tti.push(c);
      else res.Pi.push(c);
    });
    return res;
  }, [cards]);

  const groupLabels = { Kwang: '광', Yul: '열', Tti: '띠', Pi: '피' };

  return (
    <div className={`flex flex-col gap-2 w-full ${isCompact ? 'max-h-[120px]' : 'max-h-[200px]'} overflow-y-auto scrollbar-hide`}>
      {/* Fix: Explicitly cast Object.entries to ensure 'items' is inferred as Card[] instead of unknown */}
      {(Object.entries(groups) as [string, Card[]][]).map(([type, items]) => (
        <div key={type} className="flex items-center gap-1.5 border-b border-white/5 pb-1">
          <span className="text-[10px] font-black w-4 text-white/40">{groupLabels[type as keyof typeof groupLabels]}</span>
          <div className="flex flex-wrap gap-0.5">
            {items.map((c, i) => (
              <img 
                key={i} 
                src={c.image} 
                className={`${isCompact ? 'w-4 h-6' : 'w-6 h-9'} rounded-[1px] shadow-sm border border-black/20`} 
              />
            ))}
            {items.length === 0 && <div className="w-4 h-4 rounded border border-dashed border-white/10" />}
          </div>
          <span className="ml-auto text-[10px] font-bold text-white/30">{items.length}</span>
        </div>
      ))}
    </div>
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
        // 간단한 점수 시스템: 장수 기반
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
    <div className="h-screen flex flex-col items-center justify-center bg-[#1a3a16]">
       <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
       <p className="text-white font-black animate-pulse uppercase text-xs tracking-widest">Connect...</p>
    </div>
  );

  const me = room.players[user.uid] || { name: '나', photo: '', score: 0, hand: [], captured: [] };
  const opponentId = Object.keys(room.players).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;
  const isMyTurn = room.turn === user.uid && room.status === 'playing';

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row bg-[#1a3a16] game-board-bg overflow-hidden text-white font-sans">
      
      {/* Mobile Header */}
      <div className="md:hidden flex justify-between items-center p-2 bg-black/40 border-b border-white/10 z-50">
         <div className="flex items-center gap-1.5">
            <img src={opponent?.photo || ''} className="w-6 h-6 rounded-full border border-red-500" />
            <span className="score-badge px-2 rounded-full text-[10px] font-black">{opponent?.score || 0}</span>
         </div>
         <h1 className="text-sm font-black italic text-red-600">MATGO PRO</h1>
         <div className="flex items-center gap-1.5">
            <span className="score-badge px-2 rounded-full text-[10px] font-black">{me.score}</span>
            <img src={me.photo} className="w-6 h-6 rounded-full border border-blue-500" />
         </div>
      </div>

      <div className="flex-1 flex flex-col p-2 sm:p-4 relative">
        
        {/* Opponent Area */}
        <div className="flex justify-between items-start h-[100px] mb-2">
          <div className="w-[120px] sm:w-[200px] bg-black/20 p-2 rounded-xl border border-white/5">
            <CapturedBoard cards={opponent?.captured || []} isCompact />
          </div>
          <div className="flex -space-x-8 mt-1 opacity-60 scale-75 sm:scale-100">
            {(opponent?.hand || []).map((_, i) => <HwatuCard key={i} isBack className="w-10 h-15 rotate-180" />)}
          </div>
          <div className="hidden sm:block text-right">
             <div className="score-badge px-5 py-1 rounded-full text-xl font-black italic">{opponent?.score || 0}</div>
          </div>
        </div>

        {/* Board Area */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-4 p-4 sm:p-8 bg-black/10 rounded-[2rem] sm:rounded-[3rem] border border-white/5 shadow-inner w-full max-w-3xl">
            {(room.field || []).map((c, idx) => (
              <HwatuCard key={`${c.id}-${idx}`} card={c} className="w-12 h-18 sm:w-16 sm:h-24 animate-deal" />
            ))}
          </div>
          
          <div className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 flex flex-col items-center">
            <div className="relative group">
               <HwatuCard isBack className="w-10 h-14 sm:w-14 sm:h-21 shadow-2xl relative z-10" />
               <div className="absolute -top-1 -left-1 w-full h-full bg-red-900 rounded-[3px] -z-10 shadow-lg"></div>
            </div>
            <span className="mt-1 font-black text-yellow-500 text-xs sm:text-lg">{room.deck?.length || 0}</span>
          </div>
        </div>

        {/* My Area */}
        <div className="h-auto md:h-[240px] flex flex-col justify-end">
           <div className="flex justify-between items-end gap-2 sm:gap-4">
              <div className="hidden md:block w-72 bg-black/40 p-3 rounded-2xl border border-white/10 h-40">
                 <CapturedBoard cards={me.captured || []} />
              </div>

              <div className="flex-1 flex justify-center items-end -space-x-4 sm:space-x-1 pb-1">
                 {(me.hand || []).map(c => (
                   <HwatuCard 
                     key={c.id} 
                     card={c} 
                     onClick={() => handleCardPlay(c)}
                     disabled={!isMyTurn || isProcessing}
                     className={`w-14 h-21 sm:w-22 sm:h-33 shadow-2xl transition-all ${isMyTurn ? 'hover:-translate-y-8 ring-2 ring-yellow-400 z-10' : 'opacity-40 grayscale-[0.2]'}`}
                   />
                 ))}
              </div>

              <div className="hidden md:flex flex-col items-end w-40">
                 <div className="score-badge px-8 py-2 rounded-full text-3xl font-black italic shadow-2xl mb-2">{me.score}</div>
                 <div className={`w-full py-2 rounded-xl text-[10px] font-black text-center ${isMyTurn ? 'bg-blue-600 animate-pulse' : 'bg-white/5 opacity-40'}`}>
                    {isMyTurn ? 'MY TURN' : 'WAITING'}
                 </div>
              </div>
           </div>
           
           {/* Mobile Captured Overlay (간략히) */}
           <div className="md:hidden flex gap-1 mt-2 p-1 bg-black/20 rounded-lg overflow-x-auto scrollbar-hide">
              {me.captured?.slice(-10).map((c, i) => <img key={i} src={c.image} className="w-4 h-6 rounded-[1px]" />)}
           </div>
        </div>
      </div>

      {/* PC Sidebar */}
      <div className="hidden md:flex w-[200px] hud-panel p-6 flex-col gap-6 shadow-2xl z-50">
        <div className="text-center">
           <h1 className="text-2xl font-black italic text-red-600 tracking-tighter">MATGO PRO</h1>
        </div>

        <div className="bg-black/40 rounded-2xl p-4 border border-white/5 flex flex-col gap-3">
           <div className="flex items-center gap-2 opacity-60">
              <img src={opponent?.photo || ''} className="w-8 h-8 rounded-lg border border-red-500" />
              <span className="text-[10px] font-bold truncate">{opponent?.name || '대기중'}</span>
           </div>
           <div className="flex items-center gap-2">
              <img src={me.photo} className="w-8 h-8 rounded-lg border border-blue-500" />
              <span className="text-[10px] font-bold truncate text-blue-400">{me.name}</span>
           </div>
        </div>

        <div className="mt-auto flex flex-col gap-2">
           <button onClick={onLeave} className="w-full py-3 rounded-xl bg-neutral-900 hover:bg-red-950 font-black text-[10px] uppercase">Exit</button>
           {room.status === 'waiting' && room.hostId === user.uid && opponent && (
              <button onClick={handleStartGame} className="w-full py-6 rounded-2xl score-badge font-black text-2xl animate-bounce">START</button>
           )}
        </div>
      </div>

      {/* Game End Overlay */}
      {room.status === 'finished' && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-500">
           <div className="bg-neutral-900 border-2 border-red-600 p-8 rounded-[2rem] shadow-[0_0_50px_rgba(220,38,38,0.3)] max-w-xs w-full text-center">
              <h2 className="text-4xl font-black italic text-yellow-500 mb-4 tracking-tighter uppercase">MATCH END</h2>
              <div className="text-5xl font-black mb-8 animate-bounce">
                 {me.score > (opponent?.score || 0) ? 'WINNER 🏆' : 'LOSE... 💀'}
              </div>
              <button onClick={onLeave} className="w-full py-4 bg-white text-black font-black rounded-xl hover:bg-neutral-200 transition">BACK TO LOBBY</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default GameView;
