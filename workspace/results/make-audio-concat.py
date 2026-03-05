import os
lines = []
for i in range(12):
    p = r'C:\Users\mentoria\openclaw-jail\workspace\results\tts\scene-{:03d}.mp3'.format(i)
    lines.append("file '{}'".format(p.replace('\\', '/')))
out = r'C:\Users\mentoria\openclaw-jail\workspace\results\audio-concat.txt'
open(out, 'w').write('\n'.join(lines))
print('Written:', out)
