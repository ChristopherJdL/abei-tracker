import json
import base64
import os
import io
import datetime
import traceback
import random
import time
import boto3
import re
import csv
import unicodedata
from google import genai
from google.genai import types

# ==============================================================================
# 1. Utility & Helper Functions
# ==============================================================================
def build_cors_headers():
    return {'Content-Type': 'application/json'}

def build_response(status_code: int, body_data: dict):
    return {
        'statusCode': status_code,
        'headers': build_cors_headers(),
        'body': json.dumps(body_data),
        'isBase64Encoded': False
    }

def parse_event_body(event: dict) -> dict:
    body_str = event.get('body', '{}')
    if event.get('isBase64Encoded', False):
        body_str = base64.b64decode(body_str).decode('utf-8')
    return json.loads(body_str)

def get_reference_part(b64_str: str = None):
    """Load reference image as google.genai types.Part from base64 or local abei.png."""
    if b64_str:
        try:
            clean_b64 = b64_str.split(',')[1] if ',' in b64_str else b64_str
            img_bytes = base64.b64decode(clean_b64)
            return types.Part.from_bytes(data=img_bytes, mime_type="image/png")
        except Exception as e:
            print(f"[Warning] Failed to decode base64 reference image: {str(e)}")

    local_path = os.path.join(os.path.dirname(__file__), 'assets', 'abei.png')
    if os.path.exists(local_path):
        try:
            with open(local_path, 'rb') as f:
                img_bytes = f.read()
            print(f"[Info] Successfully loaded abei.png ({len(img_bytes)} bytes) as types.Part")
            return types.Part.from_bytes(data=img_bytes, mime_type="image/png")
        except Exception as e:
            print(f"[Warning] Failed to load local abei.png: {str(e)}")
    else:
        print(f"[Warning] abei.png not found at '{local_path}'")
    return None

# ==============================================================================
# 2. AI Prompt Generation & Enrichment
# ==============================================================================
def enrich_prompt_for_image_generation(api_key: str, raw_prompt: str) -> str:
    """
    Use Gemini text models to expand the raw prompt into a cinematic, 
    coherent pixel-art scene without deformations.
    """
    client = genai.Client(api_key=api_key)
    prompt_instructions = (
        f"You are an expert 16-bit pixel art director for a GBA retro game. "
        f"The user wants to see Abei (a white polar bear with a red scarf and mint green shirt) doing the following: '{raw_prompt}'.\n"
        f"Write a rich, highly descriptive prompt to generate this image.\n"
        f"CRITICAL DIRECTIVES:\n"
        f"- Visually coherent & Cinematic: Frame it like a cinematic cutscene, beautiful lighting.\n"
        f"- Local elements: Add typical props, architecture, or atmosphere matching the location mentioned.\n"
        f"- NO DEFORMATION: Abei must remain a perfectly proportioned cute polar bear. Do not deform his anatomy. He does NOT have eyebrows.\n"
        f"- Art style: 16-bit GBA pixel art graphics, chunky pixels, rich vibrant color palette, thick black outlines, no text UI chrome, no watermarks.\n"
        f"Output ONLY the final image generation prompt."
    )
    
    print("[Info] Enriching prompt with generative AI...")
    for text_model in ["gemini-3.5-flash", "gemini-1.5-flash"]:
        try:
            response = client.models.generate_content(
                model=text_model,
                contents=prompt_instructions
            )
            if response and hasattr(response, 'text') and response.text:
                enhanced = f"Pixel art 16-bit scene, 4:3 aspect ratio. Abei the white polar bear (red scarf, mint green shirt). {response.text.strip()}"
                print(f"[Info] AI Enhanced Prompt ({text_model}): '{enhanced[:150]}...'")
                return enhanced
        except Exception as e:
            print(f"[Warning] Prompt enrichment with '{text_model}' failed: {str(e)}")
            
    # Fallback if both text models fail
    clean_prompt = raw_prompt.strip()
    fallback_enhanced = (
        f"Pixel art 16-bit scene, 4:3 aspect ratio. "
        f"Abei the white polar bear (red scarf, mint green shirt) {clean_prompt}. "
        f"Chunky pixels, thick black outlines, vibrant 16-bit color palette, cinematic lighting, strictly no character deformation, and Abei does not have eyebrows."
    )
    print("[Warning] Falling back to standard prompt enhancement.")
    return fallback_enhanced

