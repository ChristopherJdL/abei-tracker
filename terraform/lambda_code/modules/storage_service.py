"""Storage service for saving scenes to S3 and generating CloudFront CDN URLs."""

import os
import base64
import boto3

def upload_scene_to_s3(bucket_name: str, scene_id: str, image_b64: str) -> str:
    """Upload raw image bytes to private S3 bucket with immutable cache headers."""
    clean_b64 = image_b64.split(',')[1] if ',' in image_b64 else image_b64
    img_bytes = base64.b64decode(clean_b64)
    s3_key = f"scenes/{scene_id}.png"

    s3_client = boto3.client('s3')
    print(f"[StorageService] 📦 Uploading scene to s3://{bucket_name}/{s3_key} ({len(img_bytes)} bytes)...")
    s3_client.put_object(
        Bucket=bucket_name,
        Key=s3_key,
        Body=img_bytes,
        ContentType='image/png',
        CacheControl='public, max-age=31536000, immutable',
    )
    print(f"[StorageService] ✅ Successfully uploaded s3://{bucket_name}/{s3_key}")
    return s3_key

def build_cdn_url(cdn_domain: str, s3_key: str) -> str:
    """Construct the public HTTPS CloudFront URL for a given S3 key."""
    return f"https://{cdn_domain.rstrip('/')}/{s3_key.lstrip('/')}"

def store_scene_if_configured(sighting: dict, image_b64: str) -> str | None:
    """
    If S3 bucket and CloudFront domain are set in environment:
    1. Uploads the image to S3.
    2. Updates sighting['image'] to the CloudFront URL.
    3. Returns None so the committer does not upload the image blob to Git.
    Otherwise returns image_b64 for fallback Git storage.
    """
    scenes_bucket = os.environ.get('SCENES_BUCKET')
    cdn_domain = os.environ.get('CDN_DOMAIN')

    if not (scenes_bucket and cdn_domain):
        return image_b64

    try:
        s3_key = upload_scene_to_s3(scenes_bucket, sighting['id'], image_b64)
        cdn_url = build_cdn_url(cdn_domain, s3_key)
        sighting['image'] = cdn_url
        print(f"[StorageService] 🚀 Sighting image pointing to CDN: {cdn_url}")
        return None  # Do not send heavy base64 to committer
    except Exception as err:
        print(f"[StorageService] ⚠️ S3 upload failed, falling back to Git commit: {err}")
        return image_b64
