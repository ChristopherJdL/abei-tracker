import json
import base64
import os
import io
import datetime
import traceback
import random
import boto3
from google import genai
from PIL import Image

def build_cors_headers():
    return {
        'Content-Type': 'application/json'
    }

def build_response(status_code: int, body_data: dict):
    return {
        'statusCode': status_code,
        'headers': build_cors_headers(),
        'body': json.dumps(body_data)
    }

def parse_event_body(event: dict) -> dict:
    body_str = event.get('body', '{}')
    if event.get('isBase64Encoded', False):
        body_str = base64.b64decode(body_str).decode('utf-8')
    return json.loads(body_str)

def decode_reference_image(b64_str: str):
    if not b64_str:
        return None
    try:
        if ',' in b64_str:
            b64_str = b64_str.split(',')[1]
        image_data = base64.b64decode(b64_str)
        return Image.open(io.BytesIO(image_data))
    except Exception as e:
        print(f"[Warning] Failed to decode reference image: {str(e)}")
        return None

def get_default_reference_image():
    """Load packaged abei.png from local execution directory."""
    local_path = os.path.join(os.path.dirname(__file__), 'abei.png')
    if os.path.exists(local_path):
        try:
            print(f"[Info] Loading default Abei reference image from '{local_path}'")
            return Image.open(local_path)
        except Exception as e:
            print(f"[Warning] Failed to load default abei.png from disk: {str(e)}")
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

def generate_gemini_image(api_key: str, prompt: str, ref_image=None) -> str:
    client = genai.Client(api_key=api_key)
    
    # 1. Try Imagen 3 model via generate_images
    try:
        print(f"[Info] Attempting image generation with 'imagen-3.0-generate-002'...")
        result = client.models.generate_images(
            model='imagen-3.0-generate-002',
            prompt=prompt,
            config=dict(
                number_of_images=1,
                aspect_ratio="4:3",
                output_mime_type="image/png"
            )
        )
        if result and hasattr(result, 'generated_images') and result.generated_images:
            img_bytes = result.generated_images[0].image.image_bytes
            print("[Info] Successfully generated image with 'imagen-3.0-generate-002'")
            return base64.b64encode(img_bytes).decode('utf-8')
    except Exception as e:
        print(f"[Warning] Imagen 3 generate_images failed: {str(e)}. Falling back to generate_content...")

    # 2. Fallback to Gemini Multimodal models via generate_content
    fallback_models = ["gemini-2.5-flash", "gemini-2.0-flash"]
    contents = [prompt]
    if ref_image:
        contents.append(ref_image)

    last_error = None
    for model_name in fallback_models:
        try:
            print(f"[Info] Attempting generation with '{model_name}'...")
            response = client.models.generate_content(
                model=model_name,
                contents=contents
            )
            if hasattr(response, 'parts') and response.parts:
                for part in response.parts:
                    if part.inline_data:
                        img_bytes = part.inline_data.data
                        print(f"[Info] Successfully generated image with '{model_name}'")
                        return base64.b64encode(img_bytes).decode('utf-8')
        except Exception as e:
            print(f"[Warning] Model '{model_name}' failed: {str(e)}")
            last_error = e

    raise ValueError(f"All image generation models failed. Last error: {str(last_error)}")

def generate_coordinates(prompt: str):
    """Generate distinct global coordinates deterministically based on prompt string."""
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(prompt))
    rng = random.Random(seed)
    lat = round(rng.uniform(-40.0, 68.0), 4)
    lng = round(rng.uniform(-130.0, 140.0), 4)
    return lat, lng

def build_sighting_metadata(prompt: str) -> dict:
    clean_id = "".join(c if c.isalnum() else "-" for c in prompt.lower()).strip("-")[:30]
    lat, lng = generate_coordinates(prompt)
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
            InvocationType='Event', # Asynchronous trigger
            Payload=json.dumps(payload)
        )
        print(f"[Info] Successfully triggered asynchronous committer Lambda '{committer_lambda}'. Invoke StatusCode: {response.get('StatusCode')}")
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

        # 2. Get Reference Image & Enhance Prompt with AGENTS.md rules
        ref_image = decode_reference_image(body.get('reference_image')) or get_default_reference_image()
        enhanced_prompt = enhance_prompt(raw_prompt)

        # 3. Generate Scene Image with Gemini
        generated_b64 = generate_gemini_image(api_key, enhanced_prompt, ref_image)

        # 4. Create Sighting Metadata & Trigger GitHub Committer
        sighting = build_sighting_metadata(raw_prompt)
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
