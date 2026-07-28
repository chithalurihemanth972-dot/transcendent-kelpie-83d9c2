# డిజిటల్ సమతుల్యత — OCR Backend (**optional**)

> ### ⚠️ You do not need this to use the app.
>
> The web app ships with a **complete OCR engine built into the browser**
> (Tesseract compiled to WebAssembly). Open the site, scan, done — no
> Python, no install, nothing to start.
>
> This backend is an **optional accelerator**. Run it only if you want
> faster scans and OpenCV's stronger image preprocessing on a desktop.
> When it is not running the app silently uses the browser engine; the
> status chip in the viewfinder shows which one is active
> (**సర్వర్** = this backend, **బ్రౌజర్** = in-browser).

## Why "server not connected" is normal

| Situation | What happens |
|---|---|
| You never started this backend | App uses the browser engine. **Expected.** |
| Site is served over **HTTPS** | Browsers block `http://127.0.0.1` as mixed content. The app detects this up front and goes straight to the browser engine. |
| Backend running + site on `http://localhost` | App auto-detects it and uses it. |

To actually use this backend, the frontend must be served over **plain
HTTP** (e.g. `npm run dev` on `http://localhost:5173`), because an HTTPS
page is not permitted to call an HTTP localhost API.

---

Local-only screen-time OCR. No database, no auth, no cloud calls.
The captured frame lives in memory for the duration of one request and is
never written to disk.

## 1 · Install Tesseract

| OS | Command |
|---|---|
| macOS | `brew install tesseract` |
| Ubuntu / Debian | `sudo apt install tesseract-ocr` |
| Windows | [UB-Mannheim installer](https://github.com/UB-Mannheim/tesseract/wiki) |

On Windows, point the app at the binary:

```
set TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```

## 2 · Install & run

**One command** (macOS / Linux) — checks Python, Tesseract, deps and the
port, then starts:

```bash
cd backend
chmod +x start.sh
./start.sh
```

**Manual** (all platforms):

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Serves on `http://127.0.0.1:8000`.

### Verify it is up

```bash
curl http://127.0.0.1:8000/api/health
# {"ok":true,"ocr_available":true,"limit_minutes":300, ...}
```

If `ocr_available` is `false`, Tesseract is missing — see step 1.

### Point the frontend at it

Create `.env` in the **project root** (not in `backend/`):

```
VITE_API_BASE=http://127.0.0.1:8000
```

then run the frontend over plain HTTP:

```bash
npm run dev        # http://localhost:5173
```

## 3 · Configuration

Every knob is an environment variable — no code changes needed.

| Variable | Default | Purpose |
|---|---|---|
| `SCREEN_TIME_LIMIT_MINUTES` | `300` | The healthy/warning threshold (5 h) |
| `MIN_CONFIDENCE` | `0.35` | Below this the API returns `LOW_CONFIDENCE` |
| `PORT` | `8000` | Server port |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `TESSERACT_CMD` | *(auto)* | Absolute path to the tesseract binary |
| `OCR_LANGS` | `eng` | Add `+tel` once Telugu traineddata is installed |
| `TARGET_LONG_EDGE` | `1800` | Preprocessing resize target |

Change the threshold to 4 hours:

```bash
SCREEN_TIME_LIMIT_MINUTES=240 python app.py
```

## 4 · Endpoints

### `GET /api/health`
```json
{ "ok": true, "ocr_available": true, "limit_minutes": 300 }
```

### `POST /api/scan`
`multipart/form-data` with an `image` field (or a raw image body).

**Success**
```json
{
  "ok": true,
  "status": "healthy",
  "screen_time": "4h 18m",
  "minutes": 258,
  "confidence": 0.96,
  "limit_minutes": 300,
  "over_by_minutes": 0,
  "ratio": 0.86,
  "matched_text": "4h 18m",
  "detected_text": "Today Screen Time 4h 18m ...",
  "elapsed_ms": 812
}
```

**Failure**
```json
{ "ok": false, "code": "NOT_DETECTED", "message": "…", "detected_text": "…" }
```

| Code | HTTP | Meaning |
|---|---|---|
| `EMPTY_UPLOAD` | 400 | No image in the request |
| `BAD_TYPE` | 400 | Unsupported MIME type |
| `DECODE_FAILED` | 400 | Bytes were not a valid image |
| `TOO_LARGE` | 413 | Over `MAX_UPLOAD_BYTES` |
| `NO_TEXT` | 422 | OCR found no readable text |
| `NOT_DETECTED` | 422 | Text found, but no duration in it |
| `LOW_CONFIDENCE` | 422 | Reading too unclear to trust |
| `OCR_UNAVAILABLE` | 503 | Tesseract not installed |
| `INTERNAL` | 500 | Unexpected failure |

## 5 · How detection works

1. **Preprocess** — resize, deskew, CLAHE, bilateral denoise, unsharp mask,
   then emit five renderings (primary, Otsu, adaptive, inverted, denoised).
   Dark-themed phone UIs are auto-detected and inverted.
2. **OCR** — every rendering × three page-segmentation modes. Readings are
   ranked by mean word confidence plus how many Screen Time keywords appear.
3. **Parse** — regex for `4h 30m`, `5h`, `3 hrs 20 mins`, `45m`, `4:18`,
   and Telugu `గం`/`ని`. Matches near *Today* / *Screen Time* are boosted;
   those near *Yesterday* / *Weekly* are penalised.
4. **Select** — among equally trusted matches the largest wins, because the
   daily total is always ≥ any single app's usage.
5. **Decide** — `decision.py` compares against the threshold. That file is
   the only place the healthy/warning rule exists.

## 6 · Architecture

```
app.py                 Flask factory, CORS, error handlers
routes.py              REST layer (thin)
image_processing.py    OpenCV preprocessing → OCR variants
ocr.py                 Tesseract wrapper, reading ranking
screen_time_parser.py  Text → minutes
decision.py            Minutes → healthy | warning
config.py              All tunables
utils.py               Timing, temp files, response envelopes
```
