import axios from "axios";
import { redis } from "../config/redis";

interface TJSong {
  number: string;
  title: string;
  artist: string;
  composer?: string;
  lyricist?: string;
  release?: string;
  country?: string;
}

interface SearchResult {
  songs: TJSong[];
  total: number;
  page: number;
  hasMore: boolean;
}

type Country = "KOR" | "JPN" | "ENG" | "ALL";
type ChartPeriod = "daily" | "weekly" | "monthly";

const KOREAN_PATTERN = /[가-힣]/;
const JAPANESE_KANA_PATTERN = /[\u3040-\u309F\u30A0-\u30FF]/;
const CJK_KANJI_PATTERN = /[\u4E00-\u9FFF]/;

const CACHE_TTL: Record<ChartPeriod, number> = {
  daily: 3600,      // 1 hour
  weekly: 21600,    // 6 hours
  monthly: 86400,   // 24 hours
};

export class TJKaraokeService {
  private readonly baseUrl = "https://api.manana.kr/karaoke";
  private readonly tjMediaApiUrl = "https://www.tjmedia.com/legacy/api/topAndHot100";

  // Map our Country type to TJ Media strType codes
  private readonly STRTYPE_MAP: Record<Country, string> = {
    ALL: "",    // 종합
    KOR: "1",   // 가요
    ENG: "2",   // POP
    JPN: "3",   // JPOP
  };

  private detectCountry(song: TJSong): Country {
    const text = `${song.title} ${song.artist}`;
    if (KOREAN_PATTERN.test(text)) return "KOR";
    if (JAPANESE_KANA_PATTERN.test(text)) return "JPN";
    if (CJK_KANJI_PATTERN.test(text)) return "JPN";
    return "ENG";
  }

  private filterByCountry(songs: TJSong[], country: Country): TJSong[] {
    if (country === "ALL") return songs;
    return songs.filter(song => this.detectCountry(song) === country);
  }

  private async getCachedOrFetch(cacheKey: string, ttlSeconds: number, fetchFn: () => Promise<TJSong[]>): Promise<TJSong[]> {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { }

    const result = await fetchFn();
    try {
      await redis.setex(cacheKey, ttlSeconds, JSON.stringify(result));
    } catch { }
    return result;
  }

  private async fetchTJChart(country: Country, period: ChartPeriod): Promise<TJSong[]> {
    try {
      const strType = this.STRTYPE_MAP[country];

      const response = await axios.post(
        this.tjMediaApiUrl,
        {
          chartType: "TOP",
          strType: strType,
          searchStartDate: "",
          searchEndDate: "",
        },
        {
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://www.tjmedia.com/chart/top100",
          },
        }
      );

      const data = response.data;
      if (data.resultCode !== "99" || !data.resultData?.items) {
        console.error("TJ Media API error:", data.resultCode, data.resultMsg);
        return [];
      }

      return data.resultData.items.map((item: any) => ({
        number: String(item.pro),
        title: String(item.indexTitle || ""),
        artist: String(item.indexSong || ""),
        composer: String(item.com || ""),
        lyricist: "",
      })).filter((song: TJSong) => song.number && song.title);
    } catch (error) {
      console.error("TJ Media chart fetch error:", error);
      return [];
    }
  }

  async getChartByCountry(country: Country, period: ChartPeriod = "monthly"): Promise<TJSong[]> {
    const cacheKey = `chart:${country}:${period}`;
    const ttl = CACHE_TTL[period];

    return this.getCachedOrFetch(cacheKey, ttl, async () => {
      return this.fetchTJChart(country, period);
    });
  }

  async searchPopular(type: ChartPeriod = "monthly", country: Country = "ALL", limit: number = 100): Promise<TJSong[]> {
    const songs = await this.getChartByCountry(country, type);
    return songs.slice(0, limit);
  }

  async searchByTitle(title: string, page: number = 1): Promise<SearchResult> {
    try {
      const searchTerm = title.trim();
      const response = await axios.get(`${this.baseUrl}/song/${encodeURIComponent(searchTerm)}/tj.json`);
      const songs = this.parseResponse(response.data);

      const pageSize = 20;
      const start = (page - 1) * pageSize;
      const paginatedSongs = songs.slice(start, start + pageSize);

      return {
        songs: paginatedSongs,
        total: songs.length,
        page,
        hasMore: start + pageSize < songs.length,
      };
    } catch (error) {
      console.error("TJ title search error:", error);
      return { songs: [], total: 0, page, hasMore: false };
    }
  }

  async searchByArtist(artist: string, page: number = 1): Promise<SearchResult> {
    try {
      const searchTerm = artist.trim();
      const response = await axios.get(`${this.baseUrl}/singer/${encodeURIComponent(searchTerm)}/tj.json`);
      const songs = this.parseResponse(response.data);

      const pageSize = 20;
      const start = (page - 1) * pageSize;
      const paginatedSongs = songs.slice(start, start + pageSize);

      return {
        songs: paginatedSongs,
        total: songs.length,
        page,
        hasMore: start + pageSize < songs.length,
      };
    } catch (error) {
      console.error("TJ artist search error:", error);
      return { songs: [], total: 0, page, hasMore: false };
    }
  }

  async searchByNumber(number: string): Promise<TJSong | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/no/${number}/tj.json`);
      const songs = this.parseResponse(response.data);
      return songs.length > 0 ? songs[0] : null;
    } catch (error) {
      console.error("TJ number search error:", error);
      return null;
    }
  }

  async getNewReleases(country: Country = "ALL", limit: number = 100): Promise<TJSong[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/tj.json`);
      const songs = this.parseResponse(response.data);
      const filtered = this.filterByCountry(songs, country);
      return filtered.slice(0, limit);
    } catch (error) {
      console.error("TJ new releases error:", error);
      return [];
    }
  }

  private parseResponse(data: unknown): TJSong[] {
    if (!Array.isArray(data)) return [];

    return data.map((item: Record<string, unknown>) => ({
      number: String(item.no || ""),
      title: String(item.title || ""),
      artist: Array.isArray(item.singer) ? item.singer.join(", ") : String(item.singer || ""),
      composer: Array.isArray(item.composer) ? item.composer.join(", ") : String(item.composer || ""),
      lyricist: Array.isArray(item.lyricist) ? item.lyricist.join(", ") : String(item.lyricist || ""),
    })).filter(song => song.number && song.title);
  }
}

export const tjKaraokeService = new TJKaraokeService();
