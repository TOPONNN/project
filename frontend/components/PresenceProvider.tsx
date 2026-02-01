"use client";

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { io, Socket } from "socket.io-client";

interface OnlineUser {
  nickname: string;
  profileImage: string | null;
  currentPage: string;
  connectedAt: number;
}

interface PresenceData {
  count: number;
  users: OnlineUser[];
}

const PresenceContext = createContext<PresenceData>({ count: 0, users: [] });

export function usePresence() {
  return useContext(PresenceContext);
}

export default function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<PresenceData>({ count: 0, users: [] });
  const pathname = usePathname();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket: Socket = io({
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      const userStr = localStorage.getItem("user");
      let user = null;
      try {
        user = userStr ? JSON.parse(userStr) : null;
      } catch {
        // ignore
      }

      socket.emit("presence:join", {
        nickname: user?.name || "게스트",
        profileImage: user?.profileImage || null,
        currentPage: window.location.pathname,
      });
    });

    socket.on("presence:update", (presenceData: PresenceData) => {
      setData(presenceData);
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
    <PresenceContext.Provider value={data}>
      {children}
    </PresenceContext.Provider>
  );
}
