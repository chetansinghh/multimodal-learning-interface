import subprocess
import numpy as np
from scipy.io import wavfile

def align():
    # 1. Decode original MP3 to WAV
    raw_wav = '/tmp/ava_raw.wav'
    subprocess.run(['ffmpeg', '-y', '-i', 'public/videos/ayurveda_narration_only.mp3', raw_wav], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    sr, data = wavfile.read(raw_wav)
    if data.ndim > 1:
        data = data[:, 0]
        
    # Cuts in Ava audio (silent midpoints)
    cuts = [
        0.000,
        8.680,
        15.580,
        24.550,
        33.790,
        40.920,
        48.630,
        56.870,
        63.960,
        72.720,
        79.120,
        86.200,
        len(data) / sr
    ]
    
    # Target start times in original video (seconds)
    target_starts = [
        0.000,   # L1: Introduction
        10.120,  # L2: Nature and daily rhythms
        18.400,  # L3: Sages, body, mind, environment
        27.000,  # L4: Five elements diagram
        35.780,  # L5: Plants and herbs
        44.400,  # L6: Ingredient preparation (mortar & pestle)
        53.540,  # L7: Three doshas medallions
        62.700,  # L8: Daily routines (sunrise meditation)
        70.960,  # L9: Therapies and brass bowl
        82.980,  # L10: Ancient texts (teacher and student)
        91.680,  # L11: Continuing Ayurvedic journey
        101.380  # L12: Ayurveda today (river & modern world)
    ]
    
    # Total video duration in seconds
    total_video_dur = 117.85
    total_samples = int(total_video_dur * sr)
    master_buf = np.zeros(total_samples, dtype=np.float32)
    
    fade_len = int(0.015 * sr) # 15ms fade
    fade_in = np.sin(np.linspace(0, np.pi/2, fade_len))
    fade_out = np.cos(np.linspace(0, np.pi/2, fade_len))
    
    print("Aligning 12 sentences to exact video scene timestamps:")
    for i in range(12):
        s_cut = int(cuts[i] * sr)
        e_cut = int(cuts[i+1] * sr)
        clip = data[s_cut:e_cut].astype(np.float32)
        
        # Apply smooth fades at start/end
        if len(clip) > 2 * fade_len:
            clip[:fade_len] *= fade_in
            clip[-fade_len:] *= fade_out
            
        dest_start = int(target_starts[i] * sr)
        dest_end = min(dest_start + len(clip), total_samples)
        clip_to_copy = clip[:dest_end - dest_start]
        
        master_buf[dest_start:dest_end] = clip_to_copy
        print(f"  Line {i+1:02d}: starts at {target_starts[i]:06.2f}s, duration {len(clip)/sr:05.2f}s, ends at {target_starts[i] + len(clip)/sr:06.2f}s")
        
    # Convert to int16
    master_buf = np.clip(master_buf, -32768, 32767).astype(np.int16)
    
    out_wav = '/tmp/ayurveda_narration_synced.wav'
    wavfile.write(out_wav, sr, master_buf)
    
    # Encode with ffmpeg to high quality MP3
    out_mp3 = 'public/videos/ayurveda_narration_only.mp3'
    # Keep a backup of the original unaligned take
    subprocess.run(['cp', out_mp3, 'public/videos/ayurveda_narration_raw_unaligned.mp3'], check=False)
    
    subprocess.run([
        'ffmpeg', '-y', '-i', out_wav,
        '-codec:a', 'libmp3lame',
        '-b:a', '192k',
        out_mp3
    ], check=True)
    print(f"\nSuccessfully generated synchronized narration: {out_mp3}")

if __name__ == '__main__':
    align()
