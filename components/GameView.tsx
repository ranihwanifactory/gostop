
import React, { useState, useEffect } from 'react';
import { ref, onValue, update, runTransaction, get } from 'firebase/database';
import { db } from '../firebase';
import { GameRoom, Card, Player } from '../types';
import { INITIAL_DECK, HWATU_BACK_IMAGE } from '../constants';

const HwatuCard: React.FC<{ card?: Card, isBack?: boolean, className?: string, onClick?: () => void, disabled?: boolean }> = ({ card, isBack, className, onClick, disabled }) => {
  const [imgStatus, setImgStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [currentSrc, setCurrentSrc] = useState<string>(isBack ? HWATU_BACK_IMAGE : (card?.image || ''));
  const [useFallback, setUseFallback] = useState(false);

  const handleImgError = () => {
    // 1순위 소스 실패 시 2순위(CDN)로 전환
    if (card?.altImage && currentSrc !== card.altImage) {
      setCurrentSrc(card.altImage);
    } else {
      // 모든 이미지 소스 실패 시 그래픽(CSS) 카드로 전환
      setImgStatus('error');
      setUseFallback(true);
    }
  };

  if (isBack) {
    return (
      <div className={`relative ${className} hwatu-card-shadow rounded-[3px] border border-black/40 bg-[#c0392b] overflow-hidden`}>
        <img 
          src={currentSrc} 
          alt="back" 
          className={`w-full h-full object-cover transition-opacity duration-300 ${imgStatus === 'success' ? 'opacity-100' : 'opacity-0'}`}
          onError={handleImgError}
          onLoad={() => setImgStatus('success')}
        />
        {(imgStatus === 'error' || useFallback) && (
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
      className={`relative ${className} hwatu-card-shadow rounded-[3px] border border-black/20 bg-white overflow-hidden transition-all transform ${disabled ? 'opacity-50 grayscale' : 'hover:z-20 hover:scale-110 active:scale-95'}`}
    >
      {/* 이미지 레이어 */}
      {!useFallback && (
        <img 
          src={currentSrc} 
          alt={card.name} 
          className={`w-full h-full object-fill transition-opacity duration-300 ${imgStatus === 'success' ? 'opacity-100' : 'opacity-0'}`}
          onError={handleImgError}
          onLoad={() => setImgStatus('success')}
        />
      )}

      {/* 그래픽(CSS) 카드 레이어: 모든 이미지 로딩 실패 시 표시 */}
      {(imgStatus === 'error' || useFallback) && (
        <div className="absolute inset-0 flex flex-col items-center justify-between p-1 bg-white select-none">
          <div className="w-full flex justify-between items-start">
             <span className="text-[14px] font-black leading-none" style={{ color: card.color }}>{card.month}</span>
             <span className="text-[7px] font-bold opacity-30 tracking-tighter">{card.name}</span>
          </div>
          
          <div className="flex-1 flex items-center justify-center">
            {card.type === 'Kwang' ? (
              <div className="w-7 h-7 rounded-full flex items-center justify-center bg-red-600 text-white font-black text-[10px] shadow-sm">光</div>
            ) : card.type === 'SsangPi' ? (
              <div className="w-7 h-7 rounded-full flex items-center justify-center border-2 border-red-500 text-red-600 font-black text-[9px]">쌍피</div>
            ) : (
              <div className="text-xl opacity-30" style={{ color: card.color }}>
                {card.month === 12 ? '☂️' : card.month === 8 ? '🌙' : card.month === 3 ? '🌸' : '🎴'}
              </div>
            )}
          </div>

          <div className="w-full text-right">
             <span className={`text-[9px] font-black px-1 rounded ${card.type === 'Kwang' ? 'bg-red-600 text-white' : 'text-black opacity-60'}`}>
                {typeLabels[card.type]}
             </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: card.color, opacity: 0.2 }} />
        </div>
      )}

      {/* 로딩 스피너 */}
      {imgStatus === 'loading' && !useFallback && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-50">
          <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
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

    await update(ref(db, `rooms/${roomId}`), {
      status: 'playing',
      players,
      field: shuffled.splice(0, 8),
      deck: shuffled,
      turn: room.hostId,
      lastUpdate: Date.now()
    });
  };

  const handleCardPlay = async (card: Card) => {
    if (!room || room.turn !== user.uid || isProcessing) return;
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
        if (me.hand.length === 0) current.status = 'finished';
        return current;
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!room) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#1a3a16]">
       <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
       <p className="text-white font-bold animate-pulse uppercase tracking-[0.2em]">Game Synchronizing...</p>
    </div>
  );

  const me = room.players[user.uid] || { name: '나', photo: '', score: 0, hand: [], captured: [] };
  const opponentId = Object.keys(room.players).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;

  return (
    <div className="h-screen w-screen flex bg-[#1a3a16] game-board-bg overflow-hidden text-white font-sans">
      {/* Main Table Area */}
      <div className="flex-1 flex flex-col p-4 relative border-r border-white/5">
        
        {/* Opponent Info */}
        <div className="h-[120px] flex justify-between items-start">
          <div className="w-1/3 flex flex-wrap gap-0.5 p-2 bg-black/20 rounded-lg min-h-[60px] content-start overflow-hidden">
            {opponent?.captured?.map((c, i) => (
               <div key={i} className="w-5 h-8 rounded-[1px] shadow-sm border border-white/5 overflow-hidden">
                 <img src={c.image} className="w-full h-full object-fill" onError={(e) => (e.currentTarget.style.display = 'none')} />
               </div>
            ))}
          </div>
          <div className="flex -space-x-8 mt-2 opacity-80">
            {(opponent?.hand || Array(10).fill(0)).map((_, i) => <HwatuCard key={i} isBack className="w-12 h-18 rotate-180" />)}
          </div>
          <div className="w-1/3 text-right">
             <div className="inline-block score-badge px-6 py-1 rounded-full text-2xl font-black italic shadow-lg">
                {opponent?.score || 0}점
             </div>
          </div>
        </div>

        {/* Board Section */}
        <div className="flex-1 flex items-center justify-center">
          <div className="grid grid-cols-6 gap-4 p-8 bg-black/10 rounded-[3rem] border border-white/5 shadow-inner">
            {(room.field || []).map((c) => (
              <HwatuCard key={c.id} card={c} className="w-16 h-24 animate-deal" />
            ))}
            {room.status === 'waiting' && <div className="col-span-6 text-4xl font-black text-white/5 italic select-none">WAITING OPPONENT</div>}
          </div>
          
          <div className="absolute right-12 top-1/2 -translate-y-1/2 flex flex-col items-center">
            <HwatuCard isBack className="w-16 h-24 shadow-[6px_6px_0_rgba(0,0,0,0.3)]" />
            <span className="mt-3 font-black text-white/20">{room.deck?.length || 0}</span>
          </div>
        </div>

        {/* My Section */}
        <div className="h-[250px] flex flex-col justify-end">
           <div className="flex justify-between items-end gap-6 mb-4">
              <div className="w-72 bg-black/40 p-3 rounded-2xl border border-white/10 shadow-2xl h-40 overflow-y-auto scrollbar-hide flex flex-wrap gap-1 content-start">
                 {me.captured?.map((c, i) => (
                    <div key={i} className="w-6 h-9 rounded-[1px] shadow-md border border-white/5 overflow-hidden">
                      <img src={c.image} className="w-full h-full object-fill" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    </div>
                 ))}
              </div>

              <div className="flex-1 flex justify-center items-end px-4 gap-2">
                 {(me.hand || []).map(c => (
                   <HwatuCard 
                     key={c.id} 
                     card={c} 
                     onClick={() => handleCardPlay(c)}
                     disabled={room.turn !== user.uid || isProcessing}
                     className={`w-20 h-30 shadow-2xl transition-all ${room.turn === user.uid ? 'hover:-translate-y-8 cursor-pointer ring-2 ring-yellow-400' : 'opacity-40 grayscale scale-95'}`}
                   />
                 ))}
              </div>

              <div className="w-48 text-right">
                 <div className="score-badge px-8 py-2 rounded-full text-4xl font-black italic shadow-2xl inline-block mb-4">
                    {me.score}점
                 </div>
                 <div className={`px-4 py-2 rounded-xl text-sm font-black text-center ${room.turn === user.uid ? 'bg-blue-600 animate-pulse border border-blue-400' : 'bg-white/5 opacity-50'}`}>
                    {room.turn === user.uid ? '나의 차례' : '상대 차례'}
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-[200px] hud-panel p-6 flex flex-col gap-6 shadow-2xl bg-black/40 z-50">
        <div className="text-center">
           <h1 className="text-3xl font-black italic text-red-600 tracking-tighter leading-none">MATGO</h1>
           <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.4em]">Master Pro</span>
        </div>

        <div className="bg-black/40 rounded-2xl p-4 border border-white/5 flex flex-col gap-2">
           <span className="text-xs font-black text-yellow-500 uppercase tracking-widest border-b border-yellow-500/10 pb-2 mb-2">Players</span>
           <div className="flex items-center gap-2 mb-2">
              <img src={opponent?.photo || 'https://ui-avatars.com/api/?name=W'} className="w-8 h-8 rounded-lg border border-red-600 opacity-60" />
              <span className="text-xs truncate opacity-60">{opponent?.name || 'Wait...'}</span>
           </div>
           <div className="flex items-center gap-2">
              <img src={me.photo} className="w-8 h-8 rounded-lg border border-blue-500" />
              <span className="text-xs truncate font-bold">{me.name}</span>
           </div>
        </div>

        <div className="mt-auto flex flex-col gap-3">
           <button onClick={onLeave} className="w-full py-4 rounded-xl bg-neutral-900 hover:bg-red-950 font-black text-sm shadow-xl transition active:scale-95 border border-white/5">방 나가기</button>
        </div>

        {room.status === 'waiting' && room.hostId === user.uid && opponent && (
          <button onClick={handleStartGame} className="w-full py-8 rounded-3xl score-badge font-black text-3xl shadow-2xl animate-bounce active:scale-95">시작</button>
        )}
      </div>
    </div>
  );
};

export default GameView;
