
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
  playSound(523.25, 'sine', 0.1, 0.05);
  setTimeout(() => playSound(659.25, 'sine', 0.1, 0.05), 100);
};

// --- Score Calculation Logic ---
const calculateScore = (cards: Card[] = []): number => {
  if (cards.length === 0) return 0;

  let score = 0;
  const ids = cards.map(c => c.id);
  const types = {
    kwang: cards.filter(c => c.type === 'Kwang'),
    yul: cards.filter(c => c.type === 'Yul'),
    tti: cards.filter(c => c.type === 'Tti'),
    pi: cards.filter(c => c.type === 'Pi' || c.type === 'SsangPi'),
  };

  // 1. 광 계산
  const kwangCount = types.kwang.length;
  const hasRainKwang = types.kwang.some(c => c.month === 12);
  if (kwangCount === 5) score += 5; // 5광
  else if (kwangCount === 4) score += 4; // 4광
  else if (kwangCount === 3) {
    score += hasRainKwang ? 2 : 3; // 비광 포함 3광은 2점, 아니면 3점
  }

  // 2. 띠 계산
  const hongDan = [2, 6, 10].every(id => ids.includes(id)); // 1,2,3월 홍단
  const cheongDan = [22, 34, 38].every(id => ids.includes(id)); // 6,9,10월 청단
  const choDan = [14, 18, 26].every(id => ids.includes(id)); // 4,5,7월 초단
  if (hongDan) score += 3;
  if (cheongDan) score += 3;
  if (choDan) score += 3;
  if (types.tti.length >= 5) score += (types.tti.length - 4); // 5장부터 1점씩

  // 3. 열끗 계산
  const godori = [5, 13, 29].every(id => ids.includes(id)); // 2,4,8월 고도리
  if (godori) score += 5;
  if (types.yul.length >= 5) score += (types.yul.length - 4); // 5장부터 1점씩
  
  // 국진(9월 열끗) 보너스
  if (ids.includes(33)) score += 3;

  // 4. 피 계산
  let piCount = 0;
  cards.forEach(c => {
    if (c.type === 'SsangPi') piCount += 2;
    else if (c.type === 'Pi') piCount += 1;
  });
  if (piCount >= 10) score += (piCount - 9); // 10장부터 1점씩

  return score;
};

// --- Sub-components ---

