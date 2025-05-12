from flask import Flask, request, jsonify, send_from_directory
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

# Load environment variables
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GNEWS_API_KEY = os.getenv("GNEWS_API_KEY")
WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "sk_test_Fs2ElZLBRHRmMezqPMnqjQfW4Co48lfEpacKEbv3Sa")  # Default from your data.txt
CLERK_PUBLISHABLE_KEY = os.getenv("CLERK_PUBLISHABLE_KEY", "pk_test_cHJlY2lzZS1hbnRlYXRlci0yOC5jbGVyay5hY2NvdW50cy5kZXYk")  # Default from your data.txt
CLERK_JWKS_URL = "https://helpful-ladybird-48.clerk.accounts.dev/.well-known/jwks.json"

app = Flask(__name__)
CORS(app)

# Authentication decorator
def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            # If no token, continue but mark as unauthenticated
            return f(user_id=None, *args, **kwargs)
        
        token = auth_header.split(' ')[1]
        try:
            # Verify and decode the JWT token
            user_id = verify_token(token)
            return f(user_id=user_id, *args, **kwargs)
        except Exception as e:
            print(f"Authentication error: {str(e)}")
            # Continue but mark as unauthenticated
            return f(user_id=None, *args, **kwargs)
    return decorated

def get_jwks():
    global jwks_cache, jwks_fetched_at
    
    # Use cached JWKS if it's less than 1 hour old
    now = datetime.datetime.now()
    if jwks_cache and jwks_fetched_at and (now - jwks_fetched_at).total_seconds() < 3600:
        return jwks_cache
    
    # Fetch fresh JWKS from Clerk
    try:
        response = requests.get(CLERK_JWKS_URL)
        jwks_cache = response.json()
        jwks_fetched_at = now
        return jwks_cache
    except Exception as e:
        print(f"Error fetching JWKS: {str(e)}")
        # Return the cached version if we have one, even if it's old
        if jwks_cache:
            return jwks_cache
        raise

def verify_token(token):
    try:
        # Get the JWT headers to extract the key ID (kid)
        headers = jwt.get_unverified_header(token)
        kid = headers.get('kid')
        
        if not kid:
            raise ValueError("No 'kid' in token header")
        
        # Get the JWK set and find the key that matches the kid
        jwks = get_jwks()
        key = None
        for jwk in jwks.get('keys', []):
            if jwk.get('kid') == kid:
                key = jwk
                break
        
        if not key:
            raise ValueError(f"No matching key found for kid: {kid}")
        
        # Convert the JWK to a format that PyJWT can use
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
        
        # Verify and decode the token
        payload = jwt.decode(
            token,
            public_key,
            algorithms=['RS256'],
            options={"verify_aud": False}  # Skip audience verification
        )
        
        # Extract the user ID from the payload
        # This assumes Clerk puts user ID in 'sub' claim
        user_id = payload.get('sub')
        if not user_id:
            raise ValueError("No user ID in token payload")
        
        return user_id
    except Exception as e:
        print(f"Token verification error: {str(e)}")
        raise ValueError(f"Invalid token: {str(e)}")

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

chat_history = []

country_codes = {
    "united states": "us", "india": "in", "united kingdom": "gb",
    "canada": "ca", "germany": "de", "france": "fr",
    "australia": "au", "japan": "jp", "china": "cn"
}

@app.route('/datetime', methods=['GET'])
def get_datetime():
    now = datetime.datetime.now()
    date = now.strftime('%A, %B %d, %Y')
    time = now.strftime('%I:%M:%S %p')
    return jsonify({'response': f"\ud83d\udcc5 Date: {date} | \u23f0 Time: {time}"})

