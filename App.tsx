
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { ref, onValue, set, update } from 'firebase/database';
import { auth, db, googleProvider } from './services/firebase';
import { INITIAL_DECK } from './constants';
import { Card, GameState } from './types';
import { shuffle, calculateScore, findMatches } from './utils/gameLogic';
import HanafudaCard from './components/HanafudaCard';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [roomId, setRoomId] = useState<string | null>(new URLSearchParams(window.location.search).get('room'));
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (roomId) {
      const roomRef = ref(db, `rooms/${roomId}`);
      return onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setGameState(data);
        }
      });
    }
  }, [roomId]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) { console.error(e); }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      try {
        await createUserWithEmailAndPassword(auth, email, password);
      } catch (err) { alert("로그인 실패: " + err); }
    }
  };

  const createRoom = async () => {
    if (!user) return;
    setIsProcessing(true);
    try {
      const newRoomId = Math.random().toString(36).substring(2, 9);
      const deck = shuffle(INITIAL_DECK);
      const p1Hand = deck.splice(0, 10);
      const p2Hand = deck.splice(0, 10);
      const floor = deck.splice(0, 8);

      const initialGameState: GameState = {
        deck,
        floor,
        players: [
          { id: user.uid, name: user.displayName || user.email || "Player 1", hand: p1Hand, captured: [], score: 0, goCount: 0 },
          { id: "waiting", name: "대기 중...", hand: p2Hand, captured: [], score: 0, goCount: 0 }
        ],
        currentPlayerIndex: 0,
        isGameOver: false,
        winner: null,
        logs: ["새 방이 생성되었습니다. 친구를 초대하세요!"]
      };

      // CRITICAL: Firebase does not accept 'undefined'. 
      // JSON stringify/parse is a robust way to strip undefined properties.
      const safeData = JSON.parse(JSON.stringify(initialGameState));
      
      await set(ref(db, `rooms/${newRoomId}`), safeData);
      setRoomId(newRoomId);
      window.history.pushState({}, '', `?room=${newRoomId}`);
    } catch (error) {
      console.error("Room creation error:", error);
      alert("방 생성 중 오류가 발생했습니다.");
    } finally {
      setIsProcessing(false);
    }
  };

  const joinRoom = async () => {
    if (!user || !roomId || !gameState) return;
    if (gameState.players[0].id === user.uid) return; 
    
    if (gameState.players[1].id === "waiting") {
      const updatedPlayers = [...gameState.players];
      updatedPlayers[1] = {
        ...updatedPlayers[1],
        id: user.uid,
        name: user.displayName || user.email || "Player 2"
      };
      await update(ref(db, `rooms/${roomId}`), { players: JSON.parse(JSON.stringify(updatedPlayers)) });
    }
  };

  const shareRoom = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    alert("초대 링크가 복사되었습니다!");
  };

  const playTurn = async (cardIndex: number) => {
    if (!gameState || !roomId || isProcessing) return;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.id !== user?.uid) return;

    setIsProcessing(true);
    try {
      const state = JSON.parse(JSON.stringify(gameState)) as GameState;
      const player = state.players[state.currentPlayerIndex];
      const card = player.hand[cardIndex];

      player.hand.splice(cardIndex, 1);
      const matches = findMatches(card, state.floor);
      let captured = [];
      if (matches.length > 0) {
        captured.push(card, ...matches);
        state.floor = state.floor.filter(f => !matches.some(m => m.id === f.id));
      } else {
        state.floor.push(card);
      }

      if (state.deck.length > 0) {
        const top = state.deck.shift()!;
        const deckMatches = findMatches(top, state.floor);
        if (deckMatches.length > 0) {
          captured.push(top, ...deckMatches);
          state.floor = state.floor.filter(f => !deckMatches.some(m => m.id === f.id));
        } else {
          state.floor.push(top);
        }
      }

      player.captured.push(...captured);
      player.score = calculateScore(player.captured);
      
      state.currentPlayerIndex = 1 - state.currentPlayerIndex;
      state.logs = [`${player.name}님이 ${card.month}월 카드를 냈습니다.`, ...state.logs].slice(0, 5);
      
      await set(ref(db, `rooms/${roomId}`), JSON.parse(JSON.stringify(state)));
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#1a3c1a]">로딩 중...</div>;

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg p-8 rounded-2xl border border-white/20 w-full max-w-md shadow-2xl">
          <h1 className="text-4xl font-black text-center mb-8 text-yellow-400">화투 마스터</h1>
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <input 
              type="email" placeholder="이메일" className="w-full bg-black/30 p-4 rounded-xl border border-white/10 text-white" 
              value={email} onChange={e => setEmail(e.target.value)} required
            />
            <input 
              type="password" placeholder="비밀번호" className="w-full bg-black/30 p-4 rounded-xl border border-white/10 text-white"
              value={password} onChange={e => setPassword(e.target.value)} required
            />
            <button className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-xl font-bold transition text-white">로그인 / 회원가입</button>
          </form>
          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-sm text-gray-400">또는</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <button onClick={handleGoogleLogin} className="w-full py-4 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" /> Google로 시작하기
          </button>
        </div>
      </div>
    );
  }

  if (!roomId || !gameState) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-4 gap-6">
        <div className="text-center">
            <h2 className="text-3xl font-bold mb-2">반갑습니다, {user.displayName || user.email}님!</h2>
            <p className="text-gray-400">새로운 대국을 시작하거나 친구의 초대를 기다리세요.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
            <button 
              onClick={createRoom} 
              disabled={isProcessing}
              className={`p-10 bg-green-600/20 border border-green-500/30 rounded-3xl hover:bg-green-600/30 transition flex flex-col items-center gap-4 group ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <span className="text-5xl group-hover:scale-110 transition">🎴</span>
                <span className="text-xl font-bold">새 방 만들기</span>
                {isProcessing && <span className="text-xs">생성 중...</span>}
            </button>
            <div className="p-10 bg-white/5 border border-white/10 rounded-3xl flex flex-col items-center gap-4 italic text-gray-500">
                <span className="text-5xl opacity-30">🤝</span>
                <span>초대 링크로 접속하세요</span>
            </div>
        </div>
        <button onClick={() => signOut(auth)} className="mt-8 text-gray-500 underline">로그아웃</button>
      </div>
    );
  }

  if (gameState.players[1].id === "waiting" && user.uid !== gameState.players[0].id) {
    joinRoom();
  }

  const isMyTurn = gameState.players[gameState.currentPlayerIndex].id === user.uid;
  const myIndex = gameState.players[0].id === user.uid ? 0 : 1;
  const oppIndex = 1 - myIndex;
  const me = gameState.players[myIndex];
  const opp = gameState.players[oppIndex];

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden relative select-none">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-20">
         <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold text-white">상대</div>
            <div>
               <div className="text-[10px] text-gray-400 truncate w-24">{opp.name}</div>
               <div className="text-sm font-bold text-yellow-400">{opp.score}점</div>
            </div>
         </div>
         
         <div className="flex items-center gap-2 bg-black/50 px-6 py-2 rounded-full border border-white/20">
            <span className={`w-3 h-3 rounded-full ${isMyTurn ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="font-bold text-white">{isMyTurn ? '내 차례' : '상대 차례'}</span>
         </div>

         <div className="flex gap-2">
            <button onClick={shareRoom} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition" title="초대 링크 복사">🔗</button>
            <button onClick={() => { setRoomId(null); window.history.pushState({}, '', '/'); }} className="p-2 bg-red-600/50 hover:bg-red-600 rounded-full transition" title="방 나가기">🚪</button>
         </div>
      </div>

      <div className="h-32 flex justify-center items-start pt-16">
         <div className="flex -space-x-10">
            {opp.hand.map((_, i) => <HanafudaCard key={i} card={{} as Card} isHidden isSmall />)}
         </div>
      </div>

      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 max-h-[60%] overflow-y-auto w-32 bg-black/20 p-2 rounded-xl">
         <div className="text-[10px] text-gray-400 text-center border-b border-white/10 pb-1">상대 획득</div>
         <div className="flex flex-wrap gap-1 justify-center">
            {opp.captured.map((c, i) => <HanafudaCard key={i} card={c} isSmall />)}
         </div>
      </div>

      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 max-h-[60%] overflow-y-auto w-32 bg-black/20 p-2 rounded-xl items-end">
         <div className="text-[10px] text-gray-400 text-center border-b border-white/10 pb-1 w-full">내 획득</div>
         <div className="flex flex-wrap gap-1 justify-center">
            {me.captured.map((c, i) => <HanafudaCard key={i} card={c} isSmall />)}
         </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-40">
         <div className="w-full max-w-4xl grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 p-8 bg-black/10 rounded-3xl border border-white/5 min-h-[300px] content-center place-items-center">
            {gameState.floor.map((card) => (
               <HanafudaCard key={card.id} card={card} className="animate-deal" />
            ))}
            {gameState.floor.length === 0 && (
                <div className="col-span-full text-white/10 font-black text-2xl">바닥이 비었습니다</div>
            )}
         </div>
      </div>

      <div className={`h-48 flex flex-col items-center justify-end pb-6 transition-all ${!isMyTurn ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
         <div className="text-xl font-black text-yellow-400 mb-2 drop-shadow-md">{me.score} 점</div>
         <div className="flex gap-2 p-4 bg-white/5 rounded-2xl border border-white/10">
            {me.hand.map((card, i) => (
               <HanafudaCard 
                key={card.id} 
                card={card} 
                onClick={() => playTurn(i)}
                className="hover:ring-4 hover:ring-yellow-400"
               />
            ))}
         </div>
      </div>

      <div className="absolute bottom-4 left-4 max-w-xs pointer-events-none">
         {gameState.logs.map((log, i) => (
            <div key={i} className={`text-[10px] p-2 rounded bg-black/60 backdrop-blur-sm mb-1 text-white transition-opacity ${i === 0 ? 'opacity-100 border border-white/20' : 'opacity-40'}`}>
               {log}
            </div>
         ))}
      </div>

      {gameState.isGameOver && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center">
              <div className="text-center space-y-6 bg-white/10 p-12 rounded-3xl backdrop-blur-xl border border-white/20">
                  <h2 className={`text-6xl font-black italic drop-shadow-lg ${gameState.winner === user.uid ? 'text-yellow-500' : 'text-gray-500'}`}>
                      {gameState.winner === user.uid ? '대 승 리 !' : '패 배 . . .'}
                  </h2>
                  <p className="text-xl text-white">최종 점수: {me.score} vs {opp.score}</p>
                  <button 
                    onClick={() => { setRoomId(null); window.history.pushState({}, '', '/'); }}
                    className="px-10 py-4 bg-red-600 text-white rounded-full font-bold hover:scale-105 transition shadow-xl"
                  >
                    로비로 돌아가기
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
