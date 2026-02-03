"use client";

import { usePresence } from "../PresenceProvider";
import { useMediaQuery } from "../../hooks/use-media-query";
import { MousePointer2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function RemoteCursors() {
  const { users, socketId } = usePresence();
  const isMobile = useMediaQuery("(max-width: 768px)");

  if (isMobile) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[9999] overflow-hidden">
      <AnimatePresence>
        {users
          .filter(
            (user) =>
              user.socketId !== socketId &&
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
    </div>
  );
}
