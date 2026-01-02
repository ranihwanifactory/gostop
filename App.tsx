
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
        
        // 사용자가 플레이어로 포함된 방 찾기
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

  const handleLogout = () => {
    signOut(auth);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f4ece1]">
        <div className="text-2xl traditional-font animate-pulse">심청이가 패를 섞는 중...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#f4ece1] p-6 text-center">
        <div className="mb-8">
          <h1 className="text-5xl traditional-font font-bold text-red-800 mb-2">고스톱 한판</h1>
          <p className="text-gray-700">전통의 멋과 승부의 세계</p>
        </div>
        <div className="hanji-texture border-4 border-red-900 p-10 rounded-lg shadow-2xl max-w-sm w-full">
            <button 
                onClick={handleGoogleLogin}
                className="w-full bg-white border border-gray-300 py-3 px-4 rounded-full flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors shadow-sm"
            >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="google" />
                <span className="font-semibold text-gray-700">Google로 시작하기</span>
            </button>
            <p className="mt-6 text-xs text-gray-500">
                로그인하여 친구들과 실시간으로 점수를 관리하세요.
            </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-red-900 text-white p-4 flex justify-between items-center shadow-md">
        <h1 className="text-2xl traditional-font font-bold">고스톱 스코어</h1>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold">{user.displayName}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="text-xs bg-red-800 hover:bg-red-700 py-1 px-3 rounded border border-red-400"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
        {currentRoom ? (
          <GameBoard room={currentRoom} user={user} />
        ) : (
          <RoomManager user={user} />
        )}
      </main>

      <footer className="p-4 text-center text-gray-500 text-xs">
        &copy; 2024 Traditional Go-Stop Tracker. All Rights Reserved.
      </footer>
    </div>
  );
};

export default App;
