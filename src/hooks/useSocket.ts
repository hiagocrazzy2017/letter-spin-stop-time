import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? window.location.origin 
  : 'http://localhost:3001';

export interface GameRoom {
  id: string;
  state: 'waiting' | 'playing' | 'reviewing' | 'finished';
  config: {
    rounds: number;
    timePerRound: number;
    categories: Array<{ id: string; label: string; active: boolean }>;
    excludeDifficultLetters: boolean;
  };
  currentRound: number;
  currentLetter: string | null;
  players: Array<{
    id: string;
    name: string;
    isHost: boolean;
    totalScore: number;
  }>;
  playerScores: Record<string, number>;
  timeRemaining: number;
}

export interface ChatMessage {
  id: number;
  playerId?: string;
  playerName?: string;
  message: string;
  timestamp: number;
  type: 'player' | 'system';
}

export const useSocket = () => {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const connect = () => {
    if (socketRef.current && !socketRef.current.connected) {
      socketRef.current.connect();
    }
  };

  const disconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  const createRoom = (playerName: string) => {
    if (socketRef.current) {
      socketRef.current.emit('create_room', { playerName });
    }
  };

  const joinRoom = (roomId: string, playerName: string) => {
    if (socketRef.current) {
      socketRef.current.emit('join_room', { roomId, playerName });
    }
  };

  const configureGame = (config: Partial<GameRoom['config']>) => {
    if (socketRef.current) {
      socketRef.current.emit('configure_game', config);
    }
  };

  const startGame = () => {
    if (socketRef.current) {
      socketRef.current.emit('start_game');
    }
  };

  const submitAnswers = (answers: Record<string, string>) => {
    if (socketRef.current) {
      socketRef.current.emit('submit_answers', answers);
    }
  };

  const callStop = () => {
    if (socketRef.current) {
      socketRef.current.emit('call_stop');
    }
  };

  const nextRound = () => {
    if (socketRef.current) {
      socketRef.current.emit('next_round');
    }
  };

  const restartGame = () => {
    if (socketRef.current) {
      socketRef.current.emit('restart_game');
    }
  };

  const sendMessage = (message: string) => {
    if (socketRef.current) {
      socketRef.current.emit('send_message', message);
    }
  };

  const on = (event: string, callback: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
  };

  const off = (event: string, callback?: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.off(event, callback);
    }
  };

  return {
    socket: socketRef.current,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    configureGame,
    startGame,
    submitAnswers,
    callStop,
    nextRound,
    restartGame,
    sendMessage,
    on,
    off
  };
};