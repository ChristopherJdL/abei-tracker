"""
Main entry point for AWS Lambda #1 (Gemini Image Generator).
Orchestrates prompt enrichment, image generation, geocoding, S3 upload, and committer invocation.
"""

import os
import traceback
from typing import NamedTuple

from modules.http_utils import (
    build_response,
    parse_event_body,
    is_cors_preflight,
)
from modules.prompt_service import enrich_prompt
from modules.image_service import load_reference_part, generate_image
from modules.metadata_service import build_sighting_metadata
from modules.storage_service import store_scene_if_configured
from modules.committer_client import invoke_github_committer


class RequestContext(NamedTuple):
    """Encapsulates validated input parameters for the generation pipeline."""
    prompt: str
    api_key: str
    github_token: str
    reference_image: str | None


def validate_and_parse_inputs(event: dict) -> RequestContext:
    """Extract and validate required parameters from the incoming event."""
    body = parse_event_body(event)
    raw_prompt = body.get('prompt', '').strip()
    api_key = body.get('api_key') or os.environ.get('GEMINI_API_KEY')
    github_token = body.get('github_token') or os.environ.get('GITHUB_TOKEN')

    if not raw_prompt:
        raise ValueError("Missing 'prompt' in request payload.")
    if not api_key:
        raise ValueError("Missing Gemini API Key.")
    if not github_token:
        raise ValueError("Missing GitHub Token.")

    return RequestContext(
        prompt=raw_prompt,
        api_key=api_key,
        github_token=github_token,
        reference_image=body.get('reference_image'),
    )


def lambda_handler(event, context):
    """
    AWS Lambda handler for generating Abei sightings.
    Steps:
      1. Handle CORS preflight (OPTIONS).
      2. Parse and validate inputs.
      3. Enrich raw user prompt into a 16-bit pixel-art prompt.
      4. Generate scene image using Gemini models.
      5. Extract geocoding coordinates, encounter title, and image-verified subtitle.
      6. Upload scene to private S3 bucket and construct CloudFront CDN URL (if configured).
      7. Trigger downstream GitHub Committer Lambda.
      8. Return HTTP 200 with sighting metadata and image preview.
    """
    if is_cors_preflight(event):
        return build_response(200, {'status': 'ok'})

    try:
        print("[Generator] 🚀 Processing incoming sighting request...")
        ctx = validate_and_parse_inputs(event)

        # 1. Enrich prompt using Gemini text models
        enhanced_prompt = enrich_prompt(ctx.api_key, ctx.prompt)

        # 2. Load character reference (types.Part)
        ref_part = load_reference_part(ctx.reference_image)

        # 3. Generate 16-bit scene image
        generated_b64 = generate_image(ctx.api_key, enhanced_prompt, ref_part)

        # 4. Extract geocoding coordinates, title, and image-verified subtitle
        sighting = build_sighting_metadata(ctx.api_key, ctx.prompt, generated_b64)

        # 5. Store to S3 / CloudFront CDN if configured
        committer_b64 = store_scene_if_configured(sighting, generated_b64)

        # 6. Trigger downstream Git committer
        invoke_github_committer(sighting, committer_b64, ctx.github_token)

        # 7. Respond with success
        return build_response(200, {
            'success': True,
            'message': 'Image generated and queued for commit.',
            'sighting': sighting,
            'image_preview': f"data:image/png;base64,{generated_b64[:100]}...",
        })

    except ValueError as val_err:
        print(f"[Generator Validation Error] ❌ {val_err}")
        return build_response(400, {'success': False, 'error': str(val_err)})
    except Exception as err:
        error_trace = traceback.format_exc()
        print(f"[Generator Fatal Error] 💥 {err}\n{error_trace}")
        return build_response(500, {
            'success': False,
            'error': str(err),
            'error_type': type(err).__name__,
            'traceback': error_trace,
        })

