
import React, { useState, useEffect } from 'react';
// Fix: Explicitly import onAuthStateChanged from firebase/auth
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import AuthView from './components/AuthView';
import LobbyView from './components/LobbyView';
import GameView from './components/GameView';

const App: React.FC = () => {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);

  useEffect(() => {
    // Firebase Auth 리스너
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    }, (error) => {
      console.error("Auth State Error:", error);
      setLoading(false);
    });

    // Hash 변경 감지 리스너
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash.startsWith('room/')) {
        const id = hash.split('/')[1];
        setCurrentRoomId(id || null);
      } else {
        setCurrentRoomId(null);
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);

    return () => {
      unsubscribe();
      window.removeEventListener('hashchange', handleHash);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neutral-900">
        <div className="relative">
          <i className="fa-solid fa-sync fa-spin text-5xl text-red-600"></i>
          <div className="absolute inset-0 flex items-center justify-center">
            <i className="fa-solid fa-gamepad text-xs text-white opacity-50"></i>
          </div>
        </div>
        <p className="mt-6 text-lg font-bold text-white tracking-widest animate-pulse uppercase">Initializing Matgo Master</p>
      </div>
    );
  }

  // 로그인하지 않은 경우
  if (!user) {
    return <AuthView />;
  }

  // 게임 방에 참여 중인 경우
  if (currentRoomId) {
    return (
      <GameView 
        roomId={currentRoomId} 
        user={user} 
        onLeave={() => {
          window.location.hash = '';
          setCurrentRoomId(null);
        }} 
      />
    );
  }

  // 기본은 대기실
  return <LobbyView user={user} />;
};

export default App;