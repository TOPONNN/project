import axios from "axios";

interface TJSong {
  number: string;
  title: string;
  artist: string;
  composer?: string;
  lyricist?: string;
}

interface SearchResult {
  songs: TJSong[];
  total: number;
  page: number;
  hasMore: boolean;
}

export class TJKaraokeService {
  private readonly baseUrl = "https://api.manana.kr/karaoke";

  async searchByTitle(title: string, page: number = 1): Promise<SearchResult> {
    try {
      const searchTerm = title.replace(/\s+/g, "");
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
      const searchTerm = artist.replace(/\s+/g, "");
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

  async searchPopular(type: "daily" | "weekly" | "monthly" = "monthly"): Promise<TJSong[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/popular/tj/${type}.json`);
      return this.parseResponse(response.data).slice(0, 50);
    } catch (error) {
      console.error("TJ popular search error:", error);
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
