from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import requests
import datetime
import PyPDF2
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
from PIL import Image
import pytesseract
import jwt
from functools import wraps

# Load environment variables
load_dotenv()

# Environment variables
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GNEWS_API_KEY = os.getenv("GNEWS_API_KEY")
WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY")
CLERK_PUBLISHABLE_KEY = os.getenv("CLERK_PUBLISHABLE_KEY")
CLERK_JWKS_URL = "https://helpful-ladybird-48.clerk.accounts.dev/.well-known/jwks.json"

# Flask setup
app = Flask(__name__)
CORS(app)

# File upload directory
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Chat memory
chat_history = []

# Country code mapping
country_codes = {
    "united states": "us", "india": "in", "united kingdom": "gb",
    "canada": "ca", "germany": "de", "france": "fr",
    "australia": "au", "japan": "jp", "china": "cn"
}

# Auth utilities
jwks_cache = None
jwks_fetched_at = None

def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return f(user_id=None, *args, **kwargs)
        token = auth_header.split(' ')[1]
        try:
            user_id = verify_token(token)
            return f(user_id=user_id, *args, **kwargs)
        except Exception as e:
            print(f"Authentication error: {str(e)}")
            return f(user_id=None, *args, **kwargs)
    return decorated

def get_jwks():
    global jwks_cache, jwks_fetched_at
    if jwks_cache and jwks_fetched_at and (datetime.datetime.now() - jwks_fetched_at).total_seconds() < 3600:
        return jwks_cache
    try:
        response = requests.get(CLERK_JWKS_URL)
        jwks_cache = response.json()
        jwks_fetched_at = datetime.datetime.now()
        return jwks_cache
    except Exception as e:
        print(f"Error fetching JWKS: {str(e)}")
        if jwks_cache:
            return jwks_cache
        raise

def verify_token(token):
    try:
        headers = jwt.get_unverified_header(token)
        kid = headers.get('kid')
        if not kid:
            raise ValueError("No 'kid' in token header")
        jwks = get_jwks()
        key = next((k for k in jwks.get('keys', []) if k.get('kid') == kid), None)
        if not key:
            raise ValueError(f"No matching key for kid: {kid}")
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
        payload = jwt.decode(token, public_key, algorithms=['RS256'], options={"verify_aud": False})
        user_id = payload.get('sub')
        if not user_id:
            raise ValueError("No user ID in token payload")
        return user_id
    except Exception as e:
        raise ValueError(f"Invalid token: {str(e)}")

# Health check
@app.route('/')
def home():
    return jsonify({"message": "✅ Nova X backend is running."})

@app.route('/datetime', methods=['GET'])
def get_datetime():
    now = datetime.datetime.now()
    return jsonify({'response': f"📅 Date: {now.strftime('%A, %B %d, %Y')} | ⏰ Time: {now.strftime('%I:%M:%S %p')}"})

@app.route('/chat', methods=['POST'])
def chat():
    message = request.json.get('message', '').strip()
    if not message:
        return jsonify({'error': '⚠️ Message is required'}), 400
    chat_history.append({"role": "user", "content": message})
    system_prompt = {"role": "system", "content": "You are Nova X, a helpful AI assistant."}
    payload = {
        "model": "llama3-70b-8192",
        "messages": [system_prompt] + chat_history[-12:],
        "temperature": 1,
        "max_tokens": 1024,
        "top_p": 1,
        "stream": False
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GROQ_API_KEY}"
    }
    try:
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", json=payload, headers=headers)
        reply = response.json()['choices'][0]['message']['content']
        chat_history.append({"role": "assistant", "content": reply})
        return jsonify({'response': reply})
    except Exception as e:
        return jsonify({'response': f'❌ Error: {str(e)}'}), 500

@app.route('/analyze-pdf', methods=['POST'])
def analyze_pdf():
    if 'file' not in request.files or request.files['file'].filename == '':
        return jsonify({'error': 'No PDF uploaded'}), 400
    file = request.files['file']
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'File must be a PDF'}), 400
    try:
        filename = secure_filename(file.filename)
        path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(path)
        text = ""
        with open(path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        return jsonify({
            'filename': filename,
            'text': text.strip(),
            'page_count': len(reader.pages)
        })
    except Exception as e:
        return jsonify({'error': f'PDF processing failed: {str(e)}'}), 500

@app.route('/analyze-image', methods=['POST'])
def analyze_image():
    if 'image' not in request.files or request.files['image'].filename == '':
        return jsonify({'error': 'No image uploaded'}), 400
    try:
        pytesseract.get_tesseract_version()
    except EnvironmentError:
        return jsonify({'error': 'Tesseract OCR not installed'}), 500
    try:
        file = request.files['image']
        filename = secure_filename(file.filename)
        path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(path)
        image = Image.open(path)
        extracted = pytesseract.image_to_string(image)
        return jsonify({'filename': filename, 'text': extracted.strip()})
    except Exception as e:
        return jsonify({'error': f'Image processing failed: {str(e)}'}), 500

@app.route('/search-web', methods=['POST'])
def search_web():
    query = request.json.get('query', '')
    if not query:
        return jsonify({'results': ["No query provided."]}), 400
    try:
        response = requests.get(f"https://lite.duckduckgo.com/lite/?q={query}")
        soup = BeautifulSoup(response.text, 'html.parser')
        results = [{"title": link.get_text(strip=True), "url": link.get('href')} for link in soup.select('a.result-link')]
        return jsonify({'results': results or [f'No results found for "{query}".']})
    except Exception as e:
        return jsonify({'error': f'Search failed: {str(e)}'}), 500

@app.route('/news/country', methods=['GET'])
def news_by_country():
    country = request.args.get('country', '').lower()
    code = country_codes.get(country)
    if not code:
        return jsonify({'error': 'Unsupported country'}), 400
    try:
        response = requests.get(f"https://gnews.io/api/v4/top-headlines?country={code}&token={GNEWS_API_KEY}")
        articles = response.json().get('articles', [])[:5]
        formatted = '\n'.join(f"📰 {a['title']} - {a['source']['name']}" for a in articles)
        return jsonify({'response': formatted or "No news found."})
    except Exception as e:
        return jsonify({'error': f'Error fetching news: {str(e)}'}), 500

@app.route('/news/topic', methods=['GET'])
def news_by_topic():
    topic = request.args.get('topic', '')
    if not topic:
        return jsonify({'error': 'Topic required'}), 400
    try:
        response = requests.get(f"https://gnews.io/api/v4/search?q={topic}&token={GNEWS_API_KEY}")
        articles = response.json().get('articles', [])[:5]
        formatted = '\n'.join(f"🗞️ {a['title']} - {a['source']['name']}" for a in articles)
        return jsonify({'response': formatted or "No news found."})
    except Exception as e:
        return jsonify({'error': f'Error fetching news: {str(e)}'}), 500

@app.route('/weather', methods=['GET'])
def get_weather():
    city = request.args.get('city', '')
    if not city:
        return jsonify({'error': 'City required'}), 400
    try:
        response = requests.get(f"https://api.weatherapi.com/v1/current.json?key={WEATHER_API_KEY}&q={city}")
        data = response.json()
        return jsonify({
            'location': data['location']['name'],
            'condition': data['current']['condition']['text'],
            'temp_c': data['current']['temp_c'],
            'temp_f': data['current']['temp_f']
        })
    except Exception as e:
        return jsonify({'error': f'Weather fetch failed: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(port=5000)
