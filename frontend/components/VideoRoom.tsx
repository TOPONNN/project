"use client";

import { useEffect, useState } from "react";
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  useTracks,
  RoomAudioRenderer,
  ControlBar,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Loader2, VideoOff } from "lucide-react";

interface VideoRoomProps {
  roomCode: string;
  participantName: string;
  participantId?: string;
}

export default function VideoRoom({ roomCode, participantName, participantId }: VideoRoomProps) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);

  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://plyst.info/rtc";

  useEffect(() => {
    const getToken = async () => {
      try {
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomName: `kero-${roomCode}`,
            participantName,
            participantId,
          }),
        });

        const data = await res.json();

        if (!data.success) {
          throw new Error(data.message || "Failed to get token");
        }

        setToken(data.data.token);
      } catch (e: any) {
        setError(e.message || "Failed to connect to video room");
      } finally {
        setIsConnecting(false);
      }
    };

    getToken();
  }, [roomCode, participantName, participantId]);

  if (isConnecting) {
    return (
      <div className="flex items-center justify-center h-full bg-black/50 rounded-xl">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-white" />
          <span className="text-white/60 text-sm">카메라 연결 중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-black/50 rounded-xl">
        <div className="flex flex-col items-center gap-3 text-center p-4">
          <VideoOff className="w-8 h-8 text-red-400" />
          <span className="text-white/60 text-sm">{error}</span>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center h-full bg-black/50 rounded-xl">
        <div className="flex flex-col items-center gap-3">
          <VideoOff className="w-8 h-8 text-gray-400" />
          <span className="text-white/60 text-sm">비디오를 사용할 수 없습니다</span>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={livekitUrl}
      connect={true}
      video={true}
      audio={true}
      style={{ height: "100%", background: "#000" }}
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 p-2">
          <VideoTiles />
        </div>
        <div className="p-2 border-t border-white/10">
          <ControlBar variation="minimal" />
        </div>
      </div>
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function VideoTiles() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  if (tracks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/60 text-sm">
        카메라 연결 대기 중...
      </div>
    );
  }

  return (
    <GridLayout tracks={tracks} style={{ height: "100%" }}>
      <ParticipantTile />
    </GridLayout>
  );
}
