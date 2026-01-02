
import React, { useState, useEffect } from 'react';
// Fix: Use standard modular import for onAuthStateChanged
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
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash.startsWith('room/')) {
        setCurrentRoomId(hash.split('/')[1]);
      } else {
        setCurrentRoomId(null);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-900">
        <div className="text-center">
          <i className="fa-solid fa-sync fa-spin text-4xl text-red-600 mb-4"></i>
          <p className="text-xl font-bold text-white">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  if (currentRoomId) {
    return (
      <GameView 
        roomId={currentRoomId} 
        user={user} 
        onLeave={() => window.location.hash = ''} 
      />
    );
  }

  return <LobbyView user={user} />;
};

export default App;
