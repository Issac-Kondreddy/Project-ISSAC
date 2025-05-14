# ISSAC – Intelligent System for Semantic Assistance and Comprehension

A full‑stack GenAI assistant that lets authenticated users chat with a context‑aware, semantic‑search‑powered GPT‑4 backend. It supports text and voice input, multi‑session chat history persisted per user, and is fully dockerized.

---

## Table of Contents

1. [Overview](#overview)  
2. [Features](#features)  
3. [Architecture & Tech Stack](#architecture--tech-stack)  
   - [Backend](#backend)  
   - [Frontend](#frontend)  
   - [GenAI Components](#genai-components)  
   - [Persistence & Search](#persistence--search)  
4. [Getting Started](#getting-started)  
   - [Prerequisites](#prerequisites)  
   - [Environment Variables](#environment-variables)  
   - [Running Locally (Virtualenv)](#running-locally-virtualenv)  
   - [Docker Build & Run](#docker-build--run)  
5. [Project Structure](#project-structure)  
6. [Future Directions](#future-directions)  

---

## Overview

ISSAC is a **GenAI‑powered** chat assistant built with:

- **Flask** + **OpenAI’s GPT‑4** (via the new `openai` SDK)  
- **LangChain‑style** semantic search using **FAISS** + **sentence‑transformers**  
- **DynamoDB** for per‑user, per‑session chat history  
- **AWS S3** to store the serialized FAISS index & metadata  
- **JWT**‑based authentication (login/register)  

The frontend is a **single‑page app** in plain HTML/CSS/JavaScript that mimics ChatGPT’s UI, complete with:

- Login / Register overlays  
- Sidebar of named chat sessions  
- Text input + send button + mic recording button  
- “Good morning/afternoon/evening” greeting based on time & username  

---

## Features

- **User authentication** (register/login) using JWT  
- **Multi‑session chat**: name your sessions, pick them from the sidebar  
- **Semantic retrieval**: top‑3 relevant document snippets injected into every GPT‑4 prompt  
- **Voice input**: record audio, transcribe with Whisper, chat with transcript  
- **Persistent history**: all messages saved in DynamoDB per user & session  
- **Dockerized** backend + frontend for easy deployment  

---

## Architecture & Tech Stack

### Backend

- **Flask** – lightweight web framework  
- **openai** SDK – GPT‑4 & Whisper API calls  
- **boto3** – AWS S3 & DynamoDB access  
- **FAISS** – fast vector search  
- **sentence‑transformers** – `all-MiniLM-L6-v2` for embeddings  
- **Flask‑JWT‑Extended** – JWT auth  
- **passlib** – password hashing (PBKDF2‑SHA256)  
- **dotenv** – load environment variables  

### Frontend

- **Plain HTML/CSS/JS** (no frameworks)  
- **Static assets** under `static/`  
- **chat.js** – handles UI interactions, fetch to `/api/*`  
- **auth.js** – login/register flow, toggles views  
- **style.css** – responsive, ChatGPT‑inspired layout  

### GenAI Components

1. **Whisper (audio.transcriptions)**  
2. **Semantic Search**  
   - Upload your docs to S3 under `docs/…`  
   - `ingest.py` downloads, embeds, and indexes to `issac.index` & `metadata.pkl`  
3. **GPT‑4 Chat**  
   - System prompt includes context snippets + conversation history  
   - `temperature=0.7`, `max_tokens=500`  

### Persistence & Search

- **AWS S3**  
  - Stores serialized FAISS index (`issac.index`) & metadata (`metadata.pkl`)  
- **AWS DynamoDB**  
  - **issac-users** – maps `username` → `passwordHash`  
  - **issac-sessions-table-YYYYMMDD** – items: `{ session_id, username, history: […] }`  

---

## Getting Started

### Prerequisites

- Python 3.10+  
- Docker & Docker Compose (for containerized run)  
- AWS credentials with S3 & DynamoDB read/write  
- OpenAI API key (GPT‑4, Whisper)  

### Environment Variables

Create a file named `.env` in the project root:

```bash
OPENAI_API_KEY=sk-…
AWS_ACCESS_KEY_ID=AKIA…
AWS_SECRET_ACCESS_KEY=…
AWS_DEFAULT_REGION=us-east-1
S3_BUCKET=issac-embeddings-bucket-20250512
DDB_TABLE=issac-sessions-table-20250512
DDB_TABLE_USERS=issac-users
JWT_SECRET_KEY=your_jwt_secret
```
## Running Locally (Virtualenv)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Ingest your docs once:
python ingest.py

# Start Flask dev server:
python app.py
```
Visit http://localhost:5020, register/login, and start chatting!

## Docker Build & Run
```bash
# Build the image
docker build -t issac-assistant .

# Run container (publish port 5020)
docker run -d \
  -p 5020:5020 \
  --env-file .env \
  issac-assistant
```
Or with Docker Compose (live‑reload of static/ in dev):
```bash
services:
  issac:
    build: .
    ports:
      - "5020:5020"
    env_file:
      - .env
    volumes:
      - ./static:/app/static
    restart: unless-stopped
```

```code
docker-compose up --build
```
## Project Structure
```text
.
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── ingest.py              # downloads & indexes your docs
├── app.py                 # Flask backend + API endpoints
├── README.md
├── .env                
└── static/
    ├── index.html
    ├── css/
    │   └── style.css
    └── js/
        ├── auth.js
        └── chat.js
```
## Future Directions
* Production Deployment: ECS Fargate / Elastic Beanstalk / Kubernetes

* CI/CD: GitHub Actions for automated build & push to ECR

* Streaming Responses: show GPT‑4 tokens as they arrive

* Advanced Retrieval: RAG over user‑uploaded PDFs or databases

* Custom Domains & SSL behind a load balancer

## Enjoy ISSAC!
Your friendly, semantic‑searching, multimodal GenAI assistant.
