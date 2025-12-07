from flask import Flask, render_template, request, jsonify, redirect, url_for, session, send_file, flash
from flask_sqlalchemy import SQLAlchemy
from gtts import gTTS
import os, json, io, datetime
from googletrans import Translator

# ✅ Initialize Translator once (removed duplicate)
translator = Translator()

app = Flask(__name__)
app.secret_key = "replace-this-with-a-secure-key"
base_dir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(base_dir, 'database', 'users.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{db_path}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)


# ===========================
# Database Models
# ===========================
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)

class Feedback(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120))
    email = db.Column(db.String(120))
    message = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

class ChatLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80))
    message = db.Column(db.Text)
    response = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)


# ===========================
# Initialization
# ===========================
os.makedirs(os.path.join(base_dir, 'database'), exist_ok=True)
with app.app_context():
    db.create_all()

with open(os.path.join('static', 'data', 'services.json'), 'r', encoding='utf-8') as f:
    SERVICES = json.load(f)

with open(os.path.join('static', 'data', 'translations.json'), 'r', encoding='utf-8') as f:
    TRANSLATIONS = json.load(f)


# ===========================
# Routes
# ===========================
@app.route('/')
def default_register():
    return redirect(url_for('register'))

@app.route('/home')
def home():
    return render_template('home.html', services=SERVICES)

@app.route('/chatbot')
def chatbot():
    service = request.args.get('service', 'none').lower()
    lang = request.args.get('lang', 'en')
    data = SERVICES.get(service)
    return render_template('chatbot.html', service_key=service, service=data, lang=lang)

@app.route('/api/services')
def api_services():
    return jsonify(SERVICES)


# ===========================
# Chatbot Query API
# ===========================
@app.route('/api/query', methods=['POST'])
def api_query():
    data = request.json or {}
    message = (data.get('message') or '').lower().strip()
    lang = data.get('lang', 'en')
    reply = None

    # 🔍 Match service
    for key, val in SERVICES.items():
        if key in message:
            reply = build_service_reply(val, lang)
            break

    if not reply:
        for key, val in SERVICES.items():
            for word in key.split('_'):
                if word in message:
                    reply = build_service_reply(val, lang)
                    break
            if reply:
                break

    if not reply:
        reply = "Sorry, no match found."

    # 💾 Save chat log
    try:
        username = session.get('user', 'anonymous')
        cl = ChatLog(username=username, message=message, response=reply)
        db.session.add(cl)
        db.session.commit()
    except Exception as e:
        print("Chat log error:", e)

    return jsonify({'reply': reply})


# ===========================
# Reply Builder (with Translation)
# ===========================
def build_service_reply(s, lang='en'):
    title = s.get('title', 'Service')
    steps = s.get('steps', [])
    docs = s.get('documents', [])
    fee = s.get('fee', '')
    link = s.get('link', '')

    reply = f"📘 {title}\n\n🪜 Steps:\n"
    for i, step in enumerate(steps, 1):
        reply += f"{i}. {step}\n"

    if docs:
        if isinstance(docs, list):
            clean_docs = ", ".join(docs)
        else:
            clean_docs = docs.replace(",", ", ").strip()
        reply += f"\n📄 Required Documents: {clean_docs}\n"

    if fee:
        reply += f"\n💰 Approx. Fee: {fee}\n"

    if link:
        reply += f"\n🔗 Official Link: {link}\n"

    # 🌍 Translate only if not English
    if lang != 'en':
        try:
            # Google Translate sometimes fails with emojis — remove them
            plain_text = reply.encode('ascii', 'ignore').decode('ascii')
            translated = translator.translate(plain_text, dest=lang)
            reply = translated.text
        except Exception as e:
            print(f"Translation error for {lang}:", e)
            reply = "⚠️ Translation unavailable right now. Please try again later."

    return reply.strip()



# ===========================
# Text-to-Speech
# ===========================
@app.route('/tts', methods=['POST'])
def tts():
    data = request.json or {}
    text = data.get('text', 'Hello')
    lang = data.get('lang', 'en')

    # ✅ Language code mapping for gTTS
    lang_map = {
        'en': 'en',
        'ta': 'ta',
        'hi': 'hi',
        'kn': 'kn'
    }
    tts_lang = lang_map.get(lang, 'en')

    try:
        tts_obj = gTTS(text=text, lang=tts_lang)
        bio = io.BytesIO()
        tts_obj.write_to_fp(bio)
        bio.seek(0)
        return send_file(bio, mimetype='audio/mpeg', as_attachment=False, download_name='reply.mp3')
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ===========================
# User System
# ===========================
@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        email = request.form['email']
        password = request.form['password']

        if User.query.filter_by(username=username).first():
            flash('Username exists', 'error')
            return redirect(url_for('register'))

        user = User(username=username, email=email, password=password)
        db.session.add(user)
        db.session.commit()
        flash('Registered. Please login.', 'success')
        return redirect(url_for('login'))

    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username, password=password).first()

        if user:
            session['user'] = user.username
            flash('Login successful', 'success')
            return redirect(url_for('home'))

        flash('Invalid credentials', 'error')
        return redirect(url_for('login'))

    return render_template('login.html')


@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('register'))


@app.route('/feedback', methods=['GET', 'POST'])
def feedback():
    if request.method == 'POST':
        name = request.form.get('name')
        email = request.form.get('email')
        message = request.form.get('feedback')

        fb = Feedback(name=name, email=email, message=message)
        db.session.add(fb)
        db.session.commit()
        flash('Feedback submitted. Thank you!', 'success')
        return redirect(url_for('home'))

    return render_template('feedback.html')


@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html', users=50, chats=45, feedbacks=39)


@app.route('/about')
def about():
    return render_template('about.html')


@app.route('/help')
def help_page():
    return render_template('help.html')


# ===========================
# Run App
# ===========================
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
