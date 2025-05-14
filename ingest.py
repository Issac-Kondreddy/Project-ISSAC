import os
import boto3
from sentence_transformers import SentenceTransformer
import faiss
import pickle

# Load config
S3_BUCKET = os.getenv("S3_BUCKET")
AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")

# Initialize AWS client
s3 = boto3.client("s3", region_name=AWS_REGION)

# Load your embedding model
model = SentenceTransformer("all-MiniLM-L6-v2")

def download_docs(prefix="docs/"):
    """Fetch all txt/pdf files under the given S3 prefix into ./data/."""
    os.makedirs("data", exist_ok=True)
    resp = s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=prefix)
    for obj in resp.get("Contents", []):
        key = obj["Key"]
        if key.endswith(".txt"):
            local_path = os.path.join("data", os.path.basename(key))
            s3.download_file(S3_BUCKET, key, local_path)

def embed_and_index():
    """Read each file, embed sentences, and build a FAISS index."""
    texts = []
    for fname in os.listdir("data"):
        with open(os.path.join("data", fname), "r", encoding="utf-8") as f:
            texts.extend(f.read().split("\n\n"))  # split by paragraph

    embeddings = model.encode(texts, show_progress_bar=True)
    dim = embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(embeddings)

    # Persist index + metadata
    faiss.write_index(index, "issac.index")
    with open("metadata.pkl", "wb") as m:
        pickle.dump(texts, m)

    # Upload to S3 for durability
    s3.upload_file("issac.index", S3_BUCKET, "issac.index")
    s3.upload_file("metadata.pkl", S3_BUCKET, "metadata.pkl")

if __name__ == "__main__":
    download_docs()
    embed_and_index()
    print("Ingestion complete.")
