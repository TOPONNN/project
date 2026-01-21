#!/bin/bash
# KERO AI Worker Setup Script
# AWS GPU Instance (g4dn.xlarge) - Ubuntu 20.04/22.04

set -e

echo "=========================================="
echo "KERO AI Worker Setup - Flask + Celery + AI"
echo "=========================================="

# 1. System Update
echo "[1/8] System Update..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.10 python3.10-venv python3-pip ffmpeg git redis-server

# 2. NVIDIA Driver & CUDA (if not using Deep Learning AMI)
echo "[2/8] Checking NVIDIA Driver..."
if ! command -v nvidia-smi &> /dev/null; then
    echo "Installing NVIDIA Driver..."
    sudo apt install -y nvidia-driver-535
    echo "Please reboot and run this script again!"
    exit 1
fi
nvidia-smi

# 3. Create Project Directory
echo "[3/8] Creating Project Directory..."
mkdir -p ~/kero-ai-worker
cd ~/kero-ai-worker

# 4. Python Virtual Environment
echo "[4/8] Setting up Python Environment..."
python3.10 -m venv venv
source venv/bin/activate

# 5. Install Dependencies
echo "[5/8] Installing Python Dependencies..."
pip install --upgrade pip
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
pip install flask celery[redis] gunicorn
pip install demucs openai-whisper crepe
pip install boto3 python-dotenv pydub

# 6. Create Flask App
echo "[6/8] Creating Flask Application..."
cat > app.py << 'EOF'
from flask import Flask, request, jsonify
from celery import Celery
import os

app = Flask(__name__)

# Celery Configuration
app.config['CELERY_BROKER_URL'] = os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0')
app.config['CELERY_RESULT_BACKEND'] = os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')

celery = Celery(app.name, broker=app.config['CELERY_BROKER_URL'])
celery.conf.update(app.config)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'gpu': True})

@app.route('/api/separate', methods=['POST'])
def separate_audio():
    """Demucs - Vocal/MR Separation"""
    from tasks import separate_task
    data = request.json
    task = separate_task.delay(data['audio_url'], data.get('callback_url'))
    return jsonify({'task_id': task.id, 'status': 'processing'})

@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    """Whisper - Speech to Text"""
    from tasks import transcribe_task
    data = request.json
    task = transcribe_task.delay(data['audio_url'], data.get('callback_url'))
    return jsonify({'task_id': task.id, 'status': 'processing'})

@app.route('/api/pitch', methods=['POST'])
def analyze_pitch():
    """CREPE - Pitch Detection"""
    from tasks import pitch_task
    data = request.json
    task = pitch_task.delay(data['audio_url'], data.get('callback_url'))
    return jsonify({'task_id': task.id, 'status': 'processing'})

@app.route('/api/process', methods=['POST'])
def process_all():
    """Full Pipeline - Separate + Transcribe + Pitch"""
    from tasks import full_process_task
    data = request.json
    task = full_process_task.delay(data['audio_url'], data.get('callback_url'))
    return jsonify({'task_id': task.id, 'status': 'processing'})

@app.route('/api/status/<task_id>', methods=['GET'])
def task_status(task_id):
    from celery.result import AsyncResult
    task = AsyncResult(task_id, app=celery)
    return jsonify({
        'task_id': task_id,
        'status': task.status,
        'result': task.result if task.ready() else None
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
EOF

# 7. Create Celery Tasks
echo "[7/8] Creating Celery Tasks..."
cat > tasks.py << 'EOF'
from celery import Celery
import os
import tempfile
import requests
import boto3
from urllib.parse import urlparse

celery = Celery('tasks', broker=os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0'))
celery.conf.result_backend = os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')

# AWS S3 Configuration
s3_client = boto3.client('s3',
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
    region_name=os.getenv('AWS_REGION', 'ap-northeast-2')
)
S3_BUCKET = os.getenv('S3_BUCKET', 'kero-audio')

def download_file(url, local_path):
    response = requests.get(url, stream=True)
    with open(local_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    return local_path

def upload_to_s3(local_path, s3_key):
    s3_client.upload_file(local_path, S3_BUCKET, s3_key)
    return f"https://{S3_BUCKET}.s3.amazonaws.com/{s3_key}"

def send_callback(callback_url, data):
    if callback_url:
        requests.post(callback_url, json=data)

@celery.task(bind=True)
def separate_task(self, audio_url, callback_url=None):
    """Demucs - Separate vocals from accompaniment"""
    import demucs.separate
    import subprocess
    
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, 'input.mp3')
        download_file(audio_url, input_path)
        
        output_dir = os.path.join(tmpdir, 'output')
        subprocess.run([
            'python', '-m', 'demucs.separate',
            '-n', 'htdemucs',
            '--two-stems', 'vocals',
            '-o', output_dir,
            input_path
        ], check=True)
        
        vocals_path = os.path.join(output_dir, 'htdemucs', 'input', 'vocals.wav')
        no_vocals_path = os.path.join(output_dir, 'htdemucs', 'input', 'no_vocals.wav')
        
        task_id = self.request.id
        vocals_url = upload_to_s3(vocals_path, f'separated/{task_id}/vocals.wav')
        mr_url = upload_to_s3(no_vocals_path, f'separated/{task_id}/mr.wav')
        
        result = {'vocals_url': vocals_url, 'mr_url': mr_url}
        send_callback(callback_url, {'task_id': task_id, 'type': 'separate', 'result': result})
        return result

@celery.task(bind=True)
def transcribe_task(self, audio_url, callback_url=None):
    """Whisper - Transcribe audio to text with timestamps"""
    import whisper
    
    model = whisper.load_model("medium")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, 'input.mp3')
        download_file(audio_url, input_path)
        
        result = model.transcribe(input_path, language='ko', word_timestamps=True)
        
        lyrics = []
        for segment in result['segments']:
            lyrics.append({
                'start': segment['start'],
                'end': segment['end'],
                'text': segment['text'].strip()
            })
        
        task_id = self.request.id
        output = {'lyrics': lyrics, 'full_text': result['text']}
        send_callback(callback_url, {'task_id': task_id, 'type': 'transcribe', 'result': output})
        return output

@celery.task(bind=True)
def pitch_task(self, audio_url, callback_url=None):
    """CREPE - Analyze pitch for scoring"""
    import crepe
    import numpy as np
    from scipy.io import wavfile
    from pydub import AudioSegment
    
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, 'input.mp3')
        wav_path = os.path.join(tmpdir, 'input.wav')
        download_file(audio_url, input_path)
        
        audio = AudioSegment.from_mp3(input_path)
        audio = audio.set_channels(1).set_frame_rate(16000)
        audio.export(wav_path, format='wav')
        
        sr, audio_data = wavfile.read(wav_path)
        time, frequency, confidence, _ = crepe.predict(audio_data, sr, viterbi=True)
        
        pitch_data = []
        for t, f, c in zip(time, frequency, confidence):
            if c > 0.5:
                pitch_data.append({'time': float(t), 'frequency': float(f), 'confidence': float(c)})
        
        task_id = self.request.id
        output = {'pitch_data': pitch_data, 'sample_rate': sr}
        send_callback(callback_url, {'task_id': task_id, 'type': 'pitch', 'result': output})
        return output

@celery.task(bind=True)
def full_process_task(self, audio_url, callback_url=None):
    """Full Pipeline - Run all AI tasks"""
    separate_result = separate_task.apply(args=[audio_url]).get()
    transcribe_result = transcribe_task.apply(args=[separate_result['vocals_url']]).get()
    pitch_result = pitch_task.apply(args=[separate_result['vocals_url']]).get()
    
    result = {
        'separate': separate_result,
        'transcribe': transcribe_result,
        'pitch': pitch_result
    }
    
    task_id = self.request.id
    send_callback(callback_url, {'task_id': task_id, 'type': 'full_process', 'result': result})
    return result
EOF

# 8. Create Environment File
echo "[8/8] Creating Environment Configuration..."
cat > .env.example << 'EOF'
# Redis
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# AWS S3
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-northeast-2
S3_BUCKET=kero-audio

# Flask
FLASK_ENV=production
EOF

# Create systemd services
echo "Creating systemd services..."
sudo tee /etc/systemd/system/kero-flask.service > /dev/null << EOF
[Unit]
Description=KERO Flask API
After=network.target

[Service]
User=$USER
WorkingDirectory=$HOME/kero-ai-worker
Environment="PATH=$HOME/kero-ai-worker/venv/bin"
EnvironmentFile=$HOME/kero-ai-worker/.env
ExecStart=$HOME/kero-ai-worker/venv/bin/gunicorn -w 2 -b 0.0.0.0:5000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/kero-celery.service > /dev/null << EOF
[Unit]
Description=KERO Celery Worker
After=network.target redis.service

[Service]
User=$USER
WorkingDirectory=$HOME/kero-ai-worker
Environment="PATH=$HOME/kero-ai-worker/venv/bin"
EnvironmentFile=$HOME/kero-ai-worker/.env
ExecStart=$HOME/kero-ai-worker/venv/bin/celery -A tasks worker --loglevel=info --concurrency=2
Restart=always

[Install]
WantedBy=multi-user.target
EOF

echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Copy .env.example to .env and fill in your AWS credentials"
echo "   cp .env.example .env && nano .env"
echo ""
echo "2. Start Redis:"
echo "   sudo systemctl enable redis-server && sudo systemctl start redis-server"
echo ""
echo "3. Start Services:"
echo "   sudo systemctl daemon-reload"
echo "   sudo systemctl enable kero-flask kero-celery"
echo "   sudo systemctl start kero-flask kero-celery"
echo ""
echo "4. Test API:"
echo "   curl http://localhost:5000/health"
echo ""
echo "API Endpoints:"
echo "  POST /api/separate   - Demucs vocal separation"
echo "  POST /api/transcribe - Whisper transcription"
echo "  POST /api/pitch      - CREPE pitch analysis"
echo "  POST /api/process    - Full pipeline"
echo "  GET  /api/status/<id> - Check task status"
