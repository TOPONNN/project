import os
import json
from faster_whisper import WhisperModel
from typing import List, Dict, Callable, Optional
from src.config import TEMP_DIR
from src.services.s3_service import s3_service


class WhisperProcessor:
    def __init__(self):
        self.model = None

    def _load_model(self):
        if self.model is None:
            self.model = WhisperModel("medium", device="cuda", compute_type="float16")

    def extract_lyrics(self, audio_path: str, song_id: str, language: str = "ko", folder_name: str = None, progress_callback: Optional[Callable[[int], None]] = None) -> Dict:
        if folder_name is None:
            folder_name = song_id
            
        self._load_model()

        segments, info = self.model.transcribe(
            audio_path,
            language=language,
            word_timestamps=True,
        )

        # segment 단위로 진행률 보고
        segments_list = []
        total_duration = info.duration if info.duration else 1
        
        for segment in segments:
            segments_list.append(segment)
            if progress_callback and info.duration:
                progress = int((segment.end / total_duration) * 100)
                progress_callback(min(progress, 100))
        
        lyrics_lines = self._process_segments(segments_list)

        output_dir = os.path.join(TEMP_DIR, song_id)
        os.makedirs(output_dir, exist_ok=True)

        lyrics_path = os.path.join(output_dir, "lyrics.json")
        with open(lyrics_path, "w", encoding="utf-8") as f:
            json.dump(lyrics_lines, f, ensure_ascii=False, indent=2)

        s3_key = f"songs/{folder_name}/lyrics.json"
        lyrics_url = s3_service.upload_file(lyrics_path, s3_key)

        os.remove(lyrics_path)
        os.rmdir(output_dir)

        full_text = " ".join([line["text"] for line in lyrics_lines])

        return {
            "lyrics_url": lyrics_url,
            "lyrics": lyrics_lines,
            "full_text": full_text,
            "language": info.language,
            "duration": info.duration,
        }

    def _process_segments(self, segments: List) -> List[Dict]:
        lyrics_lines = []

        for segment in segments:
            line = {
                "start_time": round(segment.start, 3),
                "end_time": round(segment.end, 3),
                "text": segment.text.strip(),
                "words": [],
            }

            if segment.words:
                for word in segment.words:
                    line["words"].append({
                        "start_time": round(word.start, 3),
                        "end_time": round(word.end, 3),
                        "text": word.word.strip(),
                    })

            lyrics_lines.append(line)

        return lyrics_lines


whisper_processor = WhisperProcessor()
