"""
FFmpeg processing utilities
"""
import subprocess
import os
import json
import tempfile
from typing import List, Dict, Optional

def get_video_info(video_path: str) -> Dict:
    """Get video metadata using ffprobe"""
    cmd = [
        'ffprobe',
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)

def extract_audio(video_path: str, output_path: str) -> bool:
    """Extract audio from video as WAV"""
    cmd = [
        'ffmpeg', '-i', video_path,
        '-vn',  # No video
        '-acodec', 'pcm_s16le',
        '-ar', '16000',  # Sample rate for whisper
        '-ac', '1',  # Mono
        output_path,
        '-y'
    ]
    result = subprocess.run(cmd, capture_output=True)
    return result.returncode == 0

def generate_thumbnail(video_path: str, output_path: str, time: float = 1.0) -> bool:
    """Generate thumbnail from video"""
    cmd = [
        'ffmpeg', '-i', video_path,
        '-ss', str(time),
        '-vframes', '1',
        '-vf', 'scale=320:-1',
        output_path,
        '-y'
    ]
    result = subprocess.run(cmd, capture_output=True)
    return result.returncode == 0

def detect_scenes(video_path: str, threshold: float = 0.3) -> List[float]:
    """Detect scene changes in video"""
    cmd = [
        'ffmpeg', '-i', video_path,
        '-vf', f'select=\'gt(scene,{threshold})\',showinfo',
        '-f', 'null', '-'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    # Parse scene timestamps from stderr
    scenes = [0.0]  # Always start at 0
    for line in result.stderr.split('\n'):
        if 'pts_time:' in line:
            try:
                pts_time = float(line.split('pts_time:')[1].split()[0])
                scenes.append(pts_time)
            except:
                pass
    
    return scenes

def extract_clip(
    video_path: str,
    output_path: str,
    start_time: float,
    end_time: float
) -> bool:
    """Extract a clip from video"""
    duration = end_time - start_time
    cmd = [
        'ffmpeg', '-i', video_path,
        '-ss', str(start_time),
        '-t', str(duration),
        '-c', 'copy',
        output_path,
        '-y'
    ]
    result = subprocess.run(cmd, capture_output=True)
    return result.returncode == 0

def concatenate_clips(
    clip_paths: List[str],
    output_path: str,
    transition_duration: float = 0.5
) -> bool:
    """Concatenate multiple clips with crossfade transitions"""
    if len(clip_paths) == 1:
        # Just copy the single clip
        subprocess.run(['cp', clip_paths[0], output_path])
        return True
    
    # Create concat file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        for clip in clip_paths:
            f.write(f"file '{clip}'\n")
        concat_file = f.name
    
    try:
        # Build filter complex for crossfade
        filter_parts = []
        n = len(clip_paths)
        
        # Simple concat without transitions for now
        cmd = [
            'ffmpeg', '-f', 'concat', '-safe', '0',
            '-i', concat_file,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
            '-c:a', 'aac', '-b:a', '128k',
            output_path,
            '-y'
        ]
        
        result = subprocess.run(cmd, capture_output=True)
        return result.returncode == 0
    finally:
        os.remove(concat_file)

def extract_audio_segment(
    video_path: str,
    output_path: str,
    start_time: float,
    end_time: float
) -> bool:
    """Extract audio segment from video"""
    duration = end_time - start_time
    cmd = [
        'ffmpeg', '-i', video_path,
        '-ss', str(start_time),
        '-t', str(duration),
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        output_path,
        '-y'
    ]
    result = subprocess.run(cmd, capture_output=True)
    return result.returncode == 0