@app.route('/chat', methods=['POST'])
def chat():
    message = request.json.get('message', '').strip()
    if not message:
        return jsonify({'error': '⚠️ Message is required'}), 400

    chat_history.append({"role": "user", "content": message})
    system_prompt = {"role": "system", "content": "You are Nova X, a helpful AI assistant."}
    trimmed_history = chat_history[-12:]

    payload = {
        "model": "llama3-70b-8192",
        "messages": [system_prompt] + trimmed_history,
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
        data = response.json()
        reply = data['choices'][0]['message']['content']
        chat_history.append({"role": "assistant", "content": reply})
        return jsonify({'response': reply})
    except Exception as e:
        return jsonify({'response': f'❌ Error connecting to Groq Chat API: {str(e)}'}), 500

@app.route('/analyze-pdf', methods=['POST'])
def analyze_pdf():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'File must be a PDF'}), 400

    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        text = ""
        with open(filepath, 'rb') as f:
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
        return jsonify({'error': f'Failed to process PDF: {str(e)}'}), 500

@app.route('/analyze-image', methods=['POST'])
def analyze_image():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400
        
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No selected image'}), 400

    try:
        # Verify Tesseract is available
        pytesseract.get_tesseract_version()
    except EnvironmentError:
        return jsonify({
            'error': 'Tesseract OCR is not installed or not in system PATH'
        }), 500

    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        image = Image.open(filepath)
        extracted_text = pytesseract.image_to_string(image)

        return jsonify({
            'filename': filename,
            'text': extracted_text.strip()
        })
    except Exception as e:
        return jsonify({'error': f'Failed to process image: {str(e)}'}), 500

@app.route('/search-web', methods=['POST'])
def search_web():
    query = request.json.get('query', '')
    if not query:
        return jsonify({'results': ["No query provided."]}), 400

    try:
        response = requests.get(f"https://lite.duckduckgo.com/lite/?q={query}")
        soup = BeautifulSoup(response.text, 'html.parser')
        results = []
        for link in soup.select('a.result-link'):
            results.append({
                'title': link.get_text(strip=True),
                'url': link.get('href')
            })
        return jsonify({'results': results or [f'No results found for \"{query}\".']})
    except Exception as e:
        return jsonify({'error': f'Web search failed: {str(e)}'}), 500

@app.route('/news/country', methods=['GET'])
def news_by_country():
    country = request.args.get('country', '').lower()
    code = country_codes.get(country)
    if not code:
        return jsonify({'error': 'Unsupported country'}), 400

    url = f"https://gnews.io/api/v4/top-headlines?country={code}&token={GNEWS_API_KEY}"
    try:
        response = requests.get(url)
        articles = response.json().get('articles', [])[:5]
        formatted = '\n'.join(f"📰 {a['title']} - {a['source']['name']}" for a in articles)
        return jsonify({'response': formatted or "No news found."})
    except Exception as e:
        return jsonify({'error': f'Error fetching country news: {str(e)}'}), 500

@app.route('/news/topic', methods=['GET'])
def news_by_topic():
    topic = request.args.get('topic', '')
    if not topic:
        return jsonify({'error': 'Topic required'}), 400

    url = f"https://gnews.io/api/v4/search?q={topic}&token={GNEWS_API_KEY}"
    try:
        response = requests.get(url)
        articles = response.json().get('articles', [])[:5]
        formatted = '\n'.join(f"🗞️ {a['title']} - {a['source']['name']}" for a in articles)
        return jsonify({'response': formatted or "No news found for this topic."})
    except Exception as e:
        return jsonify({'error': f'Error fetching topic news: {str(e)}'}), 500

@app.route('/weather', methods=['GET'])
def get_weather():
    city = request.args.get('city', '')
    if not city:
        return jsonify({'error': 'City required'}), 400

    url = f"https://api.weatherapi.com/v1/current.json?key={WEATHER_API_KEY}&q={city}"
    try:
        response = requests.get(url)
        data = response.json()
        return jsonify({
            'location': data['location']['name'],
            'condition': data['current']['condition']['text'],
            'temp_c': data['current']['temp_c'],
            'temp_f': data['current']['temp_f']
        })
    except Exception as e:
        return jsonify({'error': f'Error fetching weather: {str(e)}'}), 500

@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('public', path)

if __name__ == '__main__':
    app.run(port=5000, debug=True)