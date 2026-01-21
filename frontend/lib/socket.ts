import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "", {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
};

export const connectSocket = (token: string): Socket => {
  const s = getSocket();
  s.auth = { token };
  s.connect();
  return s;
};

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
  }
};
