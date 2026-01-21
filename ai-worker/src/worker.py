import os
import json
import redis
from typing import Dict, Any
from src.config import REDIS_HOST, REDIS_PORT, QUEUE_NAMES, TEMP_DIR
from src.services.rabbitmq_service import rabbitmq_service
from src.services.s3_service import s3_service
from src.processors.demucs_processor import demucs_processor
from src.processors.whisper_processor import whisper_processor
from src.processors.crepe_processor import crepe_processor


class AIWorker:
    def __init__(self):
        self.redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)

    def process_audio(self, message: Dict[str, Any]):
        song_id = message["song_id"]
        audio_s3_key = message["audio_s3_key"]
        tasks = message.get("tasks", ["separate", "lyrics", "pitch"])

        print(f"Processing song {song_id}: {tasks}")

        self._update_status(song_id, "processing", "Downloading audio...")

        local_audio_path = s3_service.download_file(audio_s3_key)

        results = {"song_id": song_id}

        try:
            if "separate" in tasks:
                self._update_status(song_id, "processing", "Separating vocals and instrumental...")
                separation_result = demucs_processor.separate(local_audio_path, song_id)
                results["separation"] = separation_result

                vocals_path = os.path.join(TEMP_DIR, song_id, "vocals.wav")
                if os.path.exists(vocals_path):
                    local_audio_path = vocals_path

            if "lyrics" in tasks:
                self._update_status(song_id, "processing", "Extracting lyrics...")
                vocals_path = results.get("separation", {}).get("vocals_url")
                audio_for_lyrics = local_audio_path

                if vocals_path and "vocals.wav" in vocals_path:
                    temp_vocals = os.path.join(TEMP_DIR, f"{song_id}_vocals.wav")
                    s3_service.download_file(f"songs/{song_id}/vocals.wav", temp_vocals)
                    audio_for_lyrics = temp_vocals

                lyrics_result = whisper_processor.extract_lyrics(
                    audio_for_lyrics,
                    song_id,
                    language=message.get("language", "ko"),
                )
                results["lyrics"] = lyrics_result

            if "pitch" in tasks:
                self._update_status(song_id, "processing", "Analyzing pitch...")
                vocals_path = results.get("separation", {}).get("vocals_url")
                audio_for_pitch = local_audio_path

                if vocals_path and "vocals.wav" in vocals_path:
                    temp_vocals = os.path.join(TEMP_DIR, f"{song_id}_vocals.wav")
                    if not os.path.exists(temp_vocals):
                        s3_service.download_file(f"songs/{song_id}/vocals.wav", temp_vocals)
                    audio_for_pitch = temp_vocals

                pitch_result = crepe_processor.analyze_pitch(audio_for_pitch, song_id)
                results["pitch"] = pitch_result

            self._update_status(song_id, "completed", "Processing complete", results)
            print(f"Song {song_id} processing complete")

        except Exception as e:
            error_msg = str(e)
            print(f"Error processing song {song_id}: {error_msg}")
            self._update_status(song_id, "failed", error_msg)

        finally:
            self._cleanup_temp_files(song_id)

    def _update_status(self, song_id: str, status: str, message: str, results: Dict = None):
        status_data = {
            "song_id": song_id,
            "status": status,
            "message": message,
        }
        if results:
            status_data["results"] = results

        self.redis_client.set(f"song:processing:{song_id}", json.dumps(status_data), ex=3600)
        self.redis_client.publish("kero:song:status", json.dumps(status_data))

    def _cleanup_temp_files(self, song_id: str):
        temp_dir = os.path.join(TEMP_DIR, song_id)
        if os.path.exists(temp_dir):
            for file in os.listdir(temp_dir):
                os.remove(os.path.join(temp_dir, file))
            os.rmdir(temp_dir)

        for pattern in [f"{song_id}_*", f"*{song_id}*"]:
            for file in os.listdir(TEMP_DIR):
                if song_id in file:
                    try:
                        os.remove(os.path.join(TEMP_DIR, file))
                    except Exception:
                        pass

    def start(self):
        print("AI Worker started. Waiting for messages...")
        rabbitmq_service.consume(QUEUE_NAMES["audio_process"], self.process_audio)


def main():
    worker = AIWorker()
    worker.start()


if __name__ == "__main__":
    main()
