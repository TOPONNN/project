"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { usePresence, EmojiData } from "../PresenceProvider";
import { useMediaQuery } from "../../hooks/use-media-query";
import { MousePointer2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface RemoteEmoji extends EmojiData {
  id: string;
}

const normalizePathWithoutTrailingSlash = (path: string | undefined | null): string => {
  if (!path) return "/";
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
};

export default function RemoteCursors() {
  const { users, socketId, registerEmojiListener } = usePresence();
  const pathname = usePathname();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [remoteEmojis, setRemoteEmojis] = useState<RemoteEmoji[]>([]);

  const normalizedPathname = useMemo(() => normalizePathWithoutTrailingSlash(pathname), [pathname]);

  useEffect(() => {
    return registerEmojiListener((data) => {
      setRemoteEmojis((prev) => [
        ...prev,
        { ...data, id: Math.random().toString(36).substr(2, 9) },
      ]);
    });
  }, [registerEmojiListener]);

  if (isMobile) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[9999] overflow-hidden">
      <AnimatePresence>
        {users
          .filter(
            (user) =>
              user.socketId !== socketId &&
              normalizePathWithoutTrailingSlash(user.currentPage) === normalizedPathname &&
              user.posX !== undefined &&
              user.posY !== undefined
          )
          .map((user) => (
            <motion.div
              key={user.socketId}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                x: user.posX,
                y: user.posY,
                opacity: 1,
                scale: 1,
              }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{
                duration: 0.2,
                ease: "easeOut",
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 },
              }}
              className="absolute top-0 left-0"
            >
              <MousePointer2
                style={{ color: user.color || "#000" }}
                className="h-5 w-5 fill-current"
              />
              <motion.div
                className="absolute left-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white shadow-md overflow-hidden"
                style={{ backgroundColor: user.color || "#000" }}
              >
                {user.profileImage ? (
                  <img
                    src={user.profileImage}
                    alt={user.nickname}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-bold text-white">
                    {user.nickname?.charAt(0).toUpperCase()}
                  </span>
                )}
              </motion.div>
            </motion.div>
          ))}
      </AnimatePresence>
      <AnimatePresence>
        {remoteEmojis.map((re) => (
          <motion.div
            key={re.id}
            initial={{ opacity: 1, scale: 0, y: 0 }}
            animate={{ opacity: 0, scale: 2, y: -50 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="absolute text-4xl pointer-events-none select-none z-[10000]"
            style={{ left: re.x, top: re.y }}
            onAnimationComplete={() =>
              setRemoteEmojis((prev) => prev.filter((e) => e.id !== re.id))
            }
          >
            {re.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
