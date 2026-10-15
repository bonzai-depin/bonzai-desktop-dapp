"""Local hand-frame analysis and perspective compositing for BonzAI."""

from __future__ import annotations

import base64
import math
import os
import subprocess
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional, Sequence

import cv2
import numpy as np


Point = tuple[float, float]
Quad = list[Point]
Progress = Optional[Callable[[str, int, int], None]]
HAND_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)


def _distance(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _polygon_area(points: Sequence[Point]) -> float:
    return abs(
        sum(
            points[index][0] * points[(index + 1) % len(points)][1]
            - points[(index + 1) % len(points)][0] * points[index][1]
            for index in range(len(points))
        )
        / 2.0
    )


def order_quad(points: Sequence[Point]) -> Quad:
    """Return four corners as top-left, top-right, bottom-right, bottom-left."""
    if len(points) != 4:
        raise ValueError("A portal requires exactly four corners")
    array = np.asarray(points, dtype=np.float32)
    sums = array.sum(axis=1)
    differences = np.diff(array, axis=1).reshape(-1)
    ordered = np.asarray(
        [
            array[np.argmin(sums)],
            array[np.argmin(differences)],
            array[np.argmax(sums)],
            array[np.argmax(differences)],
        ]
    )
    if len({tuple(point) for point in ordered.tolist()}) != 4:
        raise ValueError("The detected hand-frame corners overlap")
    return [tuple(map(float, point)) for point in ordered]


@dataclass
class TrackingResult:
    quad: Optional[Quad]
    confidence: float


class FingerFrameTracker:
    """Turns two MediaPipe hand landmark sets into a stable TL/TR/BR/BL quad."""

    WRIST = 0
    THUMB_TIP = 4
    INDEX_TIP = 8
    MIDDLE_MCP = 9

    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self._quad: Optional[Quad] = None
        self._misses = 0
        self._confidence = 0.0

    def _point(self, hand, index: int) -> Point:
        landmark = hand[index]
        return landmark.x * self.width, landmark.y * self.height

    def detect(self, hands: Iterable[Sequence]) -> Optional[Quad]:
        hands = list(hands)
        if len(hands) != 2:
            return None

        candidates = []
        for hand in hands:
            wrist = self._point(hand, self.WRIST)
            middle = self._point(hand, self.MIDDLE_MCP)
            thumb = self._point(hand, self.THUMB_TIP)
            index = self._point(hand, self.INDEX_TIP)
            palm = max(_distance(wrist, middle), 1.0)
            if _distance(index, thumb) < palm * 0.45:
                return None
            candidates.append((wrist[0], index, thumb))

        candidates.sort(key=lambda candidate: candidate[0])
        _, left_index, left_thumb = candidates[0]
        _, right_index, right_thumb = candidates[1]
        try:
            quad = order_quad([left_index, right_index, right_thumb, left_thumb])
        except ValueError:
            return None
        if _polygon_area(quad) < self.width * self.height * 0.003:
            return None
        return quad

    def update(self, hands: Iterable[Sequence]) -> TrackingResult:
        detected = self.detect(hands)
        if detected is None:
            self._misses += 1
            self._confidence = max(0.0, self._confidence - 0.08)
            if self._misses > 12:
                self._quad = None
            return TrackingResult(self._quad, self._confidence)

        self._misses = 0
        if self._quad is None:
            self._quad = detected
        else:
            motion = sum(_distance(a, b) for a, b in zip(self._quad, detected)) / 4
            alpha = min(0.78, max(0.28, motion / max(self.width * 0.08, 1.0)))
            self._quad = [
                (old[0] + (new[0] - old[0]) * alpha, old[1] + (new[1] - old[1]) * alpha)
                for old, new in zip(self._quad, detected)
            ]
        self._confidence = min(1.0, self._confidence + 0.18)
        return TrackingResult(self._quad, self._confidence)


class HandDetector:
    def __init__(self, model_path: str):
        import mediapipe as mp
        from mediapipe.tasks import python as mp_tasks
        from mediapipe.tasks.python import vision

        self._mp = mp
        self._detector = vision.HandLandmarker.create_from_options(
            vision.HandLandmarkerOptions(
                base_options=mp_tasks.BaseOptions(model_asset_path=model_path),
                running_mode=vision.RunningMode.VIDEO,
                num_hands=2,
                min_hand_detection_confidence=0.45,
                min_hand_presence_confidence=0.45,
                min_tracking_confidence=0.45,
            )
        )

    def process(self, rgb: np.ndarray, timestamp_ms: int):
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        return self._detector.detect_for_video(image, timestamp_ms).hand_landmarks or []

    def close(self) -> None:
        self._detector.close()


def _hand_model_path() -> str:
    root = Path(os.environ.get("BONZAI_MODEL_DIR", Path.home() / "bonzai-models")) / "vision"
    root.mkdir(parents=True, exist_ok=True)
    path = root / "hand_landmarker.task"
    if not path.exists() or path.stat().st_size < 1_000_000:
        temporary = path.with_suffix(".download")
        try:
            urllib.request.urlretrieve(HAND_LANDMARKER_URL, temporary)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
    return str(path)


def _create_hand_detector():
    try:
        import mediapipe  # noqa: F401
    except ImportError as exc:
        raise RuntimeError("Finger Frame requires the mediapipe Python package") from exc
    return HandDetector(_hand_model_path())


def _extract_window(frame: np.ndarray, quad: Quad, width: int = 768, height: int = 432) -> np.ndarray:
    source = np.asarray(quad, dtype=np.float32)
    target = np.asarray(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(source, target)
    return cv2.warpPerspective(frame, matrix, (width, height), flags=cv2.INTER_CUBIC)


def analyze_video(source_path: str, progress: Progress = None) -> dict:
    capture = cv2.VideoCapture(source_path)
    if not capture.isOpened():
        raise ValueError("The source video could not be opened")
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = capture.get(cv2.CAP_PROP_FPS) or 24.0
    frame_count = max(1, int(capture.get(cv2.CAP_PROP_FRAME_COUNT)))
    tracker = FingerFrameTracker(width, height)
    detector = _create_hand_detector()
    tracked = 0
    strongest = None
    strongest_confidence = -1.0

    try:
        for index in range(frame_count):
            ok, frame = capture.read()
            if not ok:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            hands = detector.process(rgb, round(index * 1000 / fps))
            tracking = tracker.update(hands)
            if tracking.quad is not None and tracking.confidence > 0.15:
                tracked += 1
                if tracking.confidence > strongest_confidence:
                    strongest_confidence = tracking.confidence
                    strongest = _extract_window(frame, tracking.quad)
            if progress and (index % max(1, frame_count // 20) == 0):
                progress("tracking gesture", index + 1, frame_count)
    finally:
        detector.close()
        capture.release()

    coverage = tracked / frame_count
    if strongest is None or coverage < 0.05:
        raise ValueError(
            "No stable two-hand frame was found. Keep both hands visible and hold the frame gesture longer."
        )
    ok, encoded = cv2.imencode(".jpg", strongest, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        raise RuntimeError("Could not encode the detected finger-frame keyframe")
    return {
        "keyframe_base64": base64.b64encode(encoded).decode("ascii"),
        "coverage": round(coverage, 4),
        "duration": round(frame_count / fps, 3),
        "fps": round(fps, 3),
        "width": width,
        "height": height,
        "frame_count": frame_count,
    }


def _draw_frame(frame: np.ndarray, quad: Quad, confidence: float, timestamp: float) -> None:
    points = np.asarray(quad, dtype=np.int32)
    color = (240, 226, 194)
    for index in range(4):
        start = tuple(points[index])
        end = tuple(points[(index + 1) % 4])
        cv2.line(frame, start, end, color, 2, cv2.LINE_AA)
    pulse = int(6 + 2 * math.sin(timestamp * 4.0))
    for point in points:
        cv2.circle(frame, tuple(point), pulse + 5, (30, 24, 40), 2, cv2.LINE_AA)
        cv2.circle(frame, tuple(point), pulse, color, -1, cv2.LINE_AA)


def composite_video(
    source_path: str,
    generated_path: str,
    output_path: str,
    ffmpeg_path: str,
    progress: Progress = None,
) -> dict:
    source = cv2.VideoCapture(source_path)
    generated = cv2.VideoCapture(generated_path)
    if not source.isOpened() or not generated.isOpened():
        raise ValueError("The source or generated video could not be opened")

    width = int(source.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(source.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = source.get(cv2.CAP_PROP_FPS) or 24.0
    frame_count = max(1, int(source.get(cv2.CAP_PROP_FRAME_COUNT)))
    generated_count = max(1, int(generated.get(cv2.CAP_PROP_FRAME_COUNT)))
    generated_frames = []
    while True:
        ok, frame = generated.read()
        if not ok:
            break
        generated_frames.append(frame)
    if not generated_frames:
        raise ValueError("The generated video contains no readable frames")
    generated_count = len(generated_frames)

    detector = _create_hand_detector()
    tracker = FingerFrameTracker(width, height)
    silent_path = str(Path(output_path).with_suffix(".silent.mp4"))
    writer = cv2.VideoWriter(
        silent_path,
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )
    if not writer.isOpened():
        raise RuntimeError("Could not initialize the video encoder")

    visible = 0
    try:
        for index in range(frame_count):
            ok, frame = source.read()
            if not ok:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            hands = detector.process(rgb, round(index * 1000 / fps))
            tracking = tracker.update(hands)
            if tracking.quad is not None and tracking.confidence > 0.05:
                generated_index = min(
                    generated_count - 1,
                    round(index * (generated_count - 1) / max(frame_count - 1, 1)),
                )
                effect = generated_frames[generated_index]
                source_quad = np.asarray(
                    [[0, 0], [effect.shape[1] - 1, 0], [effect.shape[1] - 1, effect.shape[0] - 1], [0, effect.shape[0] - 1]],
                    dtype=np.float32,
                )
                target_quad = np.asarray(tracking.quad, dtype=np.float32)
                transform = cv2.getPerspectiveTransform(source_quad, target_quad)
                warped = cv2.warpPerspective(effect, transform, (width, height), flags=cv2.INTER_CUBIC)
                mask = cv2.warpPerspective(
                    np.full(effect.shape[:2], 255, dtype=np.uint8), transform, (width, height)
                )
                mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=1.4, sigmaY=1.4)
                alpha = (mask.astype(np.float32) / 255.0 * tracking.confidence)[..., None]
                frame = (frame * (1.0 - alpha) + warped * alpha).astype(np.uint8)
                _draw_frame(frame, tracking.quad, tracking.confidence, index / fps)
                visible += 1
            writer.write(frame)
            if progress and (index % max(1, frame_count // 20) == 0):
                progress("compositing", index + 1, frame_count)
    finally:
        writer.release()
        detector.close()
        source.release()
        generated.release()

    command = [
        ffmpeg_path, "-y", "-loglevel", "error", "-i", silent_path, "-i", source_path,
        "-map", "0:v:0", "-map", "1:a?", "-c:v", "libx264", "-crf", "18",
        "-preset", "medium", "-c:a", "aac", "-shortest", output_path,
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(exc.stderr.strip() or "FFmpeg failed to finalize the effect") from exc
    finally:
        Path(silent_path).unlink(missing_ok=True)

    return {
        "video_path": output_path,
        "tracked_frames": visible,
        "frame_count": frame_count,
        "coverage": round(visible / frame_count, 4),
    }


def materialize_uploaded_video(payload: str, suffix: str = ".mp4") -> str:
    raw = payload.split(",", 1)[-1]
    data = base64.b64decode(raw, validate=True)
    if len(data) > 250 * 1024 * 1024:
        raise ValueError("Video uploads are limited to 250 MB")
    handle = tempfile.NamedTemporaryFile(prefix="bonzai_finger_frame_", suffix=suffix, delete=False)
    handle.write(data)
    handle.close()
    return handle.name


def validate_video_path(path: str) -> str:
    resolved = os.path.realpath(os.path.expanduser(path))
    if not os.path.isfile(resolved):
        raise ValueError("Video file not found")
    if os.path.getsize(resolved) > 250 * 1024 * 1024:
        raise ValueError("Video uploads are limited to 250 MB")
    return resolved
