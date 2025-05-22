// src/context/SocketContext.tsx

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type SocketContextType = {
  socket: Socket | null;
};

const SocketContext = createContext<SocketContextType>({ socket: null });

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_APP_BACKEND_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket']
    });


    newSocket.on('connect', () => console.log('🔌 Connected:', newSocket.id));
    newSocket.on('connect_error', (err) => console.error('❌ Connection Error:', err.message));
    newSocket.on('disconnect', (reason) => console.warn('⚠️ Disconnected:', reason));
    setSocket(newSocket);


    return () => {
      newSocket.disconnect();
      console.log('❌ Socket disconnected');
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
