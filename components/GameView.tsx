
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ref, onValue, update, runTransaction, get, remove } from 'firebase/database';
import { db } from '../firebase';
import { GameRoom, Card, Player, CardType } from '../types';
import { INITIAL_DECK, HWATU_BACK_IMAGE } from '../constants';

// --- Sound Effects Utility ---
const playSound = (frequency: number, type: OscillatorType = 'sine', duration: number = 0.1, volume: number = 0.1) => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency / 4, audioCtx.currentTime + duration);

    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

const playCardSound = () => playSound(400, 'square', 0.08, 0.1); // '착'
const playMatchSound = () => playSound(900, 'triangle', 0.12, 0.15); // '딱'
const playTurnSound = () => {
  playSound(523.25, 'sine', 0.1, 0.05); // C5
  setTimeout(() => playSound(659.25, 'sine', 0.1, 0.05), 100); // E5
};

// --- Sub-components ---

const HwatuCard: React.FC<{ 
  card?: Card, 
  isBack?: boolean, 
  className?: string, 
  onClick?: (e: React.MouseEvent) => void, 
  disabled?: boolean,
  isHighlight?: boolean,
  isSelected?: boolean
}> = ({ card, isBack, className, onClick, disabled, isHighlight, isSelected }) => {
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
      onClick={(e) => {
        if (!disabled && onClick) onClick(e);
      }} 
      disabled={disabled}
      className={`relative ${className} hwatu-card-shadow rounded-[3px] border border-black/10 bg-white overflow-hidden transition-all duration-300 transform flex-shrink-0 
        ${disabled ? 'opacity-50 grayscale-[0.2] cursor-not-allowed' : 'hover:z-30 hover:scale-105 active:scale-95 cursor-pointer'}
        ${isHighlight && !isSelected ? 'ring-1 ring-white/50 shadow-[0_0_10px_rgba(255,255,255,0.3)]' : ''}
        ${isSelected ? 'z-50 scale-125 -translate-y-16 ring-4 ring-yellow-400 shadow-[0_0_40px_rgba(255,215,0,0.8)]' : ''}`}
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

      {isSelected && (
        <div className="absolute inset-0 flex items-center justify-center bg-yellow-400/20">
           <div className="bg-yellow-400 text-black text-[9px] px-2 py-0.5 rounded-full font-black animate-pulse whitespace-nowrap">
             TAP TO PLAY
           </div>
        </div>
      )}
    </button>
  );
};

const CapturedBoard: React.FC<{ cards: Card[], isCompact?: boolean }> = ({ cards, isCompact }) => {
  const groups = useMemo(() => {
    const res: Record<string, Card[]> = { Kwang: [], Yul: [], Tti: [], Pi: [] };
    cards.forEach(c => {
      if (c.type === 'Kwang') res.Kwang.push(c);
      else if (c.type === 'Yul' || c.type === 'SsangPi') res.Yul.push(c);
      else if (c.type === 'Tti') res.Tti.push(c);
      else res.Pi.push(c);
    });
    return res;
  }, [cards]);

  const groupLabels = { Kwang: '광', Yul: '열', Tti: '띠', Pi: '피' };

  return (
    <div className={`flex flex-col gap-1 w-full ${isCompact ? 'max-h-[100px]' : 'max-h-[180px]'} overflow-y-auto scrollbar-hide`}>
      {(Object.entries(groups) as [string, Card[]][]).map(([type, items]) => (
        <div key={type} className="flex items-center gap-1.5 border-b border-white/5 pb-0.5">
          <span className="text-[9px] font-black w-3 text-white/30">{groupLabels[type as keyof typeof groupLabels]}</span>
          <div className="flex flex-wrap gap-0.5">
            {items.map((c, i) => (
              <img 
                key={`${c.id}-${i}`} 
                src={c.image} 
                className={`${isCompact ? 'w-3 h-5' : 'w-5 h-8'} rounded-[1px] border border-black/20 shadow-sm`} 
              />
            ))}
          </div>
          <span className="ml-auto text-[9px] font-bold text-white/20">{items.length}</span>
        </div>
      ))}
    </div>
  );
};

// --- Main Component ---

interface GameViewProps {
  roomId: string;
  user: any;
  onLeave: () => void;
}

const GameView: React.FC<GameViewProps> = ({ roomId, user, onLeave }) => {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const turnRef = useRef<string | null>(null);

  useEffect(() => {
    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) { onLeave(); return; }
      
      if (turnRef.current !== user.uid && data.turn === user.uid && data.status === 'playing') {
        playTurnSound();
      }
      
      if (data.turn !== user.uid) {
        setSelectedCardId(null);
      }

      turnRef.current = data.turn;
      setRoom({ ...data, id: roomId });
    });

    const joinRoom = async () => {
      const snapshot = await get(roomRef);
      const data = snapshot.val();
      if (data && data.status === 'waiting' && !data.players?.[user.uid] && Object.keys(data.players || {}).length < 2) {
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
    if (!room || Object.keys(room.players || {}).length < 2) return;
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
    setSelectedCardId(null);
    playCardSound();
    
    try {
      await runTransaction(ref(db, `rooms/${roomId}`), (current) => {
        if (!current || !current.players || !current.players[user.uid]) return current;
        if (current.turn !== user.uid) return undefined;

        let deck = [...(current.deck || [])];
        let field = [...(current.field || [])];
        let me = current.players[user.uid];
        let captured: Card[] = [];
        let matched = false;

        me.hand = (me.hand || []).filter((c: Card) => c.id !== card.id);
        
        const matchIdx = field.findIndex(fc => fc.month === card.month);
        if (matchIdx !== -1) {
          captured.push(card, field.splice(matchIdx, 1)[0]);
          matched = true;
        } else {
          field.push(card);
        }

        if (deck.length > 0) {
          const flipped = deck.shift();
          const dMatchIdx = field.findIndex(fc => fc.month === flipped.month);
          if (dMatchIdx !== -1) {
            captured.push(flipped, field.splice(dMatchIdx, 1)[0]);
            matched = true;
          } else {
            field.push(flipped);
          }
        }

        me.captured = [...(me.captured || []), ...captured];
        me.score = me.captured.length;
        
        if (matched) setTimeout(playMatchSound, 200);

        const opponentId = Object.keys(current.players).find(id => id !== user.uid);
        current.turn = opponentId || user.uid;
        
        const anyHandEmpty = Object.values(current.players).some((p: any) => !p.hand || p.hand.length === 0);
        if (anyHandEmpty) current.status = 'finished';

        current.deck = deck;
        current.field = field;
        return current;
      });
    } catch (e) {
      console.error("Play transaction failed", e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCardInteraction = (e: React.MouseEvent, card: Card) => {
    e.preventDefault();
    e.stopPropagation(); // 배경 클릭 이벤트로의 전파를 명시적으로 차단

    const isMobile = window.innerWidth < 1024; // 모바일 및 태블릿 범위 확장
    
    if (isMobile) {
      if (selectedCardId === card.id) {
        handleCardPlay(card);
      } else {
        setSelectedCardId(card.id);
        playSound(500, 'sine', 0.05, 0.03);
      }
    } else {
      handleCardPlay(card);
    }
  };

  const handleExit = async () => {
    if (!room) { onLeave(); return; }
    try {
      if (room.hostId === user.uid) {
        await remove(ref(db, `rooms/${roomId}`));
      } else {
        await remove(ref(db, `rooms/${roomId}/players/${user.uid}`));
        if (room.status === 'playing') {
          await update(ref(db, `rooms/${roomId}`), { status: 'finished' });
        }
      }
    } catch (e) {
      console.error("Exit failed", e);
    } finally {
      onLeave();
    }
  };

  if (!room) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#1a3a16]">
       <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
       <p className="text-white font-black animate-pulse uppercase text-[10px] tracking-widest">Entering Arena...</p>
    </div>
  );

  const me = room.players?.[user.uid] || { name: '나', photo: '', score: 0, hand: [], captured: [] };
  const opponentId = Object.keys(room.players || {}).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;
  const isMyTurn = room.turn === user.uid && room.status === 'playing';

  return (
    <div 
      className="h-screen w-screen flex flex-col md:flex-row bg-[#1a3a16] game-board-bg overflow-hidden text-white font-sans selection:bg-none"
      onClick={(e) => {
        // 실제 배경을 클릭했을 때만 선택 해제 (카드 버튼 등 자식 요소 클릭 제외)
        if (e.target === e.currentTarget) setSelectedCardId(null);
      }}
    >
      
      {/* Mobile Header */}
      <div className="md:hidden flex justify-between items-center p-2 bg-black/60 border-b border-white/10 z-50 backdrop-blur-sm">
         <div className="flex items-center gap-1.5">
            <div className={`relative ${!isMyTurn && room.status === 'playing' ? 'ring-2 ring-red-500 rounded-full' : ''}`}>
               <img src={opponent?.photo || ''} className="w-8 h-8 rounded-full border border-white/20" />
               {!isMyTurn && room.status === 'playing' && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></div>}
            </div>
            <span className="score-badge px-2 py-0.5 rounded-full text-[10px] font-black">{opponent?.score || 0}</span>
         </div>
         <h1 className="text-sm font-black italic text-red-600 tracking-tighter">MATGO PRO</h1>
         <div className="flex items-center gap-1.5">
            <span className="score-badge px-2 py-0.5 rounded-full text-[10px] font-black">{me.score}</span>
            <div className={`relative ${isMyTurn ? 'ring-2 ring-blue-500 rounded-full' : ''}`}>
               <img src={me.photo} className="w-8 h-8 rounded-full border border-white/20" />
               {isMyTurn && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full animate-ping"></div>}
            </div>
         </div>
      </div>

      <div className="flex-1 flex flex-col p-2 sm:p-4 relative">
        
        {/* Opponent Area */}
        <div className="flex justify-between items-start h-[90px] mb-2">
          <div className="w-[110px] sm:w-[220px] bg-black/40 p-2 rounded-xl border border-white/5 shadow-inner">
            <CapturedBoard cards={opponent?.captured || []} isCompact />
          </div>
          <div className="flex -space-x-8 mt-1 opacity-50 scale-75 sm:scale-90 origin-top pointer-events-none">
            {(opponent?.hand || []).map((_, i) => <HwatuCard key={i} isBack className="w-10 h-15 rotate-180" />)}
          </div>
          <div className="hidden sm:block text-right">
             <div className="score-badge px-5 py-1 rounded-full text-xl font-black italic shadow-lg">{opponent?.score || 0}</div>
             <p className="text-[10px] font-bold opacity-40 mt-1 uppercase tracking-wider">Opponent</p>
          </div>
        </div>

        {/* Play Field */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-4 p-4 sm:p-10 bg-black/10 rounded-[2.5rem] sm:rounded-[4rem] border border-white/5 shadow-inner w-full max-w-4xl">
            {(room.field || []).map((c, idx) => (
              <HwatuCard key={`${c.id}-${idx}`} card={c} className="w-11 h-17 sm:w-16 sm:h-24 animate-deal" disabled />
            ))}
            {room.status === 'waiting' && (
              <div className="col-span-4 sm:col-span-6 flex flex-col items-center opacity-20 py-10">
                 <i className="fa-solid fa-hourglass-half text-4xl mb-4 animate-spin-slow"></i>
                 <p className="text-xs font-black tracking-[0.3em] uppercase">Ready for Match</p>
              </div>
            )}
          </div>
          
          {/* Deck Pile */}
          <div className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none">
            <div className="relative group">
               <HwatuCard isBack className="w-9 h-13 sm:w-14 sm:h-21 shadow-2xl relative z-10" />
               <div className="absolute -top-1 -left-1 w-full h-full bg-red-950 rounded-[3px] -z-10 shadow-lg border border-white/10"></div>
            </div>
            <span className="mt-1 font-black text-yellow-500 text-xs sm:text-lg drop-shadow-md">{room.deck?.length || 0}</span>
          </div>
        </div>

        {/* My Hand & Score */}
        <div className="h-auto md:h-[260px] flex flex-col justify-end">
           <div className="flex justify-between items-end gap-2 sm:gap-6">
              <div className="hidden md:block w-80 bg-black/40 p-4 rounded-3xl border border-white/10 h-44 shadow-2xl">
                 <CapturedBoard cards={me.captured || []} />
              </div>

              <div className="flex-1 flex justify-center items-end -space-x-4 sm:space-x-1 pb-4">
                 {(me.hand || []).map(c => (
                   <HwatuCard 
                     key={c.id} 
                     card={c} 
                     onClick={(e) => handleCardInteraction(e, c)}
                     disabled={!isMyTurn || isProcessing}
                     isHighlight={isMyTurn}
                     isSelected={selectedCardId === c.id}
                     className={`w-14 h-21 sm:w-24 sm:h-36 shadow-2xl transition-all duration-300 ${isMyTurn ? 'z-20' : 'z-0 pointer-events-none opacity-60'}`}
                   />
                 ))}
                 {room.status === 'playing' && (!me.hand || me.hand.length === 0) && (
                   <p className="text-[10px] font-black animate-pulse text-white/20">WAITING FOR TURN FINISH...</p>
                 )}
              </div>

              <div className="hidden md:flex flex-col items-end w-44">
                 <div className="score-badge px-10 py-3 rounded-full text-4xl font-black italic shadow-2xl border-b-4 border-black/20 mb-3">{me.score}</div>
                 <div className={`w-full py-3 rounded-2xl text-xs font-black text-center transition-all ${isMyTurn ? 'bg-blue-600 border-2 border-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.4)] animate-pulse' : 'bg-white/5 opacity-30'}`}>
                    {isMyTurn ? 'YOUR TURN' : 'OPPONENT TURN'}
                 </div>
              </div>
           </div>
           
           {/* Mobile Captured Preview */}
           <div className="md:hidden flex gap-1 mt-2 p-1.5 bg-black/40 rounded-xl overflow-x-auto scrollbar-hide border border-white/5 backdrop-blur-sm">
              {me.captured?.length === 0 ? (
                <p className="text-[9px] font-bold opacity-20 w-full text-center py-1 uppercase tracking-tighter">No Captured Cards</p>
              ) : (
                me.captured?.map((c, i) => <img key={`${c.id}-${i}`} src={c.image} className="w-4 h-6 rounded-[1px] flex-shrink-0 border border-black/20 shadow-sm" />)
              )}
           </div>
        </div>
      </div>

      {/* PC Side HUD */}
      <div className="hidden md:flex w-[240px] hud-panel p-8 flex-col gap-8 shadow-2xl z-50">
        <div className="text-center">
           <h1 className="text-3xl font-black italic text-red-600 tracking-tighter leading-none mb-1">MATGO PRO</h1>
           <span className="text-[9px] font-bold text-white/20 tracking-[0.4em] uppercase">Arena Edition</span>
        </div>

        <div className="flex flex-col gap-4">
           <div className={`flex items-center gap-3 p-4 rounded-2xl border transition-all duration-500 ${!isMyTurn && room.status === 'playing' ? 'bg-red-600/10 border-red-500/50 scale-105 shadow-[0_0_20px_rgba(220,38,38,0.2)]' : 'border-transparent opacity-40'}`}>
              <img src={opponent?.photo || ''} className="w-12 h-12 rounded-xl border border-white/10" />
              <div className="overflow-hidden">
                <p className="text-xs font-black truncate">{opponent?.name || 'Searching...'}</p>
                <p className="text-[10px] font-bold text-red-500">{opponent?.hand?.length || 0} CARDS</p>
              </div>
           </div>
           <div className={`flex items-center gap-3 p-4 rounded-2xl border transition-all duration-500 ${isMyTurn ? 'bg-blue-600/10 border-blue-500/50 scale-105 shadow-[0_0_20px_rgba(37,99,235,0.2)]' : 'border-transparent opacity-40'}`}>
              <img src={me.photo} className="w-12 h-12 rounded-xl border border-white/10" />
              <div className="overflow-hidden">
                <p className="text-xs font-black truncate text-blue-400">{me.name}</p>
                <p className="text-[10px] font-bold text-blue-500">{me.hand?.length || 0} CARDS</p>
              </div>
           </div>
        </div>

        <div className="mt-auto space-y-4">
           <button onClick={handleExit} className="w-full py-4 rounded-2xl bg-neutral-950 hover:bg-red-950 border border-white/5 font-black text-xs uppercase transition shadow-xl transform active:scale-95">Abandon Arena</button>
           {room.status === 'waiting' && room.hostId === user.uid && opponent && (
              <button onClick={handleStartGame} className="w-full py-8 rounded-[2.5rem] score-badge font-black text-3xl shadow-2xl animate-bounce hover:scale-105 transition-transform active:scale-95">START MATCH</button>
           )}
        </div>
      </div>

      {/* Game Over Screen */}
      {room.status === 'finished' && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-lg p-6 animate-in fade-in zoom-in duration-500">
           <div className="bg-neutral-900 border-b-8 border-red-700 p-10 rounded-[3rem] shadow-[0_20px_80px_rgba(220,38,38,0.5)] max-w-sm w-full text-center">
              <h2 className="text-5xl font-black italic text-yellow-500 mb-2 tracking-tighter uppercase">MATCH OVER</h2>
              <div className="my-8 space-y-4">
                 <div className="flex justify-between items-center bg-white/5 p-5 rounded-2xl border border-white/5">
                    <span className="font-black text-blue-400 uppercase tracking-tighter">You</span>
                    <span className="text-4xl font-black italic">{me.score}</span>
                 </div>
                 <div className="flex justify-between items-center bg-white/5 p-5 rounded-2xl opacity-40 grayscale">
                    <span className="font-black uppercase tracking-tighter">Opponent</span>
                    <span className="text-4xl font-black italic">{opponent?.score || 0}</span>
                 </div>
              </div>
              <div className="text-4xl font-black mb-10 animate-bounce tracking-tight">
                 {me.score > (opponent?.score || 0) ? (
                   <span className="text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]">VICTORY 🏆</span>
                 ) : (
                   <span className="text-neutral-500">DEFEATED 💀</span>
                 )}
              </div>
              <button onClick={handleExit} className="w-full py-5 bg-white text-black font-black rounded-2xl hover:bg-yellow-400 transition transform active:scale-95 shadow-2xl uppercase tracking-widest">Return to Lobby</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default GameView;
