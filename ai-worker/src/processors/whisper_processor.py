import os
import json
import whisper
from typing import List, Dict
from src.config import TEMP_DIR
from src.services.s3_service import s3_service


class WhisperProcessor:
    def __init__(self):
        self.model = None

    def _load_model(self):
        if self.model is None:
            self.model = whisper.load_model("medium")

    def extract_lyrics(self, audio_path: str, song_id: str, language: str = "ko") -> Dict:
        self._load_model()

        result = self.model.transcribe(
            audio_path,
            language=language,
            word_timestamps=True,
            verbose=False,
        )

        lyrics_lines = self._process_segments(result["segments"])

        output_dir = os.path.join(TEMP_DIR, song_id)
        os.makedirs(output_dir, exist_ok=True)

        lyrics_path = os.path.join(output_dir, "lyrics.json")
        with open(lyrics_path, "w", encoding="utf-8") as f:
            json.dump(lyrics_lines, f, ensure_ascii=False, indent=2)

        s3_key = f"songs/{song_id}/lyrics.json"
        lyrics_url = s3_service.upload_file(lyrics_path, s3_key)

        os.remove(lyrics_path)
        os.rmdir(output_dir)

        return {
            "lyrics_url": lyrics_url,
            "lyrics": lyrics_lines,
            "full_text": result["text"],
            "language": result.get("language", language),
        }

    def _process_segments(self, segments: List[Dict]) -> List[Dict]:
        lyrics_lines = []

        for segment in segments:
            line = {
                "start_time": round(segment["start"], 3),
                "end_time": round(segment["end"], 3),
                "text": segment["text"].strip(),
                "words": [],
            }

            if "words" in segment:
                for word in segment["words"]:
                    line["words"].append({
                        "start_time": round(word["start"], 3),
                        "end_time": round(word["end"], 3),
                        "text": word["word"].strip(),
                    })

            lyrics_lines.append(line)

        return lyrics_lines


whisper_processor = WhisperProcessor()