const HwatuCard: React.FC<{ 
  card?: Card, 
  isBack?: boolean, 
  className?: string, 
  onAction?: (e: React.PointerEvent) => void, 
  disabled?: boolean,
  isHighlight?: boolean,
  isSelected?: boolean
}> = ({ card, isBack, className, onAction, disabled, isHighlight, isSelected }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  if (isBack) {
    return (
      <div className={`relative ${className} hwatu-card-shadow rounded-[3px] border border-black/30 bg-[#c0392b] overflow-hidden flex-shrink-0`}>
        <img 
          src={HWATU_BACK_IMAGE} 
          alt="back" 
          className={`w-full h-full object-cover transition-opacity duration-200 ${status === 'success' ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setStatus('success')}
        />
      </div>
    );
  }

  if (!card) return null;

  return (
    <div 
      onPointerDown={(e) => {
        if (!disabled && onAction) onAction(e);
      }} 
      className={`relative ${className} hwatu-card-shadow rounded-[3px] border border-black/10 bg-white overflow-hidden transition-all duration-300 transform flex-shrink-0 
        ${disabled ? 'opacity-50 grayscale-[0.2] cursor-not-allowed' : 'hover:z-30 hover:scale-105 active:scale-95 cursor-pointer'}
        ${isHighlight && !isSelected ? 'ring-1 ring-white/50' : ''}
        ${isSelected ? 'z-50 scale-125 -translate-y-20 ring-4 ring-yellow-400 shadow-[0_0_40px_rgba(255,215,0,0.8)]' : ''}`}
    >
      <img 
        src={card.image} 
        alt={card.name} 
        className={`w-full h-full object-fill pointer-events-none transition-opacity duration-200 ${status === 'success' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setStatus('success')}
      />
      {isSelected && (
        <div className="absolute inset-0 flex items-center justify-center bg-yellow-400/20 pointer-events-none">
           <div className="bg-yellow-400 text-black text-[9px] px-2 py-0.5 rounded-full font-black animate-bounce whitespace-nowrap">
             TAP TO PLAY
           </div>
        </div>
      )}
    </div>
  );
};

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
    <div className={`flex flex-col gap-1 w-full ${isCompact ? 'max-h-[100px]' : 'max-h-[180px]'} overflow-y-auto scrollbar-hide`}>
      {(Object.entries(groups) as [string, Card[]][]).map(([type, items]) => (
        <div key={type} className="flex items-center gap-1 border-b border-white/5 pb-0.5">
          <span className="text-[8px] font-black w-2.5 text-white/30">{groupLabels[type as keyof typeof groupLabels]}</span>
          <div className="flex flex-wrap gap-0.5">
            {items.map((c, i) => (
              <img key={`${c.id}-${i}`} src={c.image} className={`${isCompact ? 'w-3 h-5' : 'w-4 h-6'} rounded-[1px]`} />
            ))}
          </div>
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
      if (data.turn !== user.uid) setSelectedCardId(null);
      turnRef.current = data.turn;
      setRoom({ ...data, id: roomId });
    });
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
    await update(ref(db, `rooms/${roomId}`), {
      status: 'playing',
      players,
      field,
      deck: shuffled,
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

        // 1. 손패 제거
        me.hand = (me.hand || []).filter((c: Card) => c.id !== card.id);
        
        // 2. 바닥 매칭
        const matchIdx = field.findIndex(fc => fc.month === card.month);
        if (matchIdx !== -1) {
          captured.push(card, field.splice(matchIdx, 1)[0]);
          matched = true;
        } else field.push(card);

        // 3. 덱에서 뒤집기
        if (deck.length > 0) {
          const flipped = deck.shift();
          const dMatchIdx = field.findIndex(fc => fc.month === flipped.month);
          if (dMatchIdx !== -1) {
            captured.push(flipped, field.splice(dMatchIdx, 1)[0]);
            matched = true;
          } else field.push(flipped);
        }

        // 4. 점수 계산
        me.captured = [...(me.captured || []), ...captured];
        me.score = calculateScore(me.captured);
        
        if (matched) setTimeout(playMatchSound, 200);

        // 5. 턴 교체
        const oppId = Object.keys(current.players).find(id => id !== user.uid);
        current.turn = oppId || user.uid;
        
        if (Object.values(current.players).some((p: any) => !p.hand || p.hand.length === 0)) {
          current.status = 'finished';
        }

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

  const handleCardInteraction = (e: React.PointerEvent, card: Card) => {
    e.preventDefault();
    e.stopPropagation();
    
    const isMobile = 'ontouchstart' in window;
    if (isMobile) {
      if (selectedCardId === card.id) handleCardPlay(card);
      else {
        setSelectedCardId(card.id);
        playSound(600, 'sine', 0.05, 0.02);
      }
    } else handleCardPlay(card);
  };

  const handleExit = async () => {
    if (!room) return onLeave();
    if (room.hostId === user.uid) await remove(ref(db, `rooms/${roomId}`));
    else await remove(ref(db, `rooms/${roomId}/players/${user.uid}`));
    onLeave();
  };

  if (!room) return <div className="h-screen flex items-center justify-center bg-[#1a3a16] text-white">Loading...</div>;

  const me = room.players?.[user.uid] || { name: '나', photo: '', score: 0, hand: [], captured: [] };
  const opponentId = Object.keys(room.players || {}).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;
  const isMyTurn = room.turn === user.uid && room.status === 'playing';

  return (
    <div 
      className="h-screen w-screen flex flex-col bg-[#1a3a16] game-board-bg overflow-hidden text-white relative"
      onPointerDown={() => setSelectedCardId(null)}
    >
      {/* HUD 상단 (모바일) */}
      <div className="flex md:hidden justify-between items-center p-3 bg-black/40 border-b border-white/5 z-40">
        <div className="flex items-center gap-2">
           <img src={opponent?.photo} className={`w-8 h-8 rounded-full ${!isMyTurn ? 'ring-2 ring-red-500' : ''}`} />
           <span className="score-badge px-2 py-0.5 rounded-full text-[10px] font-black">{opponent?.score || 0}</span>
        </div>
        <div className="text-red-600 font-black italic tracking-tighter">MATGO PRO</div>
        <div className="flex items-center gap-2">
           <span className="score-badge px-2 py-0.5 rounded-full text-[10px] font-black">{me.score}</span>
           <img src={me.photo} className={`w-8 h-8 rounded-full ${isMyTurn ? 'ring-2 ring-blue-500' : ''}`} />
        </div>
      </div>

      <div className="flex-1 flex flex-col p-2 sm:p-4">
        {/* 상대방 캡처 카드 */}
        <div className="h-[60px] flex justify-between">
           <div className="w-1/3 bg-black/20 p-1 rounded-lg border border-white/5"><CapturedBoard cards={opponent?.captured} isCompact /></div>
           <div className="flex -space-x-8 opacity-40 scale-75 origin-top">
              {opponent?.hand?.map((_, i) => <HwatuCard key={i} isBack className="w-10 h-15" />)}
           </div>
           <div className="hidden md:block text-right"><div className="score-badge px-4 py-1 rounded-full text-lg font-black">{opponent?.score || 0}</div></div>
        </div>

        {/* 바닥 영역 */}
        <div className="flex-1 flex items-center justify-center relative">
           <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-4 p-4 bg-black/5 rounded-[2rem] border border-white/5 w-full max-w-4xl">
              {room.field?.map((c, i) => <HwatuCard key={`${c.id}-${i}`} card={c} className="w-12 h-18 sm:w-16 sm:h-24 animate-deal" disabled />)}
           </div>
           <div className="absolute right-2 top-1/2 -translate-y-1/2"><HwatuCard isBack className="w-10 h-15 shadow-2xl opacity-80" /></div>
        </div>

        {/* 내 핸드 및 점수 */}
        <div className="h-auto flex flex-col justify-end gap-2">
           <div className="flex justify-between items-end">
              <div className="hidden md:block w-72 bg-black/30 p-3 rounded-2xl h-40"><CapturedBoard cards={me.captured} /></div>
              <div className="flex-1 flex justify-center -space-x-4 sm:space-x-1">
                 {me.hand?.map(c => (
                   <HwatuCard 
                     key={c.id} card={c} 
                     onAction={(e) => handleCardInteraction(e, c)} 
                     isSelected={selectedCardId === c.id}
                     isHighlight={isMyTurn}
                     disabled={!isMyTurn || isProcessing}
                     className={`w-16 h-24 sm:w-24 sm:h-36 ${isMyTurn ? 'z-20' : 'opacity-60'}`} 
                   />
                 ))}
              </div>
              <div className="hidden md:flex flex-col items-end gap-2">
                 <div className="score-badge px-8 py-2 rounded-full text-3xl font-black">{me.score}</div>
                 <div className={`px-4 py-1 rounded-lg text-xs font-bold ${isMyTurn ? 'bg-blue-600' : 'bg-white/5'}`}>{isMyTurn ? 'YOUR TURN' : 'WAITING'}</div>
              </div>
           </div>
           {/* 모바일 캡처 카드 미리보기 */}
           <div className="md:hidden flex gap-1 bg-black/20 p-1 rounded-lg overflow-x-auto scrollbar-hide border border-white/5">
              {me.captured?.map((c, i) => <img key={i} src={c.image} className="w-4 h-6 rounded-[1px]" />)}
           </div>
        </div>
      </div>

      {/* PC 사이드 패널 */}
      <div className="hidden md:flex w-60 hud-panel p-6 flex-col gap-8">
         <div className="text-center"><h1 className="text-2xl font-black italic text-red-600">MATGO PRO</h1></div>
         <button onClick={handleExit} className="mt-auto py-3 bg-neutral-900 border border-white/10 rounded-xl text-xs font-bold hover:bg-red-950 transition">EXIT MATCH</button>
         {room.status === 'waiting' && room.hostId === user.uid && opponent && (
            <button onClick={handleStartGame} className="py-6 bg-red-600 rounded-3xl font-black text-2xl animate-bounce">START</button>
         )}
      </div>

      {/* 결과 화면 */}
      {room.status === 'finished' && (
        <div className="absolute inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
           <div className="bg-neutral-900 p-8 rounded-[2rem] border-b-4 border-red-700 text-center max-w-xs w-full">
              <h2 className="text-4xl font-black italic text-yellow-500 mb-6">MATCH OVER</h2>
              <div className="space-y-2 mb-8">
                 <div className="flex justify-between font-black"><span>YOU</span><span className="text-blue-400">{me.score}</span></div>
                 <div className="flex justify-between opacity-50"><span>OPPONENT</span><span>{opponent?.score || 0}</span></div>
              </div>
              <div className="text-2xl font-black mb-8">{me.score > (opponent?.score || 0) ? "VICTORY 🏆" : "DEFEAT 💀"}</div>
              <button onClick={handleExit} className="w-full py-4 bg-white text-black font-black rounded-xl">LOBBY</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default GameView;
