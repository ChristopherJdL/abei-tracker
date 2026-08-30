"""Metadata extraction: geocoding, title, and multimodal image-verified subtitles."""

import re
import base64
import datetime
from google import genai
from google.genai import types

from .geo_service import lookup_coordinates, generate_fallback_coordinates, extract_fallback_title

TEXT_MODELS = ["gemini-3.5-flash", "gemini-1.5-flash"]
VISION_MODELS = ["gemini-3.5-flash", "gemini-1.5-flash"]

def sanitize_sighting_id(raw_prompt: str) -> str:
    """Generate a clean URL-friendly kebab-case ID from the prompt."""
    clean = "".join(c if c.isalnum() else "-" for c in raw_prompt.lower())
    return clean.strip("-")[:30]

def extract_location_and_title(client: genai.Client, prompt: str) -> tuple[float | None, float | None, str]:
    """Extract real-world city, country, coordinates, and encounter title from prompt."""
    lat, lng, title = None, None, None

    instruction = (
        f"Extract the real-world city AND country (or state) mentioned in this prompt: '{prompt}'. "
        f"If no obvious city is found, pick a default plausible one (e.g. London, United Kingdom). "
        f"Also create a short, catchy 2-word title for the encounter card. "
        f"Output the city in <CITY></CITY> tags, the country/state in <COUNTRY></COUNTRY> tags, and the title in <TITLE></TITLE> tags. "
        f"Example: <CITY>Rio de Janeiro</CITY><COUNTRY>Brazil</COUNTRY><TITLE>Rio Carnaval</TITLE>"
    )

    for text_model in TEXT_MODELS:
        try:
            response = client.models.generate_content(model=text_model, contents=instruction)
            if response and hasattr(response, 'text') and response.text:
                city_m = re.search(r'<CITY>(.*?)</CITY>', response.text, re.IGNORECASE)
                country_m = re.search(r'<COUNTRY>(.*?)</COUNTRY>', response.text, re.IGNORECASE)
                title_m = re.search(r'<TITLE>(.*?)</TITLE>', response.text, re.IGNORECASE)

                if title_m:
                    title = title_m.group(1).strip()
                elif city_m:
                    title = city_m.group(1).strip().title()

                if city_m:
                    city = city_m.group(1).strip()
                    country = country_m.group(1).strip() if country_m else None
                    lat, lng = lookup_coordinates(city, country)
                break
        except Exception as err:
            print(f"[MetadataService] ⚠️ Text model '{text_model}' failed for geo extraction: {err}")

    if not title:
        title = extract_fallback_title(prompt)

    if lat is None or lng is None:
        lat, lng = generate_fallback_coordinates(prompt)

    return lat, lng, title

def generate_verified_subtitle(client: genai.Client, prompt: str, generated_b64: str | None = None) -> str:
    """Inspect the generated image with Gemini Multimodal to create an accurate 1-line subtitle."""
    if not generated_b64:
        return f"Abei seen: {prompt.strip()}"

    try:
        clean_b64 = generated_b64.split(',')[1] if ',' in generated_b64 else generated_b64
        img_bytes = base64.b64decode(clean_b64)
        image_part = types.Part.from_bytes(data=img_bytes, mime_type="image/png")

        vision_instruction = (
            "You are writing a witty 1-line subtitle (max 60 characters) for a retro pixel-art trading card encounter. "
            "Look closely at what is ACTUALLY visible and happening in this image. "
            "Describe Abei (the white polar bear with the red scarf) and what he is doing, his friends, or the action. "
            "Do NOT mention objects, foods, or actions that are not clearly visible in the image. "
            "Output ONLY the subtitle text inside <DESC></DESC> tags. "
            "Example: <DESC>Abei shares a sunset cliffside chill with an alien pal!</DESC>"
        )

        for vision_model in VISION_MODELS:
            try:
                v_res = client.models.generate_content(
                    model=vision_model,
                    contents=[image_part, vision_instruction]
                )
                if v_res and hasattr(v_res, 'text') and v_res.text:
                    v_match = re.search(r'<DESC>(.*?)</DESC>', v_res.text, re.IGNORECASE)
                    if v_match:
                        subtitle = v_match.group(1).strip()
                        print(f"[MetadataService] ✅ Multimodal verified subtitle ({vision_model}): '{subtitle}'")
                        return subtitle
            except Exception as ve:
                print(f"[MetadataService] ⚠️ Vision subtitle generation with '{vision_model}' failed: {ve}")
    except Exception as err:
        print(f"[MetadataService] ⚠️ Failed to decode image for vision inspection: {err}")

    return f"Abei seen: {prompt.strip()}"

def build_sighting_metadata(api_key: str, raw_prompt: str, generated_b64: str | None = None) -> dict:
    """Assemble the complete sighting dictionary conforming to the Abei Tracker schema."""
    client = genai.Client(api_key=api_key)
    clean_id = sanitize_sighting_id(raw_prompt)

    lat, lng, title = extract_location_and_title(client, raw_prompt)
    subtitle = generate_verified_subtitle(client, raw_prompt, generated_b64)

    return {
        "id": clean_id,
        "title": title,
        "subtitle": subtitle,
        "lat": lat,
        "lng": lng,
        "image": f"/scenes/{clean_id}.png",
        "status": "CONFIRMED",
        "createdOn": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
