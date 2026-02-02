"use client";

import { useCallback, useEffect, useRef } from "react";

export const useSounds = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const pressBufferRef = useRef<AudioBuffer | null>(null);
  const releaseBufferRef = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    const loadSound = async () => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        const pressResponse = await fetch("/assets/keycap-sounds/press.mp3");
        const pressArrayBuffer = await pressResponse.arrayBuffer();
        pressBufferRef.current = await ctx.decodeAudioData(pressArrayBuffer);

        const releaseResponse = await fetch(
          "/assets/keycap-sounds/release.mp3"
        );
        const releaseArrayBuffer = await releaseResponse.arrayBuffer();
        releaseBufferRef.current =
          await ctx.decodeAudioData(releaseArrayBuffer);
      } catch (error) {
        console.error("Failed to load keycap sound", error);
      }
    };

    loadSound();

    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  const getContext = useCallback(() => {
    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playSoundBuffer = useCallback(
    (buffer: AudioBuffer | null, baseDetune = 0) => {
      try {
        const ctx = getContext();
        if (!ctx || !buffer) return;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.detune.value = baseDetune + Math.random() * 200 - 100;

        const gainNode = ctx.createGain();
        gainNode.gain.value = 0.4;

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        source.start(0);
      } catch (err) {
        console.error(err);
      }
    },
    [getContext]
  );

  const playPressSound = useCallback(() => {
    playSoundBuffer(pressBufferRef.current);
  }, [playSoundBuffer]);

  const playReleaseSound = useCallback(() => {
    playSoundBuffer(releaseBufferRef.current);
  }, [playSoundBuffer]);

  return { playPressSound, playReleaseSound };
};
