"""
app.py — Pre-loads EasyOCR models into memory.
Run once before Tatkal booking window opens to avoid cold-start delay.
Usage: python3 irctc-captcha-solver/app.py ""
"""
import sys
import easyocr

print('[PRELOAD] Loading EasyOCR models...')
reader = easyocr.Reader(['en'], model_storage_directory='./EasyOCR')
print('[PRELOAD] Models loaded successfully.')

# If an image path was passed, test OCR on it.
if len(sys.argv) > 1 and sys.argv[1]:
    import numpy as np
    from PIL import Image
    image = Image.open(sys.argv[1]).convert('L')
    result = reader.readtext(np.array(image), detail=0)
    print(f'[TEST OCR] Result: {result}')
