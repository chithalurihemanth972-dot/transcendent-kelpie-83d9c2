"""Application entry point.

    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    python app.py
"""

from __future__ import annotations

import logging

from flask import Flask, jsonify
from flask_cors import CORS

from config import config
from routes import api
from utils import fail

logging.basicConfig(
    level=logging.DEBUG if config.DEBUG else logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
)
log = logging.getLogger("digital-samatulyata")


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = config.MAX_UPLOAD_BYTES

    origins = "*" if config.CORS_ORIGINS == "*" else [
        o.strip() for o in config.CORS_ORIGINS.split(",") if o.strip()
    ]
    CORS(app, resources={r"/api/*": {"origins": origins}}, max_age=3600)

    app.register_blueprint(api)

    @app.errorhandler(413)
    def too_large(_e):
        return jsonify(fail("TOO_LARGE", "Image exceeds the size limit.")), 413

    @app.errorhandler(404)
    def not_found(_e):
        return jsonify(fail("NOT_FOUND", "Unknown endpoint.")), 404

    @app.errorhandler(Exception)
    def unhandled(exc):
        # Never leak a stack trace to the client; the UI shows a calm message.
        log.exception("Unhandled error: %s", exc)
        return jsonify(fail("INTERNAL", "Something went wrong while analysing.")), 500

    return app


app = create_app()


if __name__ == "__main__":
    import ocr

    if ocr.is_available():
        log.info("OCR ready · langs=%s", config.OCR_LANGS)
    else:
        log.warning("OCR UNAVAILABLE · %s", ocr.availability_error())
        log.warning("Install Tesseract, then restart. See backend/README.md")

    log.info(
        "Threshold: %s minutes (%.1f h)",
        config.SCREEN_TIME_LIMIT_MINUTES,
        config.SCREEN_TIME_LIMIT_MINUTES / 60,
    )
    log.info("Listening on http://%s:%s", config.HOST, config.PORT)
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG, threaded=True)
