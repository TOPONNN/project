"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { useMouse } from "../hooks/use-mouse";
import { useThrottle } from "../hooks/use-throttle";

interface OnlineUser {
  socketId: string;
  nickname: string;
  profileImage: string | null;
  currentPage: string;
  connectedAt: number;
  posX: number;
  posY: number;
  color: string;
}

interface PresenceData {
  count: number;
  users: OnlineUser[];
}

interface PresenceContextType extends PresenceData {
  socketId: string | null;
}

const PresenceContext = createContext<PresenceContextType>({ count: 0, users: [], socketId: null });

export function usePresence() {
  return useContext(PresenceContext);
}

const avatarGradients = [
  '#a855f7',
  '#3b82f6',
  '#22c55e',
  '#f97316',
  '#ef4444',
  '#eab308',
  '#ec4899',
  '#06b6d4',
];

const getRandomColor = () => {
  return avatarGradients[Math.floor(Math.random() * avatarGradients.length)];
};

export default function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<PresenceData>({ count: 0, users: [] });
  const [socketId, setSocketId] = useState<string | null>(null);
  const pathname = usePathname();
  const socketRef = useRef<Socket | null>(null);
  const { x, y } = useMouse({ allowPage: true });

  const handleCursorMove = useCallback((posX: number, posY: number) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("cursor:move", { x: posX, y: posY });
    }
  }, []);

  const throttledCursorMove = useThrottle(handleCursorMove, 150);

  useEffect(() => {
    throttledCursorMove(x, y);
  }, [x, y, throttledCursorMove]);

  useEffect(() => {
    const socket: Socket = io({
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketId(socket.id || null);
      const userStr = localStorage.getItem("user");
      let user = null;
      try {
        user = userStr ? JSON.parse(userStr) : null;
      } catch {
        // ignore
      }

      socket.emit("presence:join", {
        nickname: user?.name || "Guest",
        profileImage: user?.profileImage || null,
        currentPage: window.location.pathname,
        color: getRandomColor(),
      });
    });

    socket.on("presence:update", (presenceData: PresenceData) => {
      setData(presenceData);
    });

    socket.on("cursor:update", (updatedUser: OnlineUser) => {
      setData((prev) => {
        const userIndex = prev.users.findIndex((u) => u.socketId === updatedUser.socketId);
        if (userIndex === -1) {
          return prev;
        }
        
        const newUsers = [...prev.users];
        newUsers[userIndex] = { ...newUsers[userIndex], ...updatedUser };
        return { ...prev, users: newUsers };
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("presence:page", { currentPage: pathname });
    }
  }, [pathname]);

  return (
    <PresenceContext.Provider value={{ ...data, socketId }}>
      {children}
    </PresenceContext.Provider>
  );
}
