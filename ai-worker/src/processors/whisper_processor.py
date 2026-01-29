import os
import json
import re
import gc
import torch
import numpy as np
import librosa
import torchcrepe

_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

_original_hub_load = torch.hub.load
def _patched_hub_load(*args, **kwargs):
    kwargs.setdefault('trust_repo', True)
    return _original_hub_load(*args, **kwargs)
torch.hub.load = _patched_hub_load

try:
    import omegaconf
    from omegaconf import DictConfig, ListConfig, OmegaConf
    from omegaconf.base import ContainerMetadata, Metadata
    torch.serialization.add_safe_globals([DictConfig, ListConfig, OmegaConf, ContainerMetadata, Metadata])
except (ImportError, AttributeError):
    pass

import whisperx
from typing import List, Dict, Callable, Optional
from src.config import TEMP_DIR
from src.services.s3_service import s3_service
from src.processors.mfa_processor import mfa_processor


class WhisperProcessor:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.compute_type = "float16" if self.device == "cuda" else "int8"
        self.whisperx_model = None
        self.align_model = None
        self.align_metadata = None
        self.align_language = None
        self.diarize_model = None

    def _load_whisperx_model(self):
        if self.whisperx_model is None:
            print("[WhisperX] Loading large-v3 model...")
            self.whisperx_model = whisperx.load_model(
                "large-v3",
                self.device,
                compute_type=self.compute_type,
                language=None,
                asr_options={
                    "beam_size": 5,
                    "best_of": 5,
                    "temperatures": [0.0],
                    "condition_on_previous_text": False,
                    "initial_prompt": None,
                    "suppress_numerals": False,
                }
            )
            print("[WhisperX] Model loaded successfully")

    def _detect_music_start(self, audio: np.ndarray, sr: int = 16000) -> float:
        frame_length = int(0.5 * sr)
        hop_length = int(0.1 * sr)
        
        energy = []
        for i in range(0, len(audio) - frame_length, hop_length):
            frame = audio[i:i + frame_length]
            energy.append(np.sqrt(np.mean(frame ** 2)))
        
        if not energy:
            return 0.0
        
        energy = np.array(energy)
        threshold = np.percentile(energy, 30)
        
        for i, e in enumerate(energy):
            if e > threshold * 2:
                start_time = max(0, (i * hop_length / sr) - 0.5)
                print(f"[WhisperX] Detected music start at {start_time:.2f}s")
                return start_time
        
        return 0.0

    def _filter_speech_segments(self, segments: List[Dict], audio: np.ndarray, sr: int = 16000) -> List[Dict]:
        if not segments:
            return segments
        
        filtered = []
        min_segment_duration = 0.5
        
        for seg in segments:
            duration = seg.get("end", 0) - seg.get("start", 0)
            if duration < min_segment_duration:
                continue
            
            text = seg.get("text", "").strip()
            if len(text) < 3:
                continue
            
            words = seg.get("words", [])
            if words:
                valid_words = [w for w in words if w.get("end", 0) - w.get("start", 0) < 10]
                if len(valid_words) < len(words) * 0.5:
                    print(f"[WhisperX] Filtered segment with bad word timings: {text[:50]}")
                    continue
                seg["words"] = valid_words
            
            filtered.append(seg)
        
        return filtered

    def _detect_korean_metadata(self, title: Optional[str], artist: Optional[str]) -> bool:
        """Check if title or artist contains Korean characters"""
        korean_pattern = re.compile(r'[\uac00-\ud7af]')
        
        if title and korean_pattern.search(title):
            return True
        if artist and korean_pattern.search(artist):
            return True
        return False

    def _fetch_lyrics_from_api(self, title: Optional[str], artist: Optional[str]) -> Optional[str]:
        if not title:
            return None

        try:
            from src.config import LYRICS_API_URL
            import requests

            params = {"title": title}
            if artist:
                params["artist"] = artist

            url = f"{LYRICS_API_URL}/v2/youtube/lyrics"
            print(f"[Lyrics API] Fetching: {url} params={params}")

            response = requests.get(url, params=params, timeout=15)

            if response.status_code == 200:
                data = response.json()
                lyrics_text = data.get("data", {}).get("lyrics")
                # "respone" is the API's actual typo for 404 responses
                if lyrics_text and not data.get("data", {}).get("respone"):
                    lyrics_text = lyrics_text.replace("\r\n", "\n").replace("\r", "\n")
                    print(f"[Lyrics API] Got lyrics: {len(lyrics_text)} chars, track={data['data'].get('trackName')}")
                    return lyrics_text
                else:
                    print(f"[Lyrics API] No lyrics found for: {title} - {artist}")
                    return None
            else:
                print(f"[Lyrics API] HTTP {response.status_code}")
                return None

        except Exception as e:
            print(f"[Lyrics API] Failed: {e}")
            return None

    def extract_lyrics(self, audio_path: str, song_id: str, language: Optional[str] = None, 
                       folder_name: Optional[str] = None, 
                       title: Optional[str] = None,
                       artist: Optional[str] = None,
                       progress_callback: Optional[Callable[[int], None]] = None) -> Dict:
        if folder_name is None:
            folder_name = song_id

        if progress_callback:
            progress_callback(5)

        # Auto-detect Korean from metadata (title/artist)
        if language is None and self._detect_korean_metadata(title, artist):
            print(f"[WhisperX] Korean detected in metadata (title='{title}', artist='{artist}'), forcing language to 'ko'")
            language = "ko"

        print("=" * 60)
        print("[Stage 1: WhisperX] Loading and transcribing...")
        print("=" * 60)
        
        self._load_whisperx_model()
        
        audio = whisperx.load_audio(audio_path)
        duration = len(audio) / 16000
        
        music_start = self._detect_music_start(audio)
        
        if progress_callback:
            progress_callback(10)

        result = self.whisperx_model.transcribe(
            audio,
            batch_size=16,
            language=language,
        )
        
        detected_language = result.get("language", language or "en")
        segments = result.get("segments", [])
        
        # Check if text contains significant Korean characters
        # If detected as English but contains Korean, force Korean language
        full_text_check = " ".join([seg.get("text", "") for seg in segments])
        korean_chars = len(re.findall(r'[\uac00-\ud7af]', full_text_check))
        total_chars = len(re.sub(r'\s', '', full_text_check))
        
        if total_chars > 0:
            korean_ratio = korean_chars / total_chars
            if detected_language == "en" and korean_ratio > 0.2:
                print(f"[WhisperX] Detected Korean text ({korean_ratio:.1%}), forcing language to 'ko'")
                detected_language = "ko"
            elif korean_ratio > 0.5:
                print(f"[WhisperX] High Korean ratio ({korean_ratio:.1%}), forcing language to 'ko'")
                detected_language = "ko"
        
        print(f"[WhisperX] Detected language: {detected_language}")
        print(f"[WhisperX] Transcribed {len(segments)} segments")
        
        if progress_callback:
            progress_callback(30)

        print("=" * 60)
        print("[Stage 2: WhisperX] Word-level alignment...")
        print("=" * 60)
        
        if segments:
            try:
                if self.align_model is None or self.align_language != detected_language:
                    print(f"[WhisperX] Loading alignment model for {detected_language}...")
                    self.align_model, self.align_metadata = whisperx.load_align_model(
                        language_code=detected_language,
                        device=self.device
                    )
                    self.align_language = detected_language
                
                result = whisperx.align(
                    segments,
                    self.align_model,
                    self.align_metadata,
                    audio,
                    self.device,
                    return_char_alignments=False
                )
                segments = result.get("segments", segments)
                
                total_words = sum(len(seg.get("words", [])) for seg in segments)
                print(f"[WhisperX] Aligned {total_words} words")
                
            except Exception as e:
                print(f"[WhisperX] Alignment failed: {e}")
        
        if progress_callback:
            progress_callback(50)

        segments = self._filter_speech_segments(segments, audio)
        
        lyrics_lines = self._process_segments(segments, music_start)
        lyrics_lines = self._postprocess_segments(lyrics_lines, detected_language)
        lyrics_lines = self._clean_lyrics(lyrics_lines, detected_language)
        
        print(f"[WhisperX] Processed {len(lyrics_lines)} lyrics lines")

        if progress_callback:
            progress_callback(70)

        api_lyrics_text = self._fetch_lyrics_from_api(title, artist)
        print(f"[Lyrics] Source: {'YouTube API' if api_lyrics_text else 'WhisperX transcription'}")

        print("=" * 60)
        print("[Stage 3: MFA] Phoneme-level refinement...")
        print("=" * 60)
        
        if api_lyrics_text:
            lyrics_lines = self._refine_with_mfa(audio_path, lyrics_lines, detected_language, override_text=api_lyrics_text)
        else:
            lyrics_lines = self._refine_with_mfa(audio_path, lyrics_lines, detected_language)
        
        print("=" * 60)
        print("[Stage 4: Energy] Analyzing vocal intensity...")
        print("=" * 60)
        
        # Stage 4: Energy analysis using vocals from demucs separation
        vocals_path = os.path.join(TEMP_DIR, song_id, "vocals.wav")
        if os.path.exists(vocals_path):
            lyrics_lines = self._add_energy_to_words(vocals_path, lyrics_lines)
        else:
            print(f"[Energy] Vocals file not found at {vocals_path}, skipping energy analysis")
            # Assign default energy values
            for segment in lyrics_lines:
                for word in segment.get("words", []):
                    word["energy"] = 0.5
        
        print("=" * 60)
        print("[Stage 5: Pitch] Analyzing vocal melody...")
        print("=" * 60)

        if os.path.exists(vocals_path):
            lyrics_lines = self._add_pitch_to_words(vocals_path, lyrics_lines)
        else:
            print(f"[Pitch] Vocals file not found at {vocals_path}, skipping pitch analysis")
            for segment in lyrics_lines:
                for word in segment.get("words", []):
                    word["pitch"] = 0
                    word["note"] = ""
                    word["midi"] = 0

        print("=" * 60)
        print("[Stage 6: VAD] Detecting voice activity...")
        print("=" * 60)

        if os.path.exists(vocals_path):
            lyrics_lines = self._add_vad_to_words(vocals_path, lyrics_lines)
        else:
            print(f"[VAD] Vocals file not found at {vocals_path}, skipping VAD")
            for segment in lyrics_lines:
                for word in segment.get("words", []):
                    word["voiced"] = 0.0

        if progress_callback:
            progress_callback(90)
        
        gc.collect()
        if self.device == "cuda":
            torch.cuda.empty_cache()

        output_dir = os.path.join(TEMP_DIR, song_id)
        os.makedirs(output_dir, exist_ok=True)

        lyrics_path = os.path.join(output_dir, "lyrics.json")
        with open(lyrics_path, "w", encoding="utf-8") as f:
            json.dump(lyrics_lines, f, ensure_ascii=False, indent=2)

        s3_key = f"songs/{folder_name}/lyrics.json"
        lyrics_url = s3_service.upload_file(lyrics_path, s3_key)

        os.remove(lyrics_path)
        try:
            os.rmdir(output_dir)
        except OSError:
            pass

        if progress_callback:
            progress_callback(100)

        full_text = " ".join([line["text"] for line in lyrics_lines])

        return {
            "lyrics_url": lyrics_url,
            "lyrics": lyrics_lines,
            "full_text": full_text,
            "language": detected_language,
            "duration": duration,
        }

    def _process_segments(self, segments: List[Dict], music_start: float = 0.0) -> List[Dict]:
        lyrics_lines = []
        
        for segment in segments:
            if segment.get("start", 0) < music_start:
                print(f"[WhisperX] Skipping pre-music segment: {segment.get('text', '')[:50]}")
                continue
            
            text = segment.get("text", "").strip()
            if not text:
                continue

            start_time = segment.get("start", 0)
            end_time = segment.get("end", 0)

            line = {
                "start_time": round(start_time, 3),
                "end_time": round(end_time, 3),
                "text": text,
                "words": [],
            }

            words = segment.get("words", [])
            for word in words:
                word_text = word.get("word", "").strip()
                word_start = word.get("start")
                word_end = word.get("end")
                
                if word_text and word_start is not None and word_end is not None:
                    word_duration = word_end - word_start
                    if word_duration > 5:
                        avg_char_duration = 0.1
                        word_end = word_start + len(word_text) * avg_char_duration
                    
                    line["words"].append({
                        "start_time": round(word_start, 3),
                        "end_time": round(word_end, 3),
                        "text": word_text,
                    })

            if line["words"]:
                line["start_time"] = line["words"][0]["start_time"]
                line["end_time"] = line["words"][-1]["end_time"]
            
            if line["words"] or line["text"]:
                lyrics_lines.append(line)

        return lyrics_lines

    def _postprocess_segments(self, segments: List[Dict], language: str = "en") -> List[Dict]:
        if not segments:
            return segments

        all_words = []
        for segment in segments:
            words = segment.get("words", [])
            if words:
                all_words.extend(words)
            elif segment.get("text"):
                all_words.append({
                    "start_time": segment["start_time"],
                    "end_time": segment["end_time"],
                    "text": segment["text"]
                })
        
        if not all_words:
            return segments

        should_filter_cjk = language == "en"
        if should_filter_cjk:
            filtered_words = []
            for word in all_words:
                word_text = word.get("text", "").strip()
                if not word_text:
                    continue
                is_cjk_only = bool(re.match(r'^[\u3000-\u9fff\uac00-\ud7af\u3040-\u30ff\u31f0-\u31ff]+[.!?,]*$', word_text))
                if is_cjk_only:
                    continue
                filtered_words.append(word)
            all_words = filtered_words
        
        if not all_words:
            return []
        
        all_words = sorted(all_words, key=lambda w: w.get("start_time", 0))
        
        MIN_WORDS = 3
        MAX_WORDS = 8
        TARGET_WORDS = 5
        
        lines = []
        current_words = []
        
        for i, word in enumerate(all_words):
            current_words.append(word)
            word_count = len(current_words)
            
            text = word.get("text", "")
            is_sentence_end = any(text.rstrip().endswith(p) for p in ['.', '?', '!', '。', '？', '！'])
            is_phrase_end = any(text.rstrip().endswith(p) for p in [',', '，', '~', '♪', ';', '；'])
            
            has_long_pause = False
            if i < len(all_words) - 1:
                gap = all_words[i + 1]["start_time"] - word["end_time"]
                has_long_pause = gap > 0.8
            
            should_split = (
                word_count >= MAX_WORDS or
                (word_count >= TARGET_WORDS and (is_sentence_end or has_long_pause)) or
                (word_count >= MIN_WORDS and is_sentence_end) or
                (has_long_pause and word_count >= 2)
            )
            
            if should_split and current_words:
                lines.append({
                    "start_time": round(current_words[0]["start_time"], 3),
                    "end_time": round(current_words[-1]["end_time"], 3),
                    "text": " ".join(w["text"] for w in current_words).strip(),
                    "words": current_words.copy()
                })
                current_words = []
        
        if current_words:
            lines.append({
                "start_time": round(current_words[0]["start_time"], 3),
                "end_time": round(current_words[-1]["end_time"], 3),
                "text": " ".join(w["text"] for w in current_words).strip(),
                "words": current_words
            })
        
        return lines

    def _clean_lyrics(self, segments: List[Dict], language: str = "en") -> List[Dict]:
        cleaned = []
        
        youtube_patterns = [
            r'자막|제공|배달의민족|한글자막|시청해주셔서|감사합니다',
            r'광고를.*포함|유료.*광고|PPL',
            r'字幕|提供|感谢观看|订阅|点赞',
            r'字幕|提供|ご視聴|チャンネル登録',
            r'subscribe|like.*comment|thanks.*watching',
            r'다음.*영상|next.*video',
            r'MV|뮤직비디오|music\s*video',
        ]
        youtube_regex = re.compile('|'.join(youtube_patterns), re.IGNORECASE)
        
        dialogue_patterns = [
            r'^(안녕|여보세요|네|아|어|음|응|헐|뭐|왜|어디|언제|누가)',
            r'^(hello|hey|hi|um|uh|yeah|okay|ok|what|why|where)\b',
            r'^\[.*\]$',
            r'^\(.*\)$',
        ]
        dialogue_regex = re.compile('|'.join(dialogue_patterns), re.IGNORECASE)
        
        for segment in segments:
            text = segment["text"]
            
            text = re.sub(r'\[.*?\]', '', text)
            text = re.sub(r'\(.*?\)', '', text)
            text = re.sub(r'(.)\1{4,}', r'\1\1\1', text)
            text = re.sub(r'\s+', ' ', text).strip()
            
            if not text or len(text) < 2:
                continue
            
            if re.match(r'^[♪~\s\.\,]+$', text):
                continue
            
            if youtube_regex.search(text):
                print(f"[Clean] Filtered YouTube pattern: {text[:50]}")
                continue
            
            if len(text) < 10 and dialogue_regex.match(text):
                print(f"[Clean] Filtered dialogue: {text}")
                continue
                
            segment["text"] = text
            
            if segment.get("words"):
                cleaned_words = []
                for word in segment["words"]:
                    word_text = word["text"].strip()
                    if word_text and len(word_text) >= 1:
                        word["text"] = word_text
                        cleaned_words.append(word)
                segment["words"] = cleaned_words
                
                if cleaned_words:
                    segment["text"] = " ".join(w["text"] for w in cleaned_words).strip()
            
            if segment.get("text") and len(segment["text"]) >= 2:
                cleaned.append(segment)
        
        return cleaned

    def _refine_with_mfa(self, audio_path: str, segments: List[Dict], language: str, override_text: Optional[str] = None) -> List[Dict]:
        if not mfa_processor.is_available():
            print("[MFA] Not available, using WhisperX timings")
            return segments
        
        if language not in mfa_processor.LANGUAGE_MODELS:
            print(f"[MFA] Language '{language}' not supported")
            return segments
        
        try:
            if override_text:
                full_text = override_text
            else:
                full_text = " ".join([seg["text"] for seg in segments])
            if not full_text.strip():
                return segments
            
            print(f"[MFA] Running alignment for {len(segments)} segments...")
            
            mfa_words = mfa_processor.align_lyrics(audio_path, full_text, language)
            
            if not mfa_words:
                print("[MFA] No words returned")
                return segments
            
            print(f"[MFA] Aligned {len(mfa_words)} words")
            
            refined = self._map_mfa_words_to_segments(segments, mfa_words)
            return refined
            
        except Exception as e:
            print(f"[MFA] Failed: {e}")
            return segments

    def _map_mfa_words_to_segments(self, segments: List[Dict], mfa_words: List[Dict]) -> List[Dict]:
        mfa_queue = []
        for w in mfa_words:
            mfa_queue.append({
                "normalized": w["text"].lower().strip(),
                "start_time": w["start_time"],
                "end_time": w["end_time"],
                "used": False
            })
        
        mfa_idx = 0
        refined = []
        
        for segment in segments:
            refined_seg = {
                "start_time": segment["start_time"],
                "end_time": segment["end_time"],
                "text": segment["text"],
                "words": []
            }
            
            for word in segment.get("words", []):
                word_text = word["text"].lower().strip()
                matched = False
                
                for i in range(mfa_idx, min(mfa_idx + 15, len(mfa_queue))):
                    if mfa_queue[i]["used"]:
                        continue
                    
                    mfa_norm = mfa_queue[i]["normalized"]
                    if mfa_norm == word_text or mfa_norm.startswith(word_text) or word_text.startswith(mfa_norm):
                        refined_seg["words"].append({
                            "start_time": mfa_queue[i]["start_time"],
                            "end_time": mfa_queue[i]["end_time"],
                            "text": word["text"]
                        })
                        mfa_queue[i]["used"] = True
                        mfa_idx = i + 1
                        matched = True
                        break
                
                if not matched:
                    refined_seg["words"].append(word)
            
            if refined_seg["words"]:
                refined_seg["start_time"] = refined_seg["words"][0]["start_time"]
                refined_seg["end_time"] = refined_seg["words"][-1]["end_time"]
            
            refined.append(refined_seg)
        
        used = sum(1 for w in mfa_queue if w["used"])
        print(f"[MFA] Mapped {used}/{len(mfa_queue)} words")
        
        return refined

    def _add_energy_to_words(self, vocals_path: str, segments: List[Dict]) -> List[Dict]:
        """Add RMS energy values (0.0-1.0) to each word based on vocal intensity"""
        try:
            print(f"[Energy] Loading vocals from {vocals_path}...")
            y, sr = librosa.load(vocals_path, sr=16000)
            
            # Calculate RMS energy with small hop length for precision
            rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
            times = librosa.times_like(rms, sr=sr, hop_length=512)
            
            # Get global min/max for normalization
            rms_min, rms_max = rms.min(), rms.max()
            rms_range = rms_max - rms_min + 1e-8
            
            total_words = 0
            energy_added = 0
            
            for segment in segments:
                words = segment.get("words", [])
                for word in words:
                    total_words += 1
                    start_time = word.get("start_time", 0)
                    end_time = word.get("end_time", 0)
                    
                    start_idx = np.searchsorted(times, start_time)
                    end_idx = np.searchsorted(times, end_time)
                    
                    if start_idx < end_idx and end_idx <= len(rms):
                        word_rms = rms[start_idx:end_idx].mean()
                        # Normalize to 0-1
                        energy = (word_rms - rms_min) / rms_range
                        word["energy"] = round(float(energy), 3)
                        energy_added += 1
                    else:
                        # Default for very short words or edge cases
                        word["energy"] = 0.5
            
            print(f"[Energy] Added energy values to {energy_added}/{total_words} words")
            return segments
            
        except Exception as e:
            print(f"[Energy] Failed to calculate energy: {e}")
            # Assign default energy values on failure
            for segment in segments:
                for word in segment.get("words", []):
                    word["energy"] = 0.5
            return segments

    def _add_pitch_to_words(self, vocals_path: str, segments: List[Dict]) -> List[Dict]:
        """Add pitch data (frequency, note, midi) to each word based on vocal analysis"""
        try:
            print(f"[Pitch] Loading vocals from {vocals_path}...")
            audio, sr = librosa.load(vocals_path, sr=16000, mono=True)
            
            # Process in chunks to avoid CUDA OOM (30 seconds each)
            chunk_duration = 30
            chunk_samples = chunk_duration * sr
            
            all_pitch = []
            all_periodicity = []
            
            for start in range(0, len(audio), chunk_samples):
                chunk = audio[start:start + chunk_samples]
                audio_tensor = torch.tensor(chunk).unsqueeze(0).to(self.device)
                
                pitch_chunk, periodicity_chunk = torchcrepe.predict(
                    audio_tensor,
                    sr,
                    hop_length=160,     # 10ms resolution
                    fmin=50,
                    fmax=2000,
                    model='full',
                    device=self.device,
                    return_periodicity=True,
                )
                
                all_pitch.append(pitch_chunk.squeeze().cpu().numpy())
                all_periodicity.append(periodicity_chunk.squeeze().cpu().numpy())
                
                del audio_tensor, pitch_chunk, periodicity_chunk
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            
            pitch = np.concatenate(all_pitch)
            periodicity = np.concatenate(all_periodicity)
            time = np.arange(len(pitch)) * 160 / sr  # 10ms per frame
            
            # Helper functions (same as crepe_processor.py)
            def freq_to_midi(freq):
                if freq <= 0 or np.isnan(freq):
                    return 0
                return int(round(69 + 12 * np.log2(freq / 440.0)))
            
            def freq_to_note(freq):
                if freq <= 0 or np.isnan(freq):
                    return ""
                notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
                midi = freq_to_midi(freq)
                return f"{notes[midi % 12]}{(midi // 12) - 1}"
            
            total_words = 0
            pitch_added = 0
            
            for segment in segments:
                for word in segment.get("words", []):
                    total_words += 1
                    start_time = word.get("start_time", 0)
                    end_time = word.get("end_time", 0)
                    
                    start_idx = np.searchsorted(time, start_time)
                    end_idx = np.searchsorted(time, end_time)
                    
                    if start_idx < end_idx and end_idx <= len(pitch):
                        # Only consider frames with good periodicity (voice detected)
                        mask = periodicity[start_idx:end_idx] > 0.5
                        valid_freqs = pitch[start_idx:end_idx][mask]
                        
                        if len(valid_freqs) > 0 and not np.all(np.isnan(valid_freqs)):
                            avg_freq = float(np.nanmean(valid_freqs))
                            word["pitch"] = round(avg_freq, 2)
                            word["note"] = freq_to_note(avg_freq)
                            word["midi"] = freq_to_midi(avg_freq)
                            pitch_added += 1
                            continue
                    
                    # Default values for words where pitch can't be determined
                    word["pitch"] = 0
                    word["note"] = ""
                    word["midi"] = 0
            
            print(f"[Pitch] Added pitch values to {pitch_added}/{total_words} words")
            return segments
            
        except Exception as e:
            print(f"[Pitch] Failed to calculate pitch: {e}")
            for segment in segments:
                for word in segment.get("words", []):
                    word["pitch"] = 0
                    word["note"] = ""
                    word["midi"] = 0
            return segments

    def _add_vad_to_words(self, vocals_path: str, segments: List[Dict]) -> List[Dict]:
        """Add voice activity detection confidence (0.0-1.0) to each word"""
        try:
            print(f"[VAD] Loading vocals from {vocals_path}...")
            y, sr = librosa.load(vocals_path, sr=16000)

            # Compute RMS energy with fine resolution
            rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
            times = librosa.times_like(rms, sr=sr, hop_length=512)

            # Compute spectral flatness (voice has lower flatness than noise)
            flatness = librosa.feature.spectral_flatness(y=y, n_fft=2048, hop_length=512)[0]

            # Dynamic threshold: percentile-based to adapt to different tracks
            rms_threshold = np.percentile(rms, 30)  # bottom 30% = silence

            # Normalize RMS to 0-1 range
            rms_min = rms.min()
            rms_max = rms.max()
            rms_range = rms_max - rms_min + 1e-8
            rms_normalized = (rms - rms_min) / rms_range

            total_words = 0
            vad_added = 0

            for segment in segments:
                for word in segment.get("words", []):
                    total_words += 1
                    start_time = word.get("start_time", 0)
                    end_time = word.get("end_time", 0)

                    start_idx = np.searchsorted(times, start_time)
                    end_idx = np.searchsorted(times, end_time)

                    if start_idx < end_idx and end_idx <= len(rms):
                        # Voice activity = high energy AND low spectral flatness
                        word_rms = rms_normalized[start_idx:end_idx]
                        word_flatness = flatness[start_idx:end_idx]

                        # Energy component: how loud relative to track
                        energy_score = float(np.mean(word_rms))

                        # Flatness component: voice has structure (low flatness)
                        # Invert: 1.0 = very structured (voice), 0.0 = noise-like
                        voice_score = float(1.0 - np.mean(word_flatness))

                        # Combined voiced confidence
                        voiced = round(energy_score * 0.6 + voice_score * 0.4, 3)
                        voiced = max(0.0, min(1.0, voiced))  # clamp

                        word["voiced"] = voiced
                        vad_added += 1
                    else:
                        word["voiced"] = 0.0

            print(f"[VAD] Added voice activity to {vad_added}/{total_words} words")
            return segments

        except Exception as e:
            print(f"[VAD] Failed: {e}")
            for segment in segments:
                for word in segment.get("words", []):
                    word["voiced"] = 0.0
            return segments


whisper_processor = WhisperProcessor()
