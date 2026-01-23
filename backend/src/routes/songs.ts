import { Router, Request, Response } from "express";
import multer from "multer";
import { songService } from "../services/SongService";
import { youtubeService } from "../services/YouTubeService";
import { ProcessingStatus } from "../entities";
import { redis } from "../config/redis";
import { v4 as uuidv4 } from "uuid";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/search/youtube", async (req: Request, res: Response) => {
  try {
    const query = req.query.query as string;
    if (!query) {
      return res.status(400).json({ success: false, message: "검색어가 필요합니다." });
    }

    const results = await youtubeService.searchVideos(query, 10);
    res.json({ success: true, data: results });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/search/tj", async (req: Request, res: Response) => {
  try {
    const query = req.query.query as string;
    if (!query) {
      return res.status(400).json({ success: false, message: "검색어가 필요합니다." });
    }

    const results = await youtubeService.searchVideos(`${query} official audio`, 10);
    res.json({ success: true, data: results });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/upload", upload.single("audio"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "파일이 없습니다." });
    }

    const { title, artist, uploadedBy } = req.body;
    const song = await songService.uploadSong(
      req.file.buffer,
      req.file.originalname,
      title,
      artist,
      uploadedBy
    );

    res.status(201).json({ success: true, data: song });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/youtube", async (req: Request, res: Response) => {
  try {
    const { videoId, title, artist } = req.body;
    if (!videoId) {
      return res.status(400).json({ success: false, message: "videoId가 필요합니다." });
    }

    const songId = uuidv4();
    const song = await songService.createFromYouTube(songId, videoId, title, artist);
    res.status(201).json({ success: true, data: song });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/:id/processing-callback", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { vocalsUrl, instrumentalUrl, lyrics, duration, status } = req.body;

    const mappedLyrics = lyrics?.map((line: any) => ({
      startTime: line.start_time ?? line.startTime,
      endTime: line.end_time ?? line.endTime,
      text: line.text,
    }));

    await songService.updateProcessingResult(id, {
      vocalsUrl,
      instrumentalUrl,
      lyrics: mappedLyrics,
      duration,
      status: status as ProcessingStatus,
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const songs = await songService.getAllSongs();
    res.json({ success: true, data: songs });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const song = await songService.getSongById(id);
    if (!song) {
      return res.status(404).json({ success: false, message: "곡을 찾을 수 없습니다." });
    }

    const needsRedisFallback = !song.lyrics || song.lyrics.length === 0 || !song.instrumentalUrl;
    if (needsRedisFallback) {
      const redisData = await redis.get(`song:processing:${id}`);
      if (redisData) {
        const parsed = JSON.parse(redisData);
        if (parsed.status === "completed" && parsed.results) {
          const results = parsed.results;
          if (results.separation) {
            song.vocalsUrl = song.vocalsUrl || results.separation.vocals_url;
            song.instrumentalUrl = song.instrumentalUrl || results.separation.instrumental_url;
          }
          if (results.lyrics?.lyrics && (!song.lyrics || song.lyrics.length === 0)) {
            song.lyrics = results.lyrics.lyrics.map((l: any, idx: number) => ({
              id: `redis-${idx}`,
              songId: id,
              startTime: l.start_time,
              endTime: l.end_time,
              text: l.text,
              lineOrder: idx,
            }));
          }
          if (results.lyrics?.duration) {
            song.duration = song.duration || results.lyrics.duration;
          }
        }
      }
    }

    res.json({ success: true, data: song });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/:id/quiz", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const data = await songService.getSongWithQuiz(id);
    if (!data) {
      return res.status(404).json({ success: false, message: "곡을 찾을 수 없습니다." });
    }
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/:id/status", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    
    const redisStatus = await redis.get(`song:processing:${id}`);
    if (redisStatus) {
      const statusData = JSON.parse(redisStatus);
      return res.json({ success: true, data: statusData });
    }

    const song = await songService.getSongById(id);
    if (!song) {
      return res.status(404).json({ success: false, message: "곡을 찾을 수 없습니다." });
    }

    res.json({
      success: true,
      data: {
        song_id: id,
        status: song.processingStatus,
        message: song.processingStatus === ProcessingStatus.COMPLETED ? "처리 완료" : "처리 중...",
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/:id/pitch", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    
    const pitchData = await redis.get(`song:pitch:${id}`);
    if (pitchData) {
      return res.json({ success: true, data: JSON.parse(pitchData) });
    }

    res.json({ success: true, data: [] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
