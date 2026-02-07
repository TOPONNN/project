"""
Korean Grapheme-to-Phoneme converter for SOFA forced aligner.

Pure Python implementation using Unicode math for Hangul decomposition.
Includes approximate English-to-Korean phoneme mapping for mixed-language
lyrics (pop songs often contain "oh", "baby", "yeah", etc.).
"""

from __future__ import annotations


class KoreanG2P:
    """Korean Grapheme-to-Phoneme converter for SOFA forced aligner.

    Converts Korean text (Hangul) to a phoneme sequence suitable for
    SOFA's forced alignment pipeline. Uses Unicode block arithmetic
    to decompose Hangul syllables into onset/nucleus/coda components.

    Non-Hangul characters (English letters, digits) are mapped to their
    closest Korean phoneme equivalents so every word produces at least
    one phoneme for alignment.  Without this, English-only words like
    "oh" or "baby" would get zero phonemes and create timing drift.

    No pronunciation rules are applied (no 연음, 경음화, etc.) —
    this is a direct grapheme-level decomposition.
    """

    # 19 onset (초성) consonants
    ONSET_PHONEMES: list[str] = [
        'g', 'gg', 'n', 'd', 'dd', 'r', 'm', 'b', 'bb',
        's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
    ]

    # 21 nucleus (중성) vowels
    NUCLEUS_PHONEMES: list[str] = [
        'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye',
        'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we',
        'wi', 'yu', 'eu', 'ui', 'i',
    ]

    # 28 coda (종성) consonants — index 0 means no coda
    # Codas use representative (대표음) uppercase phonemes
    CODA_PHONEMES: list[str] = [
        '',   # 0: no coda
        'K',  # 1: ㄱ
        'K',  # 2: ㄲ
        'K',  # 3: ㄳ
        'N',  # 4: ㄴ
        'N',  # 5: ㄵ
        'N',  # 6: ㄶ
        'T',  # 7: ㄷ
        'L',  # 8: ㄹ
        'L',  # 9: ㄺ
        'L',  # 10: ㄻ
        'L',  # 11: ㄼ
        'L',  # 12: ㄽ
        'L',  # 13: ㄾ
        'L',  # 14: ㄿ
        'L',  # 15: ㅀ
        'M',  # 16: ㅁ
        'P',  # 17: ㅂ
        'P',  # 18: ㅄ
        'T',  # 19: ㅅ
        'T',  # 20: ㅆ
        'NG', # 21: ㅇ
        'T',  # 22: ㅈ
        'T',  # 23: ㅊ
        'K',  # 24: ㅋ
        'T',  # 25: ㅌ
        'P',  # 26: ㅍ
        'T',  # 27: ㅎ
    ]

    # ----------------------------------------------------------------
    # English → Korean phoneme approximation table
    # Maps each Latin letter to the closest phoneme(s) in the Korean
    # SOFA vocabulary.  The goal is NOT perfect pronunciation but rather
    # providing *some* phonemes so the aligner can assign acoustic
    # frames to English words instead of skipping them entirely.
    # ----------------------------------------------------------------
    _ENGLISH_PHONEME_MAP: dict[str, list[str]] = {
        # Consonants — mapped to closest Korean onset/coda
        'b': ['b'],
        'c': ['k'],       # hard c → ㅋ
        'd': ['d'],
        'f': ['p'],       # no f in Korean; closest labial = ㅍ
        'g': ['g'],
        'h': ['h'],
        'j': ['j'],
        'k': ['k'],
        'l': ['L'],       # coda ㄹ
        'm': ['m'],
        'n': ['n'],
        'p': ['p'],
        'q': ['k'],       # q → k
        'r': ['r'],
        's': ['s'],
        't': ['t'],
        'v': ['b'],       # no v in Korean; closest = ㅂ
        'w': ['u'],       # semivowel w → 우
        'x': ['k', 's'],  # x ≈ ks
        'z': ['j'],       # z → ㅈ
        # Vowels — mapped to closest Korean nucleus
        'a': ['a'],
        'e': ['e'],
        'i': ['i'],
        'o': ['o'],
        'u': ['u'],
        'y': ['i'],       # y as vowel → 이
    }

    # Common English words in Korean pop lyrics → pre-defined phoneme
    # sequences for better alignment quality.  These are rough Korean
    # transliterations, not linguistic transcriptions.
    _ENGLISH_WORD_MAP: dict[str, list[str]] = {
        # Exclamations / fillers
        'oh':    ['o'],
        'ah':    ['a'],
        'uh':    ['eo'],
        'eh':    ['e'],
        'ooh':   ['u'],
        'woo':   ['u'],
        'whoa':  ['wa'],
        'wow':   ['wa', 'u'],
        'hey':   ['h', 'e', 'i'],
        'yay':   ['ya', 'i'],
        'yo':    ['yo'],
        'na':    ['n', 'a'],
        'la':    ['r', 'a'],
        'da':    ['d', 'a'],
        # Common pop words
        'yeah':  ['ya'],
        'yeh':   ['ye'],
        'baby':  ['b', 'e', 'i', 'b', 'i'],
        'babe':  ['b', 'e', 'i', 'b'],
        'love':  ['r', 'eo', 'b'],
        'girl':  ['g', 'eo', 'L'],
        'boy':   ['b', 'o', 'i'],
        'my':    ['m', 'a', 'i'],
        'me':    ['m', 'i'],
        'you':   ['yu'],
        'we':    ['wi'],
        'no':    ['n', 'o'],
        'go':    ['g', 'o'],
        'so':    ['s', 'o'],
        'do':    ['d', 'u'],
        'know':  ['n', 'o'],
        'say':   ['s', 'e', 'i'],
        'stay':  ['s', 'eu', 't', 'e', 'i'],
        'day':   ['d', 'e', 'i'],
        'way':   ['u', 'e', 'i'],
        'come':  ['k', 'eo', 'M'],
        'one':   ['u', 'a', 'N'],
        'time':  ['t', 'a', 'i', 'M'],
        'night': ['n', 'a', 'i', 'T'],
        'light': ['r', 'a', 'i', 'T'],
        'right': ['r', 'a', 'i', 'T'],
        'life':  ['r', 'a', 'i', 'P'],
        'heart': ['h', 'a', 'T'],
        'stop':  ['s', 'eu', 't', 'a', 'P'],
        'feel':  ['p', 'i', 'L'],
        'real':  ['r', 'i', 'eo', 'L'],
        'fly':   ['p', 'eu', 'r', 'a', 'i'],
        'cry':   ['k', 'eu', 'r', 'a', 'i'],
        'try':   ['t', 'eu', 'r', 'a', 'i'],
        'why':   ['u', 'a', 'i'],
        'high':  ['h', 'a', 'i'],
        'fire':  ['p', 'a', 'i', 'eo'],
        'more':  ['m', 'o', 'eo'],
        'like':  ['r', 'a', 'i', 'K'],
        'take':  ['t', 'e', 'i', 'K'],
        'make':  ['m', 'e', 'i', 'K'],
        'break': ['b', 'eu', 'r', 'e', 'i', 'K'],
        'dance': ['d', 'ae', 'N', 's', 'eu'],
        'chance':['ch', 'ae', 'N', 's', 'eu'],
        'forever': ['p', 'o', 'r', 'e', 'b', 'eo'],
        'never': ['n', 'e', 'b', 'eo'],
        'ever':  ['e', 'b', 'eo'],
        'over':  ['o', 'b', 'eo'],
        'under': ['eo', 'N', 'd', 'eo'],
        'away':  ['eo', 'u', 'e', 'i'],
        'tonight': ['t', 'u', 'n', 'a', 'i', 'T'],
        'alright': ['o', 'L', 'r', 'a', 'i', 'T'],
        'hello': ['h', 'e', 'L', 'r', 'o'],
        'world': ['u', 'eo', 'L', 'd', 'eu'],
        'only':  ['o', 'N', 'r', 'i'],
        'just':  ['j', 'eo', 's', 'eu', 'T'],
        'wanna': ['u', 'a', 'n', 'a'],
        'gonna': ['g', 'o', 'n', 'a'],
        'gotta': ['g', 'a', 't', 'a'],
        'lala':  ['r', 'a', 'r', 'a'],
        'lalala':['r', 'a', 'r', 'a', 'r', 'a'],
        'nanana':['n', 'a', 'n', 'a', 'n', 'a'],
    }

    def __init__(self, **kwargs: object) -> None:
        pass

    def _english_char_to_phonemes(self, char: str) -> list[str]:
        """Map a single English letter to approximate Korean phoneme(s).

        Args:
            char: A single ASCII letter (already lowercased by caller).

        Returns:
            List of Korean phonemes.  Empty list for unmappable chars.
        """
        return list(self._ENGLISH_PHONEME_MAP.get(char.lower(), []))

    def _english_word_to_phonemes(self, word: str) -> list[str]:
        """Convert an English word to approximate Korean phonemes.

        First checks the common-word lookup table, then falls back to
        per-character mapping.

        Args:
            word: An English word (may contain mixed case).

        Returns:
            List of Korean phonemes.
        """
        lower = word.lower()

        # 1. Check exact match in common word table
        if lower in self._ENGLISH_WORD_MAP:
            return list(self._ENGLISH_WORD_MAP[lower])

        # 2. Per-character fallback
        phonemes: list[str] = []
        for ch in lower:
            mapped = self._ENGLISH_PHONEME_MAP.get(ch)
            if mapped:
                phonemes.extend(mapped)
        return phonemes

    def _g2p(self, input_text: str) -> tuple[list[str], list[str], list[int]]:
        """Convert Korean text to SOFA phoneme sequence.

        Handles mixed Korean/English text.  Hangul syllables are decomposed
        into Korean phonemes; English letters are mapped to approximate
        Korean phoneme equivalents.  This ensures every word gets at least
        one phoneme for alignment.

        Args:
            input_text: Text (e.g., "oh 사랑해 baby")

        Returns:
            Tuple of:
                ph_seq: list[str] — phoneme sequence starting and ending with 'SP'
                word_seq: list[str] — list of words from input
                ph_idx_to_word_idx: list[int] — maps each phoneme to word index
                    (-1 for SP boundaries)
        """
        # Split by whitespace and filter empties
        words = [w for w in input_text.split() if w]

        if not words:
            return (['SP'], [], [-1])

        ph_seq: list[str] = ['SP']
        ph_idx_to_word_idx: list[int] = [-1]
        word_seq: list[str] = []

        for word_idx, word in enumerate(words):
            word_seq.append(word)

            # Separate the word into runs of Hangul vs non-Hangul
            hangul_phonemes: list[str] = []
            non_hangul_chars: list[str] = []

            for char in word:
                if self._is_hangul(char):
                    # Flush any pending non-Hangul characters first
                    if non_hangul_chars:
                        eng_phs = self._english_word_to_phonemes(
                            ''.join(non_hangul_chars)
                        )
                        if eng_phs:
                            ph_seq.extend(eng_phs)
                            ph_idx_to_word_idx.extend(
                                [word_idx] * len(eng_phs)
                            )
                        non_hangul_chars = []

                    phonemes = self._syllable_to_phonemes(char)
                    ph_seq.extend(phonemes)
                    ph_idx_to_word_idx.extend([word_idx] * len(phonemes))
                elif char.isalpha() or char.isdigit():
                    non_hangul_chars.append(char)
                # Pure punctuation is still skipped

            # Flush remaining non-Hangul chars at end of word
            if non_hangul_chars:
                eng_phs = self._english_word_to_phonemes(
                    ''.join(non_hangul_chars)
                )
                if eng_phs:
                    ph_seq.extend(eng_phs)
                    ph_idx_to_word_idx.extend([word_idx] * len(eng_phs))

            # If the word produced zero phonemes (e.g., pure punctuation),
            # add a minimal vowel phoneme so the aligner can still place it
            word_phoneme_count = sum(
                1 for idx in ph_idx_to_word_idx if idx == word_idx
            )
            if word_phoneme_count == 0:
                ph_seq.append('eo')  # schwa-like fallback
                ph_idx_to_word_idx.append(word_idx)

            # Add SP separator after each word
            ph_seq.append('SP')
            ph_idx_to_word_idx.append(-1)

        # Ensure exactly one trailing SP (don't double up)
        while len(ph_seq) >= 2 and ph_seq[-1] == 'SP' and ph_seq[-2] == 'SP':
            _ = ph_seq.pop()
            _ = ph_idx_to_word_idx.pop()

        # Ensure the sequence ends with SP
        if ph_seq[-1] != 'SP':
            ph_seq.append('SP')
            ph_idx_to_word_idx.append(-1)

        # Clean up: ensure no more than 2 consecutive SP anywhere
        cleaned_ph: list[str] = []
        cleaned_idx: list[int] = []
        consecutive_sp = 0

        for ph, idx in zip(ph_seq, ph_idx_to_word_idx):
            if ph == 'SP':
                consecutive_sp += 1
                if consecutive_sp <= 2:
                    cleaned_ph.append(ph)
                    cleaned_idx.append(idx)
            else:
                consecutive_sp = 0
                cleaned_ph.append(ph)
                cleaned_idx.append(idx)

        return (cleaned_ph, word_seq, cleaned_idx)

    @staticmethod
    def _is_hangul(char: str) -> bool:
        """Check if a character is a Hangul syllable (가-힣)."""
        code = ord(char)
        return 0xAC00 <= code <= 0xD7A3

    @staticmethod
    def _decompose(char: str) -> tuple[int, int, int] | None:
        """Decompose a Hangul syllable into (onset_idx, nucleus_idx, coda_idx).

        Uses Unicode arithmetic:
            syllable_code = (onset * 21 + nucleus) * 28 + coda + 0xAC00

        Args:
            char: A single Hangul syllable character.

        Returns:
            Tuple of (onset_idx, nucleus_idx, coda_idx) or None if not Hangul.
        """
        code = ord(char) - 0xAC00
        if code < 0 or code > 11171:
            return None
        onset = code // (21 * 28)
        nucleus = (code % (21 * 28)) // 28
        coda = code % 28
        return (onset, nucleus, coda)

    def _syllable_to_phonemes(self, char: str) -> list[str]:
        """Convert a single Hangul syllable to a list of phonemes.

        Args:
            char: A single Hangul syllable character.

        Returns:
            List of phoneme strings for this syllable.
        """
        result = self._decompose(char)
        if result is None:
            return []

        onset_idx, nucleus_idx, coda_idx = result
        phonemes: list[str] = []

        # Onset — skip silent ㅇ (index 11, which maps to empty string)
        onset = self.ONSET_PHONEMES[onset_idx]
        if onset:
            phonemes.append(onset)

        # Nucleus — always present
        phonemes.append(self.NUCLEUS_PHONEMES[nucleus_idx])

        # Coda — skip if index 0 (no coda)
        if coda_idx > 0:
            coda = self.CODA_PHONEMES[coda_idx]
            if coda:
                phonemes.append(coda)

        return phonemes
