"""Isolated optional evaluation; inputs are never distributed with the app."""
import json
from pathlib import Path
import sys

import cv2
import numpy as np
import onnxruntime as ort

root = Path(sys.argv[1])
capture = cv2.VideoCapture(sys.argv[2])
ok, image = capture.read()
assert ok
capture.release()
# Non-square, non-640 source forces both padding and an inverse scale.
image = cv2.resize(image, (960, 540), interpolation=cv2.INTER_LINEAR)
cv2.imwrite(str(root / 'frame.png'), image)
h, w = image.shape[:2]
ratio = min(640 / w, 640 / h)
canvas = np.full((640, 640, 3), 114, dtype=np.uint8)
canvas[:int(h * ratio), :int(w * ratio)] = cv2.resize(image, (int(w * ratio), int(h * ratio)))
tensor = canvas.transpose(2, 0, 1)[None].astype('float32')  # BGR, no mean/std
session = ort.InferenceSession(str(root / 'end2end.onnx'), providers=['CPUExecutionProvider'])
dets, kpts = session.run(['dets', 'keypoints'], {'input': tensor})
best = np.argmax(dets[0, :, 4])  # Top-scoring person survives greedy NMS.
assert dets[0, best, 4] > 0.7
joints = kpts[0, best].copy()
joints[:, :2] /= ratio
(root / 'reference.json').write_text(json.dumps(joints.tolist()))
