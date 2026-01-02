
import React, { useState, useEffect } from 'react';
// Fix: Use standard modular import for signOut
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

  useEffect(() => {
    const roomsRef = ref(db, 'rooms');
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const roomList: GameRoom[] = Object.keys(data).map(key => ({
          ...data[key],
          id: key
        }));
        setRooms(roomList.filter(r => r.status === 'waiting'));
      } else {
        setRooms([]);
      }
    });
    
    return () => unsubscribe();
  }, []);

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    const roomsRef = ref(db, 'rooms');
    const newRoomRef = push(roomsRef);
    
    const initialRoom: Partial<GameRoom> = {
      name: newRoomName,
      hostId: user.uid,
      status: 'waiting',
      players: {
        [user.uid]: {
          uid: user.uid,
          name: user.displayName || 'Unknown',
          photo: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`,
          hand: [],
          captured: [],
          score: 0
        }
      },
      lastUpdate: Date.now()
    };

    await set(newRoomRef, initialRoom);
    window.location.hash = `room/${newRoomRef.key}`;
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
            <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} className="w-8 h-8 rounded-full" alt="Avatar" />
            <span className="text-sm font-bold hidden sm:inline">{user.displayName}</span>
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-1">대기실</h2>
            <p className="text-neutral-500">대기 중인 방에 입장하거나 새로운 게임을 만드세요</p>
          </div>
          <button 
            onClick={() => setIsCreating(true)}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl shadow-xl shadow-red-900/20 flex items-center gap-2 transition transform active:scale-95"
          >
            <i className="fa-solid fa-plus"></i> 방 만들기
          </button>
        </div>

        {isCreating && (
          <div className="bg-neutral-800 border border-red-900/30 p-6 rounded-2xl mb-8 animate-in slide-in-from-top-4 duration-300 shadow-2xl">
            <h3 className="text-lg font-bold mb-4 text-white">방 정보 입력</h3>
            <div className="flex flex-col sm:flex-row gap-4">
              <input 
                type="text" 
                value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
                placeholder="방 제목을 입력하세요"
                className="flex-1 bg-neutral-900 border border-neutral-700 p-3 rounded-lg focus:outline-none focus:border-red-600 text-white"
              />
              <div className="flex gap-2">
                <button onClick={handleCreateRoom} className="flex-1 sm:flex-none bg-white text-black font-bold px-8 rounded-lg hover:bg-neutral-200 transition">생성</button>
                <button onClick={() => setIsCreating(false)} className="flex-1 sm:flex-none text-neutral-500 hover:text-white px-4 transition">취소</button>
              </div>
            </div>
          </div>
        )}

        {rooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-neutral-600">
            <i className="fa-solid fa-ghost text-6xl mb-4 opacity-20"></i>
            <p className="text-xl font-medium">활성 중인 방이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms.map(room => (
              <div key={room.id} className="bg-neutral-800 border border-white/5 p-6 rounded-2xl hover:border-red-600/50 transition-all group relative overflow-hidden shadow-lg">
                <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-10 transition-all transform scale-150 rotate-12">
                  <i className="fa-solid fa-play text-8xl text-red-600"></i>
                </div>
                <div className="mb-4 relative z-10">
                  <h4 className="text-xl font-bold truncate group-hover:text-red-500 transition-colors">{room.name}</h4>
                  <p className="text-sm text-neutral-500 mt-1">방장: {room.players[room.hostId]?.name || 'Unknown'}</p>
                </div>
                <div className="flex items-center justify-between mt-8 relative z-10">
                  <span className="text-sm font-bold text-red-500">
                    <i className="fa-solid fa-user-group mr-2"></i>
                    {Object.keys(room.players).length} / 2
                  </span>
                  <button 
                    onClick={() => handleJoinRoom(room.id)}
                    className="bg-neutral-700 hover:bg-white hover:text-black font-bold py-2 px-6 rounded-lg transition active:scale-95"
                  >
                    참가하기
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
