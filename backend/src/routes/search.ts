import { Router, Request, Response } from "express";
import { tjKaraokeService } from "../services/TJKaraokeService";
import { youtubeService } from "../services/YouTubeService";
import { songService } from "../services/SongService";
import { v4 as uuidv4 } from "uuid";

const router = Router();

router.get("/tj", async (req: Request, res: Response) => {
  try {
    const { q, type = "title", page = "1" } = req.query;

    if (!q || typeof q !== "string") {
      return res.status(400).json({ success: false, message: "검색어를 입력해주세요." });
    }

    let result;
    switch (type) {
      case "artist":
        result = await tjKaraokeService.searchByArtist(q, parseInt(page as string));
        break;
      case "number":
        const song = await tjKaraokeService.searchByNumber(q);
        result = { songs: song ? [song] : [], total: song ? 1 : 0, page: 1, hasMore: false };
        break;
      default:
        result = await tjKaraokeService.searchByTitle(q, parseInt(page as string));
    }

    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "검색 중 오류가 발생했습니다.";
    res.status(500).json({ success: false, message });
  }
});

router.get("/tj/popular", async (req: Request, res: Response) => {
  try {
    const { period = "monthly", country = "ALL" } = req.query;
    const songs = await tjKaraokeService.searchPopular(
      period as "daily" | "weekly" | "monthly",
      country as "KOR" | "JPN" | "ENG" | "CHN" | "ALL"
    );
    res.json({ success: true, data: { songs, total: songs.length } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "인기곡 조회 중 오류가 발생했습니다.";
    res.status(500).json({ success: false, message });
  }
});

router.get("/tj/new", async (req: Request, res: Response) => {
  try {
    const { country = "ALL" } = req.query;
    const songs = await tjKaraokeService.getNewReleases(
      country as "KOR" | "JPN" | "ENG" | "CHN" | "ALL"
    );
    res.json({ success: true, data: { songs, total: songs.length } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "신곡 조회 중 오류가 발생했습니다.";
    res.status(500).json({ success: false, message });
  }
});

router.get("/tj/chart/:country", async (req: Request, res: Response) => {
  try {
    const country = req.params.country as string;
    const { period = "monthly" } = req.query;
    const songs = await tjKaraokeService.getChartByCountry(
      country.toUpperCase() as "KOR" | "JPN" | "ENG" | "CHN" | "ALL",
      period as "daily" | "weekly" | "monthly"
    );
    res.json({ success: true, data: { songs, total: songs.length, country, period } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "차트 조회 중 오류가 발생했습니다.";
    res.status(500).json({ success: false, message });
  }
});

router.get("/youtube", async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== "string") {
      return res.status(400).json({ success: false, message: "검색어를 입력해주세요." });
    }

    const results = await youtubeService.searchVideos(q, 10);
    res.json({ success: true, data: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "YouTube 검색 중 오류가 발생했습니다.";
    res.status(500).json({ success: false, message });
  }
});

router.post("/youtube/select", async (req: Request, res: Response) => {
  try {
    const { videoId, title, artist } = req.body;

    if (!videoId) {
      return res.status(400).json({ success: false, message: "videoId가 필요합니다." });
    }

    const songId = uuidv4();

    let songTitle = title;
    let songArtist = artist;

    if (!songTitle || !songArtist) {
      const info = await youtubeService.getVideoInfo(videoId);
      if (info) {
        songTitle = songTitle || info.title;
        songArtist = songArtist || info.artist;
      }
    }

    const song = await songService.createFromYouTube(songId, videoId, songTitle, songArtist);

    res.status(201).json({ success: true, data: song });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "노래 선택 중 오류가 발생했습니다.";
    res.status(500).json({ success: false, message });
  }
});

router.get("/combined", async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== "string") {
      return res.status(400).json({ success: false, message: "검색어를 입력해주세요." });
    }

    const [tjResult, youtubeResult] = await Promise.all([
      tjKaraokeService.searchByTitle(q, 1),
      youtubeService.searchVideos(`${q} official audio`, 5),
    ]);

    res.json({
      success: true,
      data: {
        tj: tjResult.songs.slice(0, 10),
        youtube: youtubeResult,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "검색 중 오류가 발생했습니다.";
    res.status(500).json({ success: false, message });
  }
});

export default router;