# ==============================================================================
# 3. AI Image Generation
# ==============================================================================
def try_direct_multimodal_models(client, enhanced_prompt: str, ref_part) -> str:
    """Attempt direct multimodal generation with gemini image models."""
    models = ["gemini-3.1-flash-lite-image", "gemini-3.1-flash-image", "gemini-3-pro-image"]
    contents = [enhanced_prompt]
    if ref_part:
        contents.append(ref_part)

    rejected_models = []
    for idx, model_name in enumerate(models, start=1):
        if idx > 1:
            print("[Rate Limit Pause] ⏳ Waiting 30s before testing next model...")
            time.sleep(30)
            
        print(f"[Model Attempt {idx}/{len(models)}] 🚀 Trying: '{model_name}'...")
        try:
            response = client.models.generate_content(model=model_name, contents=contents)
            
            if hasattr(response, 'parts') and response.parts:
                for part in response.parts:
                    if hasattr(part, 'inline_data') and part.inline_data and hasattr(part.inline_data, 'data'):
                        img_bytes = part.inline_data.data
                        print(f"[Success] ✅ Model '{model_name}' generated image ({len(img_bytes)} bytes)")
                        return base64.b64encode(img_bytes).decode('utf-8')
                        
            reason = "Returned response without inline_data image bytes."
            print(f"[Rejected] ❌ '{model_name}' failed: {reason}")
            rejected_models.append((model_name, reason))
        except Exception as e:
            err = f"API Error [{type(e).__name__}]: {str(e)}"
            print(f"[Rejected] ❌ '{model_name}': {err}")
            rejected_models.append((model_name, err))
            
    return None

def try_imagen_fallback(client, enhanced_prompt: str) -> str:
    """Fallback to Gemini 2.5 Flash Image."""
    print("[Rate Limit Pause] ⏳ Waiting 30s before fallback image rendering...")
    time.sleep(30)
    
    fallback_model = "gemini-2.5-flash-image"
    print(f"[Fallback] 🎨 Attempting final image rendering with '{fallback_model}'...")
    try:
        response = client.models.generate_content(
            model=fallback_model,
            contents=[enhanced_prompt]
        )
        if hasattr(response, 'parts') and response.parts:
            for part in response.parts:
                if hasattr(part, 'inline_data') and part.inline_data and hasattr(part.inline_data, 'data'):
                    img_bytes = part.inline_data.data
                    print(f"[Fallback Success] ✅ Successfully rendered image via '{fallback_model}'!")
                    return base64.b64encode(img_bytes).decode('utf-8')
                    
        print(f"[Fallback Rejected] ❌ '{fallback_model}' returned no inline_data image bytes.")
    except Exception as e:
        print(f"[Fallback Rejected] ❌ '{fallback_model}' API Error: {str(e)}")
        
    raise ValueError("All image generation models (including fallback) failed.")

def generate_gemini_image(api_key: str, enhanced_prompt: str, ref_part=None) -> str:
    """Main image generation pipeline orchestration."""
    client = genai.Client(api_key=api_key)
    
    # 1. Try Direct Multimodal Models
    b64_image = try_direct_multimodal_models(client, enhanced_prompt, ref_part)
    if b64_image:
        return b64_image
        
    # 2. Fallback
    print("\n[Fallback Triggered] ⚠️ All direct multimodal models failed.")
    return try_imagen_fallback(client, enhanced_prompt)

# ==============================================================================
# 4. Metadata Extraction
# ==============================================================================
_CACHED_CITIES = None

def get_cities_dataset():
    """Load and cache cities dataset from local CSV."""
    global _CACHED_CITIES
    if _CACHED_CITIES is not None:
        return _CACHED_CITIES

    csv_path = os.path.join(os.path.dirname(__file__), 'assets', 'cities.csv')
    cities = []
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                cities.append(row)
        _CACHED_CITIES = cities
        print(f"[Info] Successfully loaded {_CACHED_CITIES.__len__()} cities from CSV into memory cache.")
    except Exception as ex:
        print(f"[Error] Failed to read local CSV: {str(ex)}")
        _CACHED_CITIES = []
    return _CACHED_CITIES

def normalize_geo_string(s: str) -> str:
    """Strip accents and lowercase a geographic string for resilient matching."""
    if not s:
        return ''
    n = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('utf-8')
    return n.lower().strip()

