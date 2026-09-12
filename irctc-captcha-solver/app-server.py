import argparse
import numpy as np
from PIL import Image
import io
import base64
import easyocr
from flask import Flask, request, jsonify

# Initialize EasyOCR Reader — model files stored in ./EasyOCR (gitignored, large)
reader = easyocr.Reader(['en'], model_storage_directory='./EasyOCR')

# Initialize Flask app
app = Flask(__name__)


def extract_text_from_image(base64_image):
    """Decode a base64 CAPTCHA image and run EasyOCR on it."""
    try:
        # Strip the data URI prefix if present (data:image/png;base64,...)
        if ',' in base64_image:
            base64_image = base64_image.split(',')[1]

        image_bytes = base64.b64decode(base64_image)
        image_buffer = io.BytesIO(image_bytes)
        image = Image.open(image_buffer)

        # Grayscale improves OCR accuracy on IRCTC-style CAPTCHAs
        image = image.convert('L')
        open_cv_image = np.array(image)

        result = reader.readtext(open_cv_image, detail=0)
        if result:
            # Strip spaces and special chars — IRCTC CAPTCHA is alphanumeric only
            return result[0].replace(' ', '').strip()
        return ''
    except Exception as e:
        print(f'[ERROR] extract_text_from_image: {e}')
        return ''


@app.route('/extract-text', methods=['POST'])
def extract_text():
    """
    POST /extract-text
    Body: { "image": "<base64-encoded-image-or-data-uri>" }
    Returns: { "extracted_text": "<captcha_string>" }
    """
    data = request.json
    if not data or 'image' not in data:
        return jsonify({'error': 'Missing image field'}), 400

    extracted = extract_text_from_image(data['image'])
    print(f'[CAPTCHA] Extracted: {extracted}')
    return jsonify({'extracted_text': extracted})


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='IRCTC CAPTCHA OCR Server')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--port', type=int, default=5000, help='Port to listen on')
    args = parser.parse_args()

    print(f'[CAPTCHA SERVER] Starting on {args.host}:{args.port}')
    app.run(host=args.host, port=args.port, debug=False)
