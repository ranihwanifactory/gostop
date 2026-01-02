
import React, { useState, useEffect } from 'react';
import { auth, db, googleProvider } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { ref, onValue } from 'firebase/database';
import { GameRoom } from './types';
import RoomManager from './components/RoomManager';
import GameBoard from './components/GameBoard';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentRoom, setCurrentRoom] = useState<GameRoom | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setLoading(false);
        setCurrentRoom(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const roomsRef = ref(db, 'rooms');
    const unsubscribeRooms = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const rooms = Object.keys(data).map(key => ({
          ...data[key],
          roomId: key
        })) as GameRoom[];
        
        const userRoom = rooms.find(r => r.players && r.players[user.uid]);
        if (userRoom) {
          setCurrentRoom(userRoom);
        } else {
          setCurrentRoom(null);
        }
      } else {
        setCurrentRoom(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Firebase error:", error);
      setLoading(false);
    });

    return () => unsubscribeRooms();
  }, [user]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a3a1a]">
        <div className="text-xl text-amber-500 traditional-font animate-pulse">패를 섞는 중입니다...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#1a3a1a] p-6 text-center">
        <div className="mb-12">
          <h1 className="text-6xl traditional-font font-bold text-red-600 mb-4 drop-shadow-lg">고스톱 온라인</h1>
          <p className="text-amber-200 opacity-80">전통의 멋, 실시간 대국 시스템</p>
        </div>
        <div className="bg-white/5 border border-white/10 p-12 rounded-3xl shadow-2xl backdrop-blur-xl max-w-sm w-full">
            <button 
                onClick={handleGoogleLogin}
                className="w-full bg-white text-gray-900 py-4 px-6 rounded-2xl flex items-center justify-center gap-4 hover:scale-105 transition-all shadow-xl font-bold"
            >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="google" />
                <span>Google 계정으로 로그인</span>
            </button>
            <p className="mt-8 text-xs text-gray-400">
                로그인하여 친구와 실시간 대국을 즐겨보세요.
            </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black overflow-hidden">
      {currentRoom ? (
        <GameBoard room={currentRoom} user={user} />
      ) : (
        <div className="h-full overflow-y-auto bg-[#f4ece1] p-4">
           <header className="mb-6 flex justify-between items-center p-4 bg-red-900 text-white rounded-xl shadow-lg">
             <h1 className="text-xl font-bold traditional-font">대기실</h1>
             <button onClick={() => signOut(auth)} className="text-xs opacity-70">로그아웃</button>
           </header>
           <RoomManager user={user} />
        </div>
      )}
    </div>
  );
};

export default App;
