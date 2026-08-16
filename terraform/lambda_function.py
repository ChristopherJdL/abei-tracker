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
from google import genai
from google.genai import types

def build_cors_headers():
    return {
        'Content-Type': 'application/json'
    }

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
            if ',' in b64_str:
                b64_str = b64_str.split(',')[1]
            img_bytes = base64.b64decode(b64_str)
            return types.Part.from_bytes(data=img_bytes, mime_type="image/png")
        except Exception as e:
            print(f"[Warning] Failed to decode base64 reference image: {str(e)}")

    # Load local packaged abei.png
    local_path = os.path.join(os.path.dirname(__file__), 'abei.png')
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

def enhance_prompt(raw_prompt: str) -> str:
    """
    Enhances raw user prompt into a 16-bit pixel art scene prompt adhering strictly to AGENTS.md guidelines.
    """
    clean_prompt = raw_prompt.strip()
    enhanced = (
        f"Pixel art 16-bit scene, 4:3 aspect ratio. "
        f"Abei the white polar bear (red scarf, mint green shirt) {clean_prompt}. "
        f"Chunky pixels, thick black outlines, vibrant 16-bit color palette, no watermark, no UI chrome. "
        f"Match Abei style from reference image."
    )
    print(f"[Info] Enhanced Prompt: '{enhanced}'")
    return enhanced

def generate_gemini_image(api_key: str, prompt: str, ref_part=None) -> str:
    """
    Generation Pipeline:
    1. Try direct multimodal image models in sequence with the reference image abei.png (no description intermediate step):
       - gemini-3.1-flash-lite-image
       - gemini-3.1-flash-image
       - gemini-3-pro-image
    2. Fallback (last resort): Gemini 2.5 Flash description expansion + Imagen 3 rendering.
    """
    client = genai.Client(api_key=api_key)

    direct_multimodal_models = [
        "gemini-3.1-flash-lite-image",
        "gemini-3.1-flash-image",
        "gemini-3-pro-image"
    ]

    enhanced_prompt = (
        f"Pixel art 16-bit scene, 4:3 aspect ratio. "
        f"Abei the white polar bear (red scarf, mint green shirt) {prompt.strip()}. "
        f"Chunky pixels, thick black outlines, vibrant 16-bit color palette, no watermark, no UI chrome. "
        f"Match Abei style from reference image."
    )

    contents = [enhanced_prompt]
    if ref_part:
        contents.append(ref_part)

    rejected_models = []

    # 1. Try Direct Multimodal Image Models Chain
    for idx, model_name in enumerate(direct_multimodal_models, start=1):
        if idx > 1:
            print("[Rate Limit Pause] ⏳ Waiting 30 seconds before testing next model to prevent high RPM...")
            time.sleep(30)

        print(f"[Model Attempt {idx}/{len(direct_multimodal_models)}] 🚀 Trying direct multimodal image model: '{model_name}'...")
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=contents
            )

            found_image = False
            if hasattr(response, 'parts') and response.parts:
                for part in response.parts:
                    if hasattr(part, 'inline_data') and part.inline_data and hasattr(part.inline_data, 'data'):
                        img_bytes = part.inline_data.data
                        print(f"[Model Success] ✅ Model '{model_name}' generated image successfully! ({len(img_bytes)} bytes)")
                        return base64.b64encode(img_bytes).decode('utf-8')
                    elif hasattr(part, 'text') and part.text:
                        print(f"[Model Output] Model '{model_name}' returned text instead of inline image data: {part.text[:100]}...")

            if not found_image:
                reason = "Model API returned response without inline_data image bytes (returned text or empty parts)."
                print(f"[Model Rejected] ❌ Model '{model_name}' turned down: {reason}")
                rejected_models.append((model_name, reason))

        except Exception as e:
            error_details = f"API Error [{type(e).__name__}]: {str(e)}"
            print(f"[Model Rejected] ❌ Model '{model_name}' turned down by API: {error_details}")
            rejected_models.append((model_name, error_details))

    # 2. Fallback (Last Resort): Description Expansion + Imagen 3
    print(f"\n[Fallback Triggered] ⚠️ All direct multimodal models failed. Detailed rejection breakdown:")
    for m, r in rejected_models:
        print(f"  - Model '{m}' -> {r}")

    print("[Rate Limit Pause] ⏳ Waiting 30 seconds before fallback prompt expansion...")
    time.sleep(30)

    print("\n[Fallback Step 1] 🔄 Running multimodal prompt expansion...")
    detailed_prompt = enhanced_prompt
    try:
        analysis_contents = [
            f"You are an expert 16-bit pixel art director for a GBA retro game. "
            f"Examine the attached reference image of Abei the white polar bear (red scarf, mint green shirt). "
            f"Write a rich, highly descriptive 16-bit retro pixel art scene prompt for: '{prompt}'.\n\n"
            f"Directives:\n"
            f"- Aspect ratio: 4:3 widescreen retro composition.\n"
            f"- Character: Abei the polar bear with his iconic red scarf and mint green shirt, cute expression, readable at card size.\n"
            f"- Setting & Action: Render iconic landmarks, specific brand packaging, local props, and humorous atmosphere for '{prompt}'.\n"
            f"- Art style: 16-bit GBA pixel art graphics, chunky pixels, rich vibrant color palette, thick black outlines, dramatic lighting, no text UI chrome, no watermarks."
        ]
        if ref_part:
            analysis_contents.append(ref_part)

        analysis = None
        for text_model in ["gemini-3.5-flash", "gemini-1.5-flash"]:
            try:
                print(f"[Fallback Step 1] Trying text model '{text_model}'...")
                analysis = client.models.generate_content(
                    model=text_model,
                    contents=analysis_contents
                )
                break
            except Exception as e:
                print(f"[Fallback Step 1 Warning] Text model '{text_model}' failed: {str(e)}")

        if analysis and hasattr(analysis, 'text') and analysis.text:
            detailed_prompt = f"Pixel art 16-bit scene, 4:3 aspect ratio. {analysis.text.strip()} Chunky pixels, thick black outlines, vibrant 16-bit colors."
            print(f"[Fallback Step 1 Success] ✅ Gemini 2.5 Flash enhanced prompt: '{detailed_prompt[:120]}...'")
    except Exception as e:
        print(f"[Fallback Step 1 Warning] ⚠️ Gemini 2.5 Flash analysis skipped: API Error [{type(e).__name__}]: {str(e)}")

    print("[Rate Limit Pause] ⏳ Waiting 30 seconds before fallback image rendering...")
    time.sleep(30)

    print("[Fallback Step 2] 🎨 Attempting final image rendering with 'gemini-2.5-flash-image'...")
    fallback_model = "gemini-2.5-flash-image"
    try:
        fb_response = client.models.generate_content(
            model=fallback_model,
            contents=[detailed_prompt]
        )
        if hasattr(fb_response, 'parts') and fb_response.parts:
            for part in fb_response.parts:
                if hasattr(part, 'inline_data') and part.inline_data and hasattr(part.inline_data, 'data'):
                    img_bytes = part.inline_data.data
                    print(f"[Fallback Success] ✅ Successfully rendered image via fallback '{fallback_model}'! ({len(img_bytes)} bytes)")
                    return base64.b64encode(img_bytes).decode('utf-8')
        reason = f"Fallback model '{fallback_model}' returned no inline_data image bytes."
        print(f"[Fallback Rejected] ❌ '{fallback_model}' turned down: {reason}")
        rejected_models.append((fallback_model, reason))
    except Exception as e:
        error_details = f"API Error [{type(e).__name__}]: {str(e)}"
        print(f"[Fallback Rejected] ❌ '{fallback_model}' turned down by API: {error_details}")
        rejected_models.append((fallback_model, error_details))

    summary_errors = "\n".join(f"• {m}: {r}" for m, r in rejected_models)
    raise ValueError(f"All image generation models failed. Last error details:\n{summary_errors}")

def generate_coordinates(api_key: str, prompt: str):
    """Generate distinct global coordinates based on prompt string using Gemini."""
    try:
        client = genai.Client(api_key=api_key)
        response = None
        for text_model in ["gemini-3.5-flash", "gemini-1.5-flash"]:
            try:
                response = client.models.generate_content(
                    model=text_model,
                    contents=f"Extract the real-world city mentioned in this prompt: '{prompt}'. If no obvious city is found, pick a default plausible one (e.g. London). Output ONLY the city name wrapped in <CITY></CITY> tags. Example: <CITY>Rio de Janeiro</CITY>."
                )
                break
            except Exception as e:
                print(f"[Warning] Text model '{text_model}' failed in generate_coordinates: {str(e)}")

        if response and hasattr(response, 'text') and response.text:
            match = re.search(r'<CITY>(.*?)</CITY>', response.text, re.IGNORECASE)
            if match:
                city_name = match.group(1).strip()
                print(f"[Info] Extracted city from LLM: {city_name}")
                try:
                    csv_path = os.path.join(os.path.dirname(__file__), 'cities.csv')
                    found_lat, found_lng = None, None
                    with open(csv_path, 'r', encoding='utf-8') as f:
                        reader = csv.DictReader(f)
                        for row in reader:
                            if row['city'] == city_name.lower():
                                found_lat = round(float(row['lat']), 4)
                                found_lng = round(float(row['lng']), 4)
                                break
                    if found_lat is not None:
                        print(f"[Info] Found coordinates for {city_name} in local CSV: lat={found_lat}, lng={found_lng}")
                        return found_lat, found_lng
                    else:
                        print(f"[Warning] City '{city_name}' not found in local CSV.")
                except Exception as ex:
                    print(f"[Error] Failed to read local CSV for city '{city_name}': {str(ex)}")
            else:
                print(f"[Warning] No <CITY> tag found in LLM response: {response.text}")
    except Exception as e:
        print(f"[Warning] Failed to generate coordinates via Gemini: {str(e)}")

    # Fallback to deterministic random if LLM fails
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(prompt))
    rng = random.Random(seed)
    lat = round(rng.uniform(-40.0, 68.0), 4)
    lng = round(rng.uniform(-130.0, 140.0), 4)
    print(f"[Info] Generated fallback coordinates: lat={lat}, lng={lng}")
    return lat, lng

def build_sighting_metadata(api_key: str, prompt: str) -> dict:
    clean_id = "".join(c if c.isalnum() else "-" for c in prompt.lower()).strip("-")[:30]
    lat, lng = generate_coordinates(api_key, prompt)
    return {
        "id": clean_id,
        "title": prompt.strip().title()[:30],
        "subtitle": f"Abei seen: {prompt.strip()}",
        "lat": lat,
        "lng": lng,
        "image": f"/scenes/{clean_id}.png",
        "status": "CONFIRMED",
        "createdOn": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

def trigger_github_committer(sighting: dict, image_b64: str, github_token: str):
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
            InvocationType='RequestResponse', # Synchronous trigger (6MB payload limit instead of 1MB)
            Payload=json.dumps(payload)
        )
        print(f"[Info] Successfully triggered synchronous committer Lambda '{committer_lambda}'. Invoke StatusCode: {response.get('StatusCode')}")
    except Exception as err:
        print(f"[Error] Failed to invoke committer Lambda '{committer_lambda}': {str(err)}")
        raise RuntimeError(f"Committer Lambda invocation failed: {str(err)}") from err

def lambda_handler(event, context):
    # Handle CORS OPTIONS preflight
    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return build_response(200, {'status': 'ok'})

    try:
        print(f"[Info] Received Lambda invocation event: {json.dumps(event)}")
        
        # 1. Parse Inputs
        body = parse_event_body(event)
        raw_prompt = body.get('prompt')
        api_key = body.get('api_key') or os.environ.get('GEMINI_API_KEY')
        github_token = body.get('github_token') or os.environ.get('GITHUB_TOKEN')

        if not raw_prompt:
            return build_response(400, {
                'success': False,
                'error': 'Missing required parameter: prompt'
            })

        if not api_key:
            return build_response(400, {
                'success': False,
                'error': 'Missing Gemini API Key in environment variable GEMINI_API_KEY'
            })

        if not github_token:
            return build_response(400, {
                'success': False,
                'error': 'Missing GitHub Token in environment variable GITHUB_TOKEN'
            })

        # 2. Get Reference Image Part & Enhance Prompt with AGENTS.md rules
        ref_part = get_reference_part(body.get('reference_image'))
        enhanced_prompt = enhance_prompt(raw_prompt)

        # 3. Generate Scene Image with Gemini
        generated_b64 = generate_gemini_image(api_key, enhanced_prompt, ref_part)

        # 4. Create Sighting Metadata & Trigger GitHub Committer
        sighting = build_sighting_metadata(api_key, raw_prompt)
        trigger_github_committer(sighting, generated_b64, github_token)

        # 5. Return Immediate Detailed Success
        return build_response(200, {
            'success': True,
            'message': 'Image successfully generated and queued for GitHub commit.',
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
