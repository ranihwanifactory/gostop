
import React, { useState, useEffect } from 'react';
// Fix: Explicitly import signOut from firebase/auth
import { signOut } from 'firebase/auth';
import { ref, onValue, push, set } from 'firebase/database';
import { auth, db } from '../firebase';
import { GameRoom } from '../types';

interface LobbyViewProps {
  user: any;
}

const LobbyView: React.FC<LobbyViewProps> = ({ user }) => {
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);

  useEffect(() => {
    const roomsRef = ref(db, 'rooms');
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      setLoadingRooms(false);
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        const roomList: GameRoom[] = Object.entries(data)
          .filter(([_, value]) => value && typeof value === 'object')
          .map(([key, value]: [string, any]) => ({
            ...value,
            id: key,
            players: value.players || {}
          }));
        
        // 1. 대기 중인 방 (waiting)
        // 2. 호스트 정보가 유효한 방 (hostId가 존재하고 players 목록에 호스트가 있는 방)
        // 위 두 조건을 만족하는 실제 방만 표시
        const validRooms = roomList.filter(r => 
          r.status === 'waiting' && 
          r.hostId && 
          r.players && 
          r.players[r.hostId]
        );
        
        setRooms(validRooms);
      } else {
        setRooms([]);
      }
    }, (error) => {
      console.error("Firebase Room Load Error:", error);
      setLoadingRooms(false);
    });
    
    return () => unsubscribe();
  }, []);

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    try {
      const roomsRef = ref(db, 'rooms');
      const newRoomRef = push(roomsRef);
      
      const initialRoom: Partial<GameRoom> = {
        name: newRoomName.trim(),
        hostId: user.uid,
        status: 'waiting',
        players: {
          [user.uid]: {
            uid: user.uid,
            name: user.displayName || user.email?.split('@')[0] || 'Unknown',
            photo: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'U'}`,
            hand: [],
            captured: [],
            score: 0
          }
        },
        lastUpdate: Date.now()
      };

      await set(newRoomRef, initialRoom);
      window.location.hash = `room/${newRoomRef.key}`;
    } catch (error) {
      console.error("Room Creation Error:", error);
      alert("방 생성에 실패했습니다.");
    }
  };

  const handleJoinRoom = (roomId: string) => {
    window.location.hash = `room/${roomId}`;
  };

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col text-white">
      <header className="bg-black/50 border-b border-white/10 p-4 flex items-center justify-between backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black text-red-600 tracking-tighter italic">MATGO MASTER</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/5 p-2 rounded-full pr-4 border border-white/10">
            <img 
              src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'U'}`} 
              className="w-8 h-8 rounded-full object-cover" 
              alt="Avatar" 
            />
            <span className="text-sm font-bold hidden sm:inline">{user.displayName || 'User'}</span>
          </div>
          <button 
            onClick={() => signOut(auth)} 
            className="p-2 hover:bg-white/10 rounded-full transition text-neutral-400 hover:text-white"
          >
            <i className="fa-solid fa-right-from-bracket"></i>
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto max-w-5xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold mb-1">대기실</h2>
            <p className="text-neutral-500 text-sm">참여할 대전 방을 선택하거나 새로 만드세요</p>
          </div>
          <button 
            onClick={() => setIsCreating(!isCreating)}
            className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl shadow-xl shadow-red-900/20 flex items-center justify-center gap-2 transition transform active:scale-95"
          >
            <i className={`fa-solid ${isCreating ? 'fa-times' : 'fa-plus'}`}></i> 
            {isCreating ? '취소하기' : '방 만들기'}
          </button>
        </div>

        {isCreating && (
          <div className="bg-neutral-800 border border-red-900/30 p-6 rounded-2xl mb-8 animate-in slide-in-from-top-4 duration-300 shadow-2xl">
            <h3 className="text-lg font-bold mb-4 text-white">대전 방 설정</h3>
            <div className="flex flex-col sm:flex-row gap-4">
              <input 
                type="text" 
                value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                placeholder="방 제목을 입력하세요 (예: 한판 붙자!)"
                className="flex-1 bg-neutral-900 border border-neutral-700 p-3 rounded-lg focus:outline-none focus:border-red-600 text-white transition-colors"
                autoFocus
              />
              <button 
                onClick={handleCreateRoom} 
                className="bg-white text-black font-bold px-8 py-3 rounded-lg hover:bg-neutral-200 transition active:scale-95"
              >
                생성하기
              </button>
            </div>
          </div>
        )}

        {loadingRooms ? (
          <div className="flex flex-col items-center justify-center py-24 text-neutral-600">
            <i className="fa-solid fa-circle-notch fa-spin text-4xl mb-4"></i>
            <p>방 목록을 불러오는 중...</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-neutral-600 border-2 border-dashed border-white/5 rounded-3xl">
            <i className="fa-solid fa-ghost text-6xl mb-4 opacity-10"></i>
            <p className="text-xl font-medium">현재 대기 중인 방이 없습니다.</p>
            <p className="text-sm mt-2">직접 방을 만들어 상대를 기다려보세요!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms.map(room => (
              <div key={room.id} className="bg-neutral-800 border border-white/5 p-6 rounded-2xl hover:border-red-600/50 transition-all group relative overflow-hidden shadow-lg hover:shadow-red-900/10">
                <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-10 transition-all transform scale-150 rotate-12">
                  <i className="fa-solid fa-play text-8xl text-red-600"></i>
                </div>
                <div className="mb-4 relative z-10">
                  <h4 className="text-xl font-bold truncate group-hover:text-red-500 transition-colors pr-8">{room.name || '무제 방'}</h4>
                  <p className="text-sm text-neutral-500 mt-1 flex items-center gap-2">
                    <span className="opacity-60">방장:</span> 
                    <span className="font-medium text-neutral-300">
                      {room.players?.[room.hostId]?.name || 'Unknown'}
                    </span>
                  </p>
                </div>
                <div className="flex items-center justify-between mt-8 relative z-10">
                  <span className="text-sm font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded-full">
                    <i className="fa-solid fa-user-group mr-2"></i>
                    {room.players ? Object.keys(room.players).length : 0} / 2
                  </span>
                  <button 
                    onClick={() => handleJoinRoom(room.id)}
                    className="bg-neutral-700 hover:bg-white hover:text-black font-bold py-2 px-6 rounded-lg transition active:scale-95"
                  >
                    입장하기
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="p-8 text-center text-xs text-neutral-600 border-t border-white/5">
        &copy; 2024 Matgo Master Pro. All Rights Reserved.
      </footer>
    </div>
  );
};

export default LobbyView;
