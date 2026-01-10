"""
Simple Flask server for whisper.cpp transcription API
"""
import os
import subprocess
import tempfile
import json
from flask import Flask, request, jsonify

app = Flask(__name__)

WHISPER_BIN = os.environ.get('WHISPER_BIN', '/app/whisper.cpp/build/bin/main')
WHISPER_MODEL = os.environ.get('WHISPER_MODEL', 'base.en')
MODEL_PATH = f'/app/models/ggml-{WHISPER_MODEL}.bin'

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'model': WHISPER_MODEL})

@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Transcribe audio file
    Expects: multipart/form-data with 'audio' file
    Returns: JSON with transcription segments
    """
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
    
    audio_file = request.files['audio']
    
    # Save to temp file
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        tmp_path = tmp.name
        audio_file.save(tmp_path)
    
    try:
        # Convert to WAV if needed (whisper.cpp requires WAV)
        wav_path = tmp_path
        if not audio_file.filename.endswith('.wav'):
            wav_path = tmp_path + '.wav'
            subprocess.run([
                'ffmpeg', '-i', tmp_path, '-ar', '16000', '-ac', '1',
                '-c:a', 'pcm_s16le', wav_path, '-y'
            ], check=True, capture_output=True)
        
        # Run whisper.cpp
        result = subprocess.run([
            WHISPER_BIN,
            '-m', MODEL_PATH,
            '-f', wav_path,
            '-oj',  # Output JSON
            '-of', tmp_path  # Output file prefix
        ], capture_output=True, text=True)
        
        # Read JSON output
        json_output_path = f'{tmp_path}.json'
        if os.path.exists(json_output_path):
            with open(json_output_path, 'r') as f:
                transcript_data = json.load(f)
            os.remove(json_output_path)
        else:
            # Parse text output if JSON not available
            transcript_data = {
                'transcription': [{
                    'timestamps': {'from': '00:00:00', 'to': '00:00:00'},
                    'text': result.stdout.strip()
                }]
            }
        
        # Clean up
        os.remove(tmp_path)
        if wav_path != tmp_path and os.path.exists(wav_path):
            os.remove(wav_path)
        
        # Format response
        segments = []
        for item in transcript_data.get('transcription', []):
            timestamps = item.get('timestamps', {})
            segments.append({
                'start': parse_timestamp(timestamps.get('from', '00:00:00')),
                'end': parse_timestamp(timestamps.get('to', '00:00:00')),
                'text': item.get('text', '').strip()
            })
        
        return jsonify({
            'success': True,
            'segments': segments,
            'language': 'en'
        })
        
    except subprocess.CalledProcessError as e:
        return jsonify({
            'error': 'Transcription failed',
            'details': e.stderr
        }), 500
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

def parse_timestamp(ts):
    """Convert timestamp string to seconds"""
    try:
        parts = ts.replace(',', '.').split(':')
        if len(parts) == 3:
            h, m, s = parts
            return int(h) * 3600 + int(m) * 60 + float(s)
        elif len(parts) == 2:
            m, s = parts
            return int(m) * 60 + float(s)
        else:
            return float(parts[0])
    except:
        return 0.0

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
