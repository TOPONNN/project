import os
import json
import numpy as np
import crepe
import librosa
from typing import Dict, List
from src.config import TEMP_DIR
from src.services.s3_service import s3_service


class CrepeProcessor:
    def __init__(self):
        self.model_capacity = "medium"

    def analyze_pitch(self, audio_path: str, song_id: str) -> Dict:
        audio, sr = librosa.load(audio_path, sr=16000, mono=True)

        time, frequency, confidence, activation = crepe.predict(
            audio,
            sr,
            model_capacity=self.model_capacity,
            viterbi=True,
            step_size=10,
        )

        pitch_data = self._process_pitch_data(time, frequency, confidence)

        output_dir = os.path.join(TEMP_DIR, song_id)
        os.makedirs(output_dir, exist_ok=True)

        pitch_path = os.path.join(output_dir, "pitch.json")
        with open(pitch_path, "w", encoding="utf-8") as f:
            json.dump(pitch_data, f, indent=2)

        s3_key = f"songs/{song_id}/pitch.json"
        pitch_url = s3_service.upload_file(pitch_path, s3_key)

        os.remove(pitch_path)
        os.rmdir(output_dir)

        return {
            "pitch_url": pitch_url,
            "pitch_data": pitch_data,
            "stats": self._calculate_stats(frequency, confidence),
        }

    def _process_pitch_data(
        self, time: np.ndarray, frequency: np.ndarray, confidence: np.ndarray
    ) -> List[Dict]:
        pitch_points = []

        for i in range(len(time)):
            if confidence[i] > 0.5:
                pitch_points.append({
                    "time": round(float(time[i]), 3),
                    "frequency": round(float(frequency[i]), 2),
                    "confidence": round(float(confidence[i]), 3),
                    "note": self._frequency_to_note(frequency[i]),
                    "midi": self._frequency_to_midi(frequency[i]),
                })

        return pitch_points

    def _frequency_to_midi(self, frequency: float) -> int:
        if frequency <= 0:
            return 0
        return int(round(69 + 12 * np.log2(frequency / 440.0)))

    def _frequency_to_note(self, frequency: float) -> str:
        if frequency <= 0:
            return ""
        notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        midi = self._frequency_to_midi(frequency)
        note_index = midi % 12
        octave = (midi // 12) - 1
        return f"{notes[note_index]}{octave}"

    def _calculate_stats(self, frequency: np.ndarray, confidence: np.ndarray) -> Dict:
        valid_mask = confidence > 0.5
        valid_frequencies = frequency[valid_mask]

        if len(valid_frequencies) == 0:
            return {"min_freq": 0, "max_freq": 0, "avg_freq": 0, "range_semitones": 0}

        min_freq = float(np.min(valid_frequencies))
        max_freq = float(np.max(valid_frequencies))
        avg_freq = float(np.mean(valid_frequencies))

        range_semitones = 12 * np.log2(max_freq / min_freq) if min_freq > 0 else 0

        return {
            "min_freq": round(min_freq, 2),
            "max_freq": round(max_freq, 2),
            "avg_freq": round(avg_freq, 2),
            "range_semitones": round(float(range_semitones), 1),
            "min_note": self._frequency_to_note(min_freq),
            "max_note": self._frequency_to_note(max_freq),
        }


crepe_processor = CrepeProcessor()
