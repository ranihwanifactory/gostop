
import React, { useState, useEffect } from 'react';
import { ref, onValue, update, runTransaction, off } from 'firebase/database';
import { db } from '../firebase';
import { GameRoom, Card } from '../types';
import { INITIAL_DECK, HWATU_BACK_IMAGE } from '../constants';

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

      if (data.status === 'waiting' && Object.keys(data.players).length < 2 && !data.players[user.uid]) {
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
    return () => off(roomRef, 'value', unsubscribe as any);
  }, [roomId, user.uid, onLeave, user.displayName, user.photoURL]);

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
  };

  const handleCardPlay = async (card: Card) => {
    if (!room || room.status !== 'playing' || room.turn !== user.uid || isProcessing) return;
    setIsProcessing(true);

    const roomRef = ref(db, `rooms/${roomId}`);
    try {
      await runTransaction(roomRef, (current) => {
        if (!current) return current;
        let deck = [...(current.deck || [])];
        let field = [...(current.field || [])];
        let players = { ...current.players };
        let me = players[user.uid];
        let captured: Card[] = [];

        me.hand = me.hand.filter((c: Card) => c.id !== card.id);
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

        const nextTurn = Object.keys(players).find(id => id !== user.uid) || user.uid;
        const opponent = players[nextTurn];
        if (me.hand.length === 0 && (opponent.hand?.length || 0) === 0) {
          current.status = 'finished';
        }

        current.players = players;
        current.field = field;
        current.deck = deck;
        current.turn = nextTurn;
        return current;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading || !room) return <div className="h-screen flex items-center justify-center">Loading Duel...</div>;

  const me = room.players[user.uid];
  const opponentId = Object.keys(room.players).find(id => id !== user.uid);
  const opponent = opponentId ? room.players[opponentId] : null;

  return (
    <div className="h-screen w-screen game-board-bg flex flex-col p-6 overflow-hidden select-none">
      <div className="flex justify-between items-start z-10">
        <button onClick={onLeave} className="bg-white/10 hover:bg-white/20 p-3 rounded-full border border-white/20 transition">
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        <div className="text-center">
            <h1 className="text-xl font-black italic tracking-tighter text-red-500 uppercase">{room.name}</h1>
            <div className={`text-xs font-bold ${room.turn === user.uid ? 'text-green-400' : 'text-white/40'}`}>
                {room.status === 'playing' ? (room.turn === user.uid ? '나의 턴입니다' : '상대의 턴입니다') : '대기 중'}
            </div>
        </div>
        <div className="w-12"></div>
      </div>

      {room.status === 'waiting' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-10">
          <div className="flex gap-20">
            <div className="flex flex-col items-center gap-4">
               <img src={room.players[room.hostId]?.photo} className="w-32 h-32 rounded-full border-4 border-red-600 shadow-2xl" />
               <div className="font-black text-xl">{room.players[room.hostId]?.name}</div>
            </div>
            <div className="flex items-center text-5xl font-black italic text-white/10">VS</div>
            <div className="flex flex-col items-center gap-4">
               {opponent ? (
                 <>
                   <img src={opponent.photo} className="w-32 h-32 rounded-full border-4 border-blue-600 shadow-2xl" />
                   <div className="font-black text-xl">{opponent.name}</div>
                 </>
               ) : (
                 <div className="w-32 h-32 rounded-full border-4 border-dashed border-white/20 flex items-center justify-center">
                   <i className="fa-solid fa-user-plus text-white/20"></i>
                 </div>
               )}
            </div>
          </div>
          {room.hostId === user.uid && opponent && (
            <button onClick={handleStartGame} className="bg-red-600 hover:bg-red-700 text-white font-black px-16 py-5 rounded-2xl text-2xl shadow-xl transition-transform hover:scale-110">
              대결 시작
            </button>
          )}
        </div>
      ) : room.status === 'finished' ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
           <h2 className="text-7xl font-black italic text-red-600 mb-4">GAME OVER</h2>
           <div className="flex gap-8 mb-8">
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                 <div className="text-xs font-bold opacity-40 uppercase">My Score</div>
                 <div className="text-4xl font-black">{me?.score}</div>
              </div>
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                 <div className="text-xs font-bold opacity-40 uppercase">Opponent</div>
                 <div className="text-4xl font-black">{opponent?.score || 0}</div>
              </div>
           </div>
           <button onClick={handleStartGame} className="bg-white text-black font-black px-12 py-4 rounded-xl hover:bg-neutral-200 transition">Rematch</button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between py-8">
          <div className="flex justify-between items-start">
             <div className="flex gap-4 p-4 bg-black/40 rounded-3xl border border-white/5">
                <img src={opponent?.photo} className="w-12 h-12 rounded-full border-2 border-red-500" />
                <div>
                   <div className="text-xs opacity-60">{opponent?.name}</div>
                   <div className="text-2xl font-black text-red-500">{opponent?.score || 0} PTS</div>
                </div>
             </div>
             <div className="flex -space-x-8">
                {opponent?.hand?.map((_, i) => (
                  <img key={i} src={HWATU_BACK_IMAGE} className="w-12 h-18 rounded-md border border-black/50 shadow-lg rotate-180" />
                ))}
             </div>
             <div className="w-64 h-24 bg-black/20 rounded-xl grid grid-cols-6 gap-1 p-2 overflow-y-auto border border-white/5">
