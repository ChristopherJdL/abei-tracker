import os
import base64
from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
with open("public/scenes/abei-in-bahawalpur-doing-a-typ.png", "rb") as f:
    img_bytes = f.read()

response = client.models.generate_content(
    model="gemini-1.5-flash",
    contents=[
        "Describe what Abei (the white polar bear wearing a red scarf and mint green shirt) is doing in this 16-bit pixel art image in one short, punchy, witty sentence (max 60 chars) for a trading card subtitle.",
        types.Part.from_bytes(data=img_bytes, mime_type="image/png")
    ]
)
print("IMAGE_DESC:", response.text)