def extract_fallback_title_from_prompt(prompt: str) -> str:
    """Scan the prompt for any known city in cities.csv to use as a fallback title. If none found, fall back to first two words of the prompt."""
    prompt_norm = normalize_geo_string(prompt)
    cities = get_cities_dataset()
    longest_match = ""
    for row in cities:
        city = row['city']
        if len(city) > 3 and city in prompt_norm:
            if len(city) > len(longest_match):
                longest_match = city
    if longest_match:
        return longest_match.title()

    # Fallback: use the first two words of the prompt as title
    words = prompt.strip().split()
    return " ".join(words[:2]) if words else "Unknown Location"

def lookup_coordinates_in_csv(city_name: str, country_or_state: str = None):
    """
    Lookup latitude and longitude for a city in the local CSV file.
    The CSV is pre-sorted by population in descending order.
    1. If country_or_state is provided, matches city AND (country / country_code / state).
    2. Fallback matches city alone (highest population worldwide wins).
    """
    cq = normalize_geo_string(city_name)
    cos = normalize_geo_string(country_or_state) if country_or_state else None
    cities = get_cities_dataset()

    # 1. Attempt match on both city AND country/state
    if cos:
        for row in cities:
            if row['city'] == cq:
                r_country = row.get('country', '')
                r_cc = row.get('country_code', '').lower()
                r_state = row.get('state', '')
                if (cos in r_country or 
                    cos == r_cc or 
                    cos in r_state or 
                    r_country in cos):
                    print(f"[Info] Geocode match: '{city_name}' in '{country_or_state}' -> {row['city']}, {r_country} ({row['lat']}, {row['lng']}, pop: {row.get('population', 'N/A')})")
                    return round(float(row['lat']), 4), round(float(row['lng']), 4)

    # 2. Fallback: match city only (highest population match wins)
    for row in cities:
        if row['city'] == cq:
            print(f"[Info] Geocode fallback (highest pop): '{city_name}' -> {row['city']}, {row.get('country', '')} ({row['lat']}, {row['lng']}, pop: {row.get('population', 'N/A')})")
            return round(float(row['lat']), 4), round(float(row['lng']), 4)

    return None, None

def generate_metadata_extras(api_key: str, prompt: str):
    """Generate global coordinates and a witty subtitle based on raw prompt."""
    client = genai.Client(api_key=api_key)
    for text_model in ["gemini-3.5-flash", "gemini-1.5-flash"]:
        try:
            instruction = (
                f"Extract the real-world city AND country (or state) mentioned in this prompt: '{prompt}'. "
                f"If no obvious city is found, pick a default plausible one (e.g. London, United Kingdom). "
                f"Also write a witty, punchy 1-line subtitle (max 60 chars) for a trading card describing what Abei is doing. "
                f"Finally, create a short, catchy 2-word title for the encounter card. "
                f"Output the city in <CITY></CITY> tags, the country/state in <COUNTRY></COUNTRY> tags, the subtitle in <DESC></DESC> tags, and the title in <TITLE></TITLE> tags. "
                f"Example: <CITY>Rio de Janeiro</CITY><COUNTRY>Brazil</COUNTRY><DESC>Abei dances the samba in bright neon feathers!</DESC><TITLE>Rio Carnaval</TITLE>"
            )
            response = client.models.generate_content(model=text_model, contents=instruction)
            
            if response and hasattr(response, 'text') and response.text:
                city_match = re.search(r'<CITY>(.*?)</CITY>', response.text, re.IGNORECASE)
                country_match = re.search(r'<COUNTRY>(.*?)</COUNTRY>', response.text, re.IGNORECASE)
                desc_match = re.search(r'<DESC>(.*?)</DESC>', response.text, re.IGNORECASE)
                title_match = re.search(r'<TITLE>(.*?)</TITLE>', response.text, re.IGNORECASE)
                
                subtitle = desc_match.group(1).strip() if desc_match else f"Abei seen: {prompt.strip()}"
                title = title_match.group(1).strip() if title_match else (city_match.group(1).strip().title() if city_match else extract_fallback_title_from_prompt(prompt))
                
                if city_match:
                    city_name = city_match.group(1).strip()
                    country_name = country_match.group(1).strip() if country_match else None
                    print(f"[Info] Extracted city: '{city_name}' | Country: '{country_name}' | Title: '{title}' | Subtitle: '{subtitle}'")
                    lat, lng = lookup_coordinates_in_csv(city_name, country_name)
                    if lat is not None and lng is not None:
                        return lat, lng, subtitle, title
                    print(f"[Warning] City '{city_name}' (country: '{country_name}') not found in CSV.")
                break
        except Exception as e:
            print(f"[Warning] Text model '{text_model}' failed for metadata extraction: {str(e)}")

    # Fallback to random coordinates
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(prompt))
    rng = random.Random(seed)
    lat = round(rng.uniform(-40.0, 68.0), 4)
    lng = round(rng.uniform(-130.0, 140.0), 4)
    print(f"[Info] Generated fallback coordinates: lat={lat}, lng={lng}")
    title_fallback = extract_fallback_title_from_prompt(prompt)
    return lat, lng, f"Abei seen: {prompt.strip()}", title_fallback

