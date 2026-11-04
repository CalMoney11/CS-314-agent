import os
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()
client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Fetch and print available models
models = client.models.list()
print("Available models for your API key:")
for model in models.data:
    print(f"- ID: {model.id} (Display Name: {model.display_name})")