#!/usr/bin/env python3
"""
Script de migration des scènes Abei existantes vers S3 + CloudFront CDN.
Usage:
    python3 scripts/migrate_scenes_to_s3.py --bucket abei-tracker-scenes-eu-west-2 --cdn d12345abcdef.cloudfront.net [--apply]
"""

import os
import json
import argparse
import boto3

def migrate_scenes(bucket_name: str, cdn_domain: str, apply_changes: bool = False):
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    scenes_dir = os.path.join(project_root, 'public', 'scenes')
    locations_path = os.path.join(project_root, 'public', 'locations.json')

    if not os.path.exists(scenes_dir):
        print(f"[Erreur] Le dossier des scènes n'existe pas : {scenes_dir}")
        return

    s3_client = boto3.client('s3') if apply_changes else None
    cdn_base_url = f"https://{cdn_domain.rstrip('/')}"

    # 1. Upload des images vers S3
    png_files = [f for f in os.listdir(scenes_dir) if f.endswith('.png')]
    print(f"[Info] {len(png_files)} scènes trouvées dans {scenes_dir}")

    for idx, filename in enumerate(png_files, start=1):
        file_path = os.path.join(scenes_dir, filename)
        s3_key = f"scenes/{filename}"
        
        print(f"[{idx}/{len(png_files)}] Uploading {filename} -> s3://{bucket_name}/{s3_key}...")
        if apply_changes and s3_client:
            with open(file_path, 'rb') as f:
                s3_client.put_object(
                    Bucket=bucket_name,
                    Key=s3_key,
                    Body=f.read(),
                    ContentType='image/png',
                    CacheControl='public, max-age=31536000, immutable'
                )

    # 2. Mise à jour de locations.json
    with open(locations_path, 'r', encoding='utf-8') as f:
        locations = json.load(f)

    updated_count = 0
    for sighting in locations:
        current_img = sighting.get('image', '')
        filename = current_img.split('/').pop()
        clean_uri = f"/scenes/{filename}"
        if current_img != clean_uri:
            sighting['image'] = clean_uri
            updated_count += 1

    print(f"\n[Info] {updated_count} chemins d'image normalisés en URI relative (/scenes/<id>.png)")

    if apply_changes:
        with open(locations_path, 'w', encoding='utf-8') as f:
            json.dump(locations, f, indent=2, ensure_ascii=False)
            f.write('\n')
        print("[Succès] locations.json a été mis à jour avec succès !")

        # Invalidation CloudFront pour rafraîchir le cache
        cf_dist_id = os.environ.get('CLOUDFRONT_DISTRIBUTION_ID', 'EB5D4YJXER6OF')
        try:
            import time
            cf_client = boto3.client('cloudfront')
            print(f"\n[CloudFront] 🔄 Invalidation du cache (/scenes/*) pour {cf_dist_id}...")
            cf_client.create_invalidation(
                DistributionId=cf_dist_id,
                InvalidationBatch={
                    'Paths': {'Quantity': 1, 'Items': ['/scenes/*']},
                    'CallerReference': str(time.time())
                }
            )
            print("[CloudFront] ✅ Invalidation soumise avec succès !")
        except Exception as cf_err:
            print(f"[CloudFront Warning] ⚠️ Invalidation impossible: {cf_err}")
    else:
        print("[Dry-run] Aucun changement écrit. Passez l'argument --apply pour appliquer la migration.")

if __name__ == '__main__':
    default_bucket = os.environ.get('SCENES_BUCKET', 'abei-tracker-scenes-eu-west-2')
    default_cdn = os.environ.get('CDN_DOMAIN', 'd2fvij85scvftm.cloudfront.net')

    parser = argparse.ArgumentParser(description="Migrer les scènes Abei vers S3 + CloudFront")
    parser.add_argument('--bucket', default=default_bucket, help=f"Nom du bucket S3 cible (défaut: {default_bucket})")
    parser.add_argument('--cdn', default=default_cdn, help=f"Domaine CloudFront (défaut: {default_cdn})")
    parser.add_argument('--apply', action='store_true', help="Appliquer réellement les uploads et modifications")

    args = parser.parse_args()
    migrate_scenes(args.bucket, args.cdn, args.apply)
