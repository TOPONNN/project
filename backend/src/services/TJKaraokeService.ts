import axios from "axios";

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

export class TJKaraokeService {
  private readonly baseUrl = "https://api.manana.kr/karaoke";

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

  async searchPopular(type: ChartPeriod = "monthly", country: Country = "ALL", limit: number = 100): Promise<TJSong[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/popular/tj/${type}.json`);
      const songs = this.parseResponse(response.data);
      const filtered = this.filterByCountry(songs, country);
      return filtered.slice(0, limit);
    } catch (error) {
      console.error("TJ popular search error:", error);
      return [];
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

  async getChartByCountry(country: Country, period: ChartPeriod = "monthly"): Promise<TJSong[]> {
    return this.searchPopular(period, country);
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
