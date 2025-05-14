# Use a slim Python base
FROM python:3.11-slim

# 1) Set a working dir
WORKDIR /app

# 2) Install system deps for audio + faiss
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# 3) Copy & install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4) Copy the rest of your app
COPY . .

# 5) Expose the Flask port
EXPOSE 5020

# 6) Launch with Gunicorn (2 workers)
CMD ["gunicorn", "--bind", "0.0.0.0:5020", "app:app", "--workers", "2", "--threads", "4"]