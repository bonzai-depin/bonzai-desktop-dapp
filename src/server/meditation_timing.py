"""Measured narration with breath pauses. Never discard or time-compress speech."""
import math


def narration_timeline(lengths, texts, sample_rate, target_seconds=None):
    if not lengths or len(lengths) != len(texts) or any(n <= 0 for n in lengths):
        raise ValueError("No complete narration was generated")
    target = None if target_seconds is None else float(target_seconds)
    if target is not None and (not math.isfinite(target) or not 30 <= target <= 900):
        raise ValueError("Meditation duration must be between 30 and 900 seconds")
    spoken = sum(lengths)
    if target is None:
        before = [0] * len(lengths)
        tail = 0
    else:
        lead, tail = round(sample_rate * .4), round(sample_rate * 1.2)
        # Preserve every spoken sample, even if the model narrated longer than requested.
        total = max(round(target * sample_rate), spoken + lead + tail)
        remaining = total - spoken - lead - tail
        gaps = max(0, len(lengths) - 1)
        if remaining > 12 * sample_rate * max(1, gaps):
            raise ValueError("The narration is too short for this session. Write a longer script before recording again.")
        before = [lead]
        if gaps:
            quotient, remainder = divmod(remaining, gaps)
            before.extend(quotient + (1 if i < remainder else 0) for i in range(gaps))
        else:
            tail += remaining
    cursor, segments = 0, []
    for gap, length, text in zip(before, lengths, texts):
        cursor += gap
        segments.append({"text": text, "start": cursor / sample_rate, "end": (cursor + length) / sample_rate})
        cursor += length
    return {"before_samples": before, "tail_samples": tail, "caption_segments": segments,
            "duration_seconds": (cursor + tail) / sample_rate, "narration_seconds": spoken / sample_rate,
            "requested_duration_seconds": target}
