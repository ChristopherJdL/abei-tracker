"""Image generation and multimodal reference handling with Gemini image models."""

import os
import base64
import time
from google import genai
from google.genai import types

MULTIMODAL_MODELS = [
    "gemini-3.1-flash-lite-image",
    "gemini-3.1-flash-image",
    "gemini-3-pro-image",
]

FALLBACK_IMAGE_MODEL = "gemini-2.5-flash-image"

def load_reference_part(b64_str: str = None) -> types.Part | None:
    """Load reference character image as google.genai types.Part from base64 or local abei.png."""
    if b64_str:
        try:
            clean_b64 = b64_str.split(',')[1] if ',' in b64_str else b64_str
            img_bytes = base64.b64decode(clean_b64)
            return types.Part.from_bytes(data=img_bytes, mime_type="image/png")
        except Exception as e:
            print(f"[ImageService] ⚠️ Failed to decode base64 reference image: {e}")

    # Fall back to bundled abei.png
    local_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'assets', 'abei.png')
    if os.path.exists(local_path):
        try:
            with open(local_path, 'rb') as f:
                img_bytes = f.read()
            print(f"[ImageService] ℹ️ Loaded abei.png ({len(img_bytes)} bytes) as types.Part")
            return types.Part.from_bytes(data=img_bytes, mime_type="image/png")
        except Exception as e:
            print(f"[ImageService] ⚠️ Failed to load local abei.png: {e}")
    else:
        print(f"[ImageService] ⚠️ Reference abei.png not found at '{local_path}'")

    return None

def extract_image_bytes_from_response(response) -> bytes | None:
    """Extract raw image bytes from Gemini response parts."""
    if not (hasattr(response, 'parts') and response.parts):
        return None
    for part in response.parts:
        if hasattr(part, 'inline_data') and part.inline_data and hasattr(part.inline_data, 'data'):
            return part.inline_data.data
    return None

def try_direct_multimodal_models(client, prompt: str, ref_part: types.Part | None) -> str | None:
    """Attempt direct multimodal generation with Gemini image models."""
    contents = [prompt]
    if ref_part:
        contents.append(ref_part)

    for idx, model_name in enumerate(MULTIMODAL_MODELS, start=1):
        if idx > 1:
            print("[ImageService] ⏳ Waiting 30s before testing next model...")
            time.sleep(30)

        print(f"[ImageService] 🚀 [Attempt {idx}/{len(MULTIMODAL_MODELS)}] Trying '{model_name}'...")
        try:
            response = client.models.generate_content(model=model_name, contents=contents)
            img_bytes = extract_image_bytes_from_response(response)
            if img_bytes:
                print(f"[ImageService] ✅ Model '{model_name}' generated image ({len(img_bytes)} bytes)")
                return base64.b64encode(img_bytes).decode('utf-8')
            print(f"[ImageService] ❌ '{model_name}' returned response without inline_data image bytes.")
        except Exception as err:
            print(f"[ImageService] ❌ '{model_name}' API Error: {err}")

    return None

def try_imagen_fallback(client, prompt: str) -> str:
    """Fallback to Gemini 2.5 Flash Image."""
    print("[ImageService] ⏳ Waiting 30s before fallback image rendering...")
    time.sleep(30)

    print(f"[ImageService] 🎨 Attempting fallback image rendering with '{FALLBACK_IMAGE_MODEL}'...")
    try:
        response = client.models.generate_content(
            model=FALLBACK_IMAGE_MODEL,
            contents=[prompt],
        )
        img_bytes = extract_image_bytes_from_response(response)
        if img_bytes:
            print(f"[ImageService] ✅ Successfully rendered image via '{FALLBACK_IMAGE_MODEL}'!")
            return base64.b64encode(img_bytes).decode('utf-8')
        print(f"[ImageService] ❌ '{FALLBACK_IMAGE_MODEL}' returned no inline_data image bytes.")
    except Exception as err:
        print(f"[ImageService] ❌ '{FALLBACK_IMAGE_MODEL}' API Error: {err}")

    raise ValueError("All image generation models (including fallback) failed.")

def generate_image(api_key: str, enhanced_prompt: str, ref_part: types.Part | None = None) -> str:
    """Main image generation pipeline orchestration returning base64-encoded PNG."""
    client = genai.Client(api_key=api_key)

    # 1. Try Direct Multimodal Models
    b64_image = try_direct_multimodal_models(client, enhanced_prompt, ref_part)
    if b64_image:
        return b64_image

    # 2. Fallback
    print("[ImageService] ⚠️ All direct multimodal models failed, triggering fallback...")
    return try_imagen_fallback(client, enhanced_prompt)
