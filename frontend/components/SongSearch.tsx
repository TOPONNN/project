"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Music, Youtube, Loader2, Play, Check } from "lucide-react";

interface TJSong {
  number: string;
  title: string;
  artist: string;
}

interface YouTubeResult {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
}

interface SongSearchProps {
  onSelect: (song: { videoId: string; title: string; artist: string }) => void;
  isLoading?: boolean;
}

export default function SongSearch({ onSelect, isLoading = false }: SongSearchProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"tj" | "youtube">("tj");
  const [tjResults, setTjResults] = useState<TJSong[]>([]);
  const [youtubeResults, setYoutubeResults] = useState<YouTubeResult[]>([]);
  const [popularSongs, setPopularSongs] = useState<TJSong[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSong, setSelectedSong] = useState<string | null>(null);

  useEffect(() => {
    fetchPopular();
  }, []);

  const fetchPopular = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/search/tj/popular`);
      const data = await res.json();
      if (data.success) {
        setPopularSongs(data.data.songs.slice(0, 10));
      }
    } catch (error) {
      console.error("Failed to fetch popular songs:", error);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);

    try {
      if (activeTab === "tj") {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/search/tj?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success) {
          setTjResults(data.data.songs);
        }
      } else {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/search/youtube?q=${encodeURIComponent(query)} 노래방 MR`);
        const data = await res.json();
        if (data.success) {
          setYoutubeResults(data.data);
        }
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleTJSelect = async (song: TJSong) => {
    setSelectedSong(song.number);
    const searchQuery = `${song.title} ${song.artist} 노래방 MR`;
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/search/youtube?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      
      if (data.success && data.data.length > 0) {
        const video = data.data[0];
        onSelect({
          videoId: video.videoId,
          title: song.title,
          artist: song.artist,
        });
      }
    } catch (error) {
      console.error("YouTube search error:", error);
      setSelectedSong(null);
    }
  };

  const handleYouTubeSelect = (video: YouTubeResult) => {
    setSelectedSong(video.videoId);
    onSelect({
      videoId: video.videoId,
      title: video.title,
      artist: video.channel,
    });
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab("tj")}
          className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
            activeTab === "tj"
              ? "bg-[#C0C0C0] text-black"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          <Music className="w-4 h-4 inline mr-2" />
          TJ 노래방
        </button>
        <button
          onClick={() => setActiveTab("youtube")}
          className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
            activeTab === "youtube"
              ? "bg-red-500 text-white"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          <Youtube className="w-4 h-4 inline mr-2" />
          YouTube
        </button>
      </div>

      <div className="relative mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder={activeTab === "tj" ? "노래 제목 또는 가수명 검색..." : "YouTube에서 MR 검색..."}
          className="w-full px-5 py-4 pr-14 rounded-2xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-[#C0C0C0] transition-colors"
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-[#C0C0C0] text-black hover:bg-white transition-colors disabled:opacity-50"
        >
          {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
        </button>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="wait">
          {activeTab === "tj" ? (
            <motion.div
              key="tj"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {tjResults.length > 0 ? (
                tjResults.map((song) => (
                  <motion.button
                    key={song.number}
                    onClick={() => handleTJSelect(song)}
                    disabled={isLoading || selectedSong === song.number}
                    className="w-full p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#C0C0C0]/50 transition-all text-left flex items-center gap-4 disabled:opacity-50"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#C0C0C0]/20 to-white/5 flex items-center justify-center">
                      <span className="text-xs font-mono text-[#C0C0C0]">{song.number}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{song.title}</p>
                      <p className="text-sm text-gray-400 truncate">{song.artist}</p>
                    </div>
                    {selectedSong === song.number ? (
                      isLoading ? (
                        <Loader2 className="w-5 h-5 text-[#C0C0C0] animate-spin" />
                      ) : (
                        <Check className="w-5 h-5 text-green-400" />
                      )
                    ) : (
                      <Play className="w-5 h-5 text-gray-400" />
                    )}
                  </motion.button>
                ))
              ) : query ? (
                <p className="text-center text-gray-400 py-8">검색 결과가 없습니다</p>
              ) : (
                <div>
                  <p className="text-sm text-gray-400 mb-3">🔥 인기곡</p>
                  {popularSongs.map((song) => (
                    <motion.button
                      key={song.number}
                      onClick={() => handleTJSelect(song)}
                      disabled={isLoading || selectedSong === song.number}
                      className="w-full p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#C0C0C0]/50 transition-all text-left flex items-center gap-4 disabled:opacity-50 mb-2"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#C0C0C0]/20 to-white/5 flex items-center justify-center">
                        <span className="text-xs font-mono text-[#C0C0C0]">{song.number}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">{song.title}</p>
                        <p className="text-sm text-gray-400 truncate">{song.artist}</p>
                      </div>
                      {selectedSong === song.number ? (
                        isLoading ? (
                          <Loader2 className="w-5 h-5 text-[#C0C0C0] animate-spin" />
                        ) : (
                          <Check className="w-5 h-5 text-green-400" />
                        )
                      ) : (
                        <Play className="w-5 h-5 text-gray-400" />
                      )}
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="youtube"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {youtubeResults.length > 0 ? (
                youtubeResults.map((video) => (
                  <motion.button
                    key={video.videoId}
                    onClick={() => handleYouTubeSelect(video)}
                    disabled={isLoading || selectedSong === video.videoId}
                    className="w-full p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-red-500/50 transition-all text-left flex items-center gap-4 disabled:opacity-50 mb-2"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-20 h-12 rounded-lg object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{video.title}</p>
                      <p className="text-sm text-gray-400 truncate">{video.channel} • {video.duration}</p>
                    </div>
                    {selectedSong === video.videoId ? (
                      isLoading ? (
                        <Loader2 className="w-5 h-5 text-red-400 animate-spin" />
                      ) : (
                        <Check className="w-5 h-5 text-green-400" />
                      )
                    ) : (
                      <Play className="w-5 h-5 text-gray-400" />
                    )}
                  </motion.button>
                ))
              ) : (
                <p className="text-center text-gray-400 py-8">
                  {query ? "검색 결과가 없습니다" : "YouTube에서 노래방 MR을 검색하세요"}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
