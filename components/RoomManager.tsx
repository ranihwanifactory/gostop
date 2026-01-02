
import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { ref, set, push, onValue, remove } from 'firebase/database';
import { User } from 'firebase/auth';
import { GameRoom, PlayerState } from '../types';

interface RoomManagerProps {
  user: User;
}

const RoomManager: React.FC<RoomManagerProps> = ({ user }) => {
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [playerLimit, setPlayerLimit] = useState<2 | 3>(3);

  useEffect(() => {
    const roomsRef = ref(db, 'rooms');
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRooms(Object.values(data));
      } else {
        setRooms([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const createRoom = async () => {
    setIsCreating(true);
    const roomsRef = ref(db, 'rooms');
    const newRoomRef = push(roomsRef);
    const roomId = newRoomRef.key!;

    const initialPlayer: PlayerState = {
      uid: user.uid,
      name: user.displayName || '익명',
      photoURL: user.photoURL || '',
      selectedCards: [],
      goCount: 0,
      isShaken: false,
      score: 0,
      isWinner: false
    };

    const newRoom: GameRoom = {
      roomId,
      hostId: user.uid,
      status: 'waiting',
      players: { [user.uid]: initialPlayer },
      playerLimit
    };

    await set(newRoomRef, newRoom);
    setIsCreating(false);
  };

  const joinRoom = async (room: GameRoom) => {
    const players = room.players || {};
    if (Object.keys(players).length >= room.playerLimit) {
      alert("방이 가득 찼습니다.");
      return;
    }

    const playerState: PlayerState = {
      uid: user.uid,
      name: user.displayName || '익명',
      photoURL: user.photoURL || '',
      selectedCards: [],
      goCount: 0,
      isShaken: false,
      score: 0,
      isWinner: false
    };

    await set(ref(db, `rooms/${room.roomId}/players/${user.uid}`), playerState);
  };

  return (
    <div className="space-y-6">
      <div className="hanji-texture border-2 border-amber-800 p-6 rounded-lg shadow-inner">
        <h2 className="text-2xl traditional-font font-bold text-amber-900 mb-4">방 생성하기</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">인원 설정:</span>
            <select 
              value={playerLimit}
              onChange={(e) => setPlayerLimit(Number(e.target.value) as 2 | 3)}
              className="border-2 border-amber-800 rounded p-1 bg-white"
            >
              <option value={2}>2인용 (맞고)</option>
              <option value={3}>3인용 (고스톱)</option>
            </select>
          </div>
          <button 
            onClick={createRoom}
            disabled={isCreating}
            className="bg-red-800 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition shadow-md disabled:opacity-50"
          >
            {isCreating ? '방 만드는 중...' : '새 게임 시작'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rooms.length === 0 ? (
          <div className="col-span-full py-20 text-center text-gray-400 italic">
            현재 대기 중인 방이 없습니다. 첫 번째 방을 만들어보세요!
          </div>
        ) : (
          rooms.map(room => (
            <div key={room.roomId} className="bg-white border-2 border-amber-200 p-4 rounded-lg shadow hover:border-amber-400 transition flex justify-between items-center">
              <div>
                {/* Fixed: Added type assertion to Object.values to avoid 'unknown' type error */}
                <h3 className="font-bold text-lg text-amber-900">{room.hostId === user.uid ? '나의 방' : `${(Object.values(room.players || {}) as PlayerState[])[0]?.name}님의 방`}</h3>
                <p className="text-sm text-gray-600">
                  참여 인원: {Object.keys(room.players || {}).length} / {room.playerLimit}명
                </p>
                <span className={`text-xs px-2 py-0.5 rounded ${room.status === 'waiting' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {room.status === 'waiting' ? '대기 중' : '게임 중'}
                </span>
              </div>
              <button 
                onClick={() => joinRoom(room)}
                disabled={room.status !== 'waiting' || Object.keys(room.players || {}).length >= room.playerLimit}
                className="bg-amber-800 text-white px-4 py-2 rounded hover:bg-amber-700 disabled:opacity-50"
              >
                입장하기
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RoomManager;
