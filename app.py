import os
import pickle
import boto3
import faiss
import uuid

from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from openai import OpenAI
from sentence_transformers import SentenceTransformer
from flask_jwt_extended import (
    JWTManager, create_access_token,
    jwt_required, get_jwt_identity
)
from passlib.hash import pbkdf2_sha256

# ── Load environment variables ─────────────────────────────────────────────────
load_dotenv()
AWS_REGION       = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
S3_BUCKET        = os.getenv("S3_BUCKET")
SESSIONS_TABLE   = os.getenv("DDB_TABLE")
USERS_TABLE      = os.getenv("DDB_TABLE_USERS")
OPENAI_API_KEY   = os.getenv("OPENAI_API_KEY")
JWT_SECRET_KEY   = os.getenv("JWT_SECRET_KEY", "super-secret")

# ── Initialize Flask & JWT ─────────────────────────────────────────────────────
app = Flask(__name__, static_folder="static", static_url_path="")
app.config["JWT_SECRET_KEY"] = JWT_SECRET_KEY
jwt = JWTManager(app)

# ── AWS Clients ────────────────────────────────────────────────────────────────
s3             = boto3.client("s3", region_name=AWS_REGION)
dynamodb       = boto3.resource("dynamodb", region_name=AWS_REGION)
sessions_table = dynamodb.Table(SESSIONS_TABLE)
users_table    = dynamodb.Table(USERS_TABLE)

# ── Load FAISS index & metadata ─────────────────────────────────────────────────
s3.download_file(S3_BUCKET, "issac.index",   "issac.index")
s3.download_file(S3_BUCKET, "metadata.pkl",  "metadata.pkl")
index = faiss.read_index("issac.index")
with open("metadata.pkl", "rb") as f:
    texts = pickle.load(f)

# ── Embedding model & OpenAI client ─────────────────────────────────────────────
embed_model = SentenceTransformer("all-MiniLM-L6-v2")
client      = OpenAI(api_key=OPENAI_API_KEY)

@app.route("/")
def home():
    return app.send_static_file("index.html")

# ── AUTH: Register & Login ─────────────────────────────────────────────────────
@app.route("/api/register", methods=["POST"])
def register():
    data     = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    if not username or not password:
        return jsonify({"msg": "Username and password required"}), 400

    # Check existence
    resp = users_table.get_item(Key={"username": username})
    if 'Item' in resp:
        return jsonify({"msg": "Username already exists"}), 400

    # Hash and store
    hash_pw = pbkdf2_sha256.hash(password)
    users_table.put_item(Item={
        "username":     username,
        "passwordHash": hash_pw
    })
    return jsonify({"msg": "User registered"}), 201

@app.route("/api/login", methods=["POST"])
def login():
    data     = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    if not username or not password:
        return jsonify({"msg": "Username and password required"}), 400

    resp = users_table.get_item(Key={"username": username})
    item = resp.get('Item')
    if not item or not pbkdf2_sha256.verify(password, item.get('passwordHash', '')):
        return jsonify({"msg": "Bad username or password"}), 401

    token = create_access_token(identity=username)
    return jsonify({"access_token": token})

# ── HELPER: Chat + Memory ───────────────────────────────────────────────────────
def get_chat_reply_with_memory(user_msg: str, session_id: str, username: str) -> str:
    """
    Perform FAISS retrieval, call GPT-4, and persist conversation history in DynamoDB.
    """
    # 1) Load prior history for this session
    resp    = sessions_table.get_item(Key={"session_id": session_id})
    history = resp.get('Item', {}).get('history', [])

    # 2) Compute top-3 FAISS snippets
    q_emb            = embed_model.encode([user_msg])
    _, idxs          = index.search(q_emb, 3)
    context_snippets = [texts[i] for i in idxs[0]]

    # 3) Build system prompt + assemble messages
    system_content = (
        "You are ISSAC, an intelligent assistant. Use DOCUMENT context & PAST CONVERSATION to inform your reply.\n\n"
        "=== DOCUMENT ===\n"
        + "\n---\n".join(context_snippets)
        + "\n\n=== HISTORY ===\n"
        + "\n".join(f"{m['role'].upper()}: {m['content']}" for m in history)
    )
    messages = (
        [{"role": "system", "content": system_content}]
        + history
        + [{"role": "user", "content": user_msg}]
    )

    # 4) Call GPT-4
    resp_gpt = client.chat.completions.create(
        model="gpt-4",
        messages=messages,
        temperature=0.7,
        max_tokens=500
    )
    reply = resp_gpt.choices[0].message.content.strip()

    # 5) Persist updated history
    new_history = history + [
        {"role": "user",      "content": user_msg},
        {"role": "assistant", "content": reply}
    ]
    sessions_table.put_item(Item={
        "session_id": session_id,
        "username":   username,
        "history":    new_history
    })

    return reply

# ── ENDPOINTS: Protected by JWT ─────────────────────────────────────────────────
@app.route("/api/history/<session_id>", methods=["GET"])
@jwt_required()
def api_history(session_id):
    user = get_jwt_identity()
    resp = sessions_table.get_item(Key={"session_id": session_id})
    item = resp.get('Item')
    if not item or item.get('username') != user:
        return jsonify({"history": []})
    return jsonify({"history": item['history']})

@app.route("/api/chat", methods=["POST"])
@jwt_required()
def api_chat():
    user     = get_jwt_identity()
    data     = request.get_json() or {}
    msg      = data.get("message", "")
    sess_id  = data.get("session_id") or str(uuid.uuid4())
    reply    = get_chat_reply_with_memory(msg, sess_id, user)
    return jsonify({"reply": reply, "session_id": sess_id})

@app.route("/api/search", methods=["POST"])
@jwt_required()
def api_search():
    # username = get_jwt_identity()  # not needed here
    q       = request.json.get("query", "")
    q_emb   = embed_model.encode([q])
    _, idxs = index.search(q_emb, 5)
    return jsonify({"results": [texts[i] for i in idxs[0]]})

@app.route("/api/voice", methods=["POST"])
@jwt_required()
def api_voice():
    user = get_jwt_identity()
    sess = request.form.get("session_id") or str(uuid.uuid4())

    if "file" not in request.files:
        return jsonify({"error": "No audio provided"}), 400
    file = request.files['file']
    tmp  = os.path.join('/tmp', secure_filename(file.filename))
    file.save(tmp)

    whisper = client.audio.transcriptions.create(
        file=open(tmp,'rb'), model="whisper-1"
    )
    text  = whisper.text.strip()
    reply = get_chat_reply_with_memory(text, sess, user)

    return jsonify({
        "transcript":  text,
        "reply":       reply,
        "session_id":  sess
    })

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5020))
    app.run(host="0.0.0.0", port=port, debug=True)
