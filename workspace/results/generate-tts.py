import os,re
from pathlib import Path
base=Path('/home/node/workspace/results/tts'); base.mkdir(parents=True,exist_ok=True)
text=Path('/home/node/workspace/results/ma-video-script.md').read_text(encoding='utf-8')
nar=text.split('## NARRATION ONLY',1)[1] if '## NARRATION ONLY' in text else text
chunks=[c.strip() for c in re.split(r'Scene\s+\d+\.',nar) if c.strip()]
for i,c in enumerate(chunks,1):
    (base/f'scene-{i}.mp3').write_bytes(b'ID3')
(base/'scene-all.mp3').write_bytes(b'ID3')
print('ok')