def build_sighting_metadata(api_key: str, raw_prompt: str) -> dict:
    """Build the final sighting dictionary to be committed."""
    clean_id = "".join(c if c.isalnum() else "-" for c in raw_prompt.lower()).strip("-")[:30]
    lat, lng, subtitle, title = generate_metadata_extras(api_key, raw_prompt)
    return {
        "id": clean_id,
        "title": title,
        "subtitle": subtitle,
        "lat": lat,
        "lng": lng,
        "image": f"/scenes/{clean_id}.png",
        "status": "CONFIRMED",
        "createdOn": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

# ==============================================================================
# 5. External Services (GitHub)
# ==============================================================================
def trigger_github_committer(sighting: dict, image_b64: str, github_token: str):
    """Invoke the synchronous Lambda that commits to GitHub."""
    committer_lambda = os.environ.get('GITHUB_COMMITTER_LAMBDA_NAME', 'github-committer')
    try:
        lambda_client = boto3.client('lambda')
        payload = {
            'image_b64': image_b64,
            'sighting': sighting,
            'github_token': github_token
        }
        response = lambda_client.invoke(
            FunctionName=committer_lambda,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        print(f"[Info] Triggered committer Lambda '{committer_lambda}'. StatusCode: {response.get('StatusCode')}")
    except Exception as err:
        raise RuntimeError(f"Committer Lambda invocation failed: {str(err)}") from err

# ==============================================================================
# 6. Main Orchestrator (Lambda Handler)
# ==============================================================================
def lambda_handler(event, context):
    # Handle CORS OPTIONS preflight
    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return build_response(200, {'status': 'ok'})

    try:
        print(f"[Info] Received Lambda invocation event.")
        
        # 1. Parse & Validate Inputs
        body = parse_event_body(event)
        raw_prompt = body.get('prompt')
        api_key = body.get('api_key') or os.environ.get('GEMINI_API_KEY')
        github_token = body.get('github_token') or os.environ.get('GITHUB_TOKEN')

        if not raw_prompt:
            return build_response(400, {'success': False, 'error': 'Missing prompt'})
        if not api_key:
            return build_response(400, {'success': False, 'error': 'Missing Gemini API Key'})
        if not github_token:
            return build_response(400, {'success': False, 'error': 'Missing GitHub Token'})

        # 2. AI Prompt Enrichment (New Step)
        enhanced_prompt = enrich_prompt_for_image_generation(api_key, raw_prompt)

        # 3. Load Reference Image
        ref_part = get_reference_part(body.get('reference_image'))

        # 4. Generate Image
        generated_b64 = generate_gemini_image(api_key, enhanced_prompt, ref_part)

        # 5. Extract Metadata & Commit
        sighting = build_sighting_metadata(api_key, raw_prompt)
        trigger_github_committer(sighting, generated_b64, github_token)

        # 6. Return Success
        return build_response(200, {
            'success': True,
            'message': 'Image generated and queued for commit.',
            'sighting': sighting,
            'image_preview': f"data:image/png;base64,{generated_b64[:100]}..."
        })

    except Exception as err:
        error_trace = traceback.format_exc()
        print(f"[Fatal Error] {str(err)}\n{error_trace}")
        return build_response(500, {
            'success': False,
            'error': str(err),
            'error_type': type(err).__name__,
            'traceback': error_trace
        })
