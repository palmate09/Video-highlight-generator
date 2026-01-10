"""
Flask server for FFmpeg processing API
"""
import os
import json
import tempfile
from flask import Flask, request, jsonify, send_file
from process import (
    get_video_info,
    extract_audio,
    generate_thumbnail,
    detect_scenes,
    extract_clip,
    concatenate_clips,
    extract_audio_segment
)

app = Flask(__name__)

UPLOAD_DIR = '/app/uploads'
OUTPUT_DIR = '/app/output'
TEMP_DIR = '/app/temp'

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'ffmpeg'})

@app.route('/info', methods=['POST'])
def video_info():
    """Get video metadata"""
    data = request.json
    video_path = data.get('path')
    
    if not video_path or not os.path.exists(video_path):
        return jsonify({'error': 'Video not found'}), 404
    
    try:
        info = get_video_info(video_path)
        return jsonify({'success': True, 'info': info})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/thumbnail', methods=['POST'])
def thumbnail():
    """Generate video thumbnail"""
    data = request.json
    video_path = data.get('path')
    time = data.get('time', 1.0)
    
    if not video_path or not os.path.exists(video_path):
        return jsonify({'error': 'Video not found'}), 404
    
    try:
        output_path = os.path.join(
            OUTPUT_DIR,
            os.path.splitext(os.path.basename(video_path))[0] + '_thumb.jpg'
        )
        success = generate_thumbnail(video_path, output_path, time)
        
        if success:
            return jsonify({'success': True, 'path': output_path})
        else:
            return jsonify({'error': 'Thumbnail generation failed'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/scenes', methods=['POST'])
def scenes():
    """Detect scene changes"""
    data = request.json
    video_path = data.get('path')
    threshold = data.get('threshold', 0.3)
    
    if not video_path or not os.path.exists(video_path):
        return jsonify({'error': 'Video not found'}), 404
    
    try:
        scene_times = detect_scenes(video_path, threshold)
        return jsonify({'success': True, 'scenes': scene_times})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/extract-audio', methods=['POST'])
def extract_audio_route():
    """Extract audio from video"""
    data = request.json
    video_path = data.get('path')
    start_time = data.get('start', 0)
    end_time = data.get('end')
    
    if not video_path or not os.path.exists(video_path):
        return jsonify({'error': 'Video not found'}), 404
    
    try:
        output_path = os.path.join(
            TEMP_DIR,
            os.path.splitext(os.path.basename(video_path))[0] + '_audio.wav'
        )
        
        if end_time:
            success = extract_audio_segment(video_path, output_path, start_time, end_time)
        else:
            success = extract_audio(video_path, output_path)
        
        if success:
            return jsonify({'success': True, 'path': output_path})
        else:
            return jsonify({'error': 'Audio extraction failed'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/extract-clip', methods=['POST'])
def extract_clip_route():
    """Extract clip from video"""
    data = request.json
    video_path = data.get('path')
    start_time = data.get('start')
    end_time = data.get('end')
    output_name = data.get('output_name')
    
    if not all([video_path, start_time is not None, end_time]):
        return jsonify({'error': 'Missing required parameters'}), 400
    
    if not os.path.exists(video_path):
        return jsonify({'error': 'Video not found'}), 404
    
    try:
        if not output_name:
            output_name = f'clip_{start_time}_{end_time}.mp4'
        output_path = os.path.join(OUTPUT_DIR, output_name)
        
        success = extract_clip(video_path, output_path, start_time, end_time)
        
        if success:
            return jsonify({'success': True, 'path': output_path})
        else:
            return jsonify({'error': 'Clip extraction failed'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/concatenate', methods=['POST'])
def concatenate_route():
    """Concatenate multiple clips"""
    data = request.json
    clip_paths = data.get('clips', [])
    output_name = data.get('output_name', 'highlight.mp4')
    transition = data.get('transition', 0.5)
    
    if not clip_paths:
        return jsonify({'error': 'No clips provided'}), 400
    
    # Verify all clips exist
    for path in clip_paths:
        if not os.path.exists(path):
            return jsonify({'error': f'Clip not found: {path}'}), 404
    
    try:
        output_path = os.path.join(OUTPUT_DIR, output_name)
        success = concatenate_clips(clip_paths, output_path, transition)
        
        if success:
            return jsonify({'success': True, 'path': output_path})
        else:
            return jsonify({'error': 'Concatenation failed'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Ensure directories exist
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(TEMP_DIR, exist_ok=True)
    
    app.run(host='0.0.0.0', port=8081)
