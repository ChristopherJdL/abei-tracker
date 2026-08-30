# Plan de Migration S3 + CloudFront CDN (Free Tier) & Script de Migration

Ce document détaille la stratégie pour déporter l'hébergement des scènes pixel-art d'Abei depuis le dépôt Git/Vercel vers une architecture **AWS S3 + CloudFront CDN** optimisée pour le **Free Tier**, ainsi que le script de migration et les impacts sur les Lambdas.

---

## 1. Analyse du Free Tier AWS & Optimisation des Coûts

AWS propose un modèle de gratuité très généreux parfaitement adapté à ce projet :

| Service | Quota Gratuit (Free Tier) | Usage Abei Tracker estimé | Coût estimé |
| :--- | :--- | :--- | :--- |
| **Amazon CloudFront** | **1 To / mois** de transfert sortant + **10 000 000 requêtes HTTPS / mois** (*Always Free*) | < 5 Go / mois et ~50 000 requêtes | **0,00 $ (Gratuit à vie)** |
| **Amazon S3** | **5 Go de stockage standard** (12 mois) + **20 000 requêtes GET**, 2 000 PUT | ~50 Mo de PNGs, ~100 PUTs/mois (les lectures passent par le CDN) | **0,00 $** (puis < 0,01 $/mois après 1 an) |
| **AWS Lambda** | **1 000 000 invocations / mois** + 3,2M secondes de calcul (*Always Free*) | ~50-200 créations d'images / mois | **0,00 $ (Gratuit à vie)** |

> [!TIP]
> En plaçant **CloudFront devant S3** avec un cache agressif (`Cache-Control: public, max-age=31536000, immutable`), les requêtes utilisateurs frappent les serveurs Edge de CloudFront (100% gratuit jusqu'à 1 To/mois) et ne consomment quasiment aucune requête GET sur S3.

---

## 2. Architecture Cible

```mermaid
flowchart TD
    subgraph Client ["Client / Navigateur"]
        UI["Abei Tracker SPA (Vercel)"]
    end

    subgraph CDN ["Distribution CDN (Free Tier)"]
        CF["AWS CloudFront (*.cloudfront.net)"]
    end

    subgraph Storage ["Stockage Privé S3"]
        S3["S3 Bucket: abei-tracker-scenes\n(Accès restreint par OAC)"]
    end

    subgraph Lambdas ["Génération & Déploiement"]
        L1["Lambda #1: Image Generator\n(Gemini 2.5 / 3.1)"]
        L2["Lambda #2: GitHub Committer\n(Met à jour locations.json)"]
    end

    UI -->|1. Demande de création| L1
    L1 -->|2. Génère image & Sauvegarde S3| S3
    L1 -->|3. Transmet URL CDN| L2
    L2 -->|4. Commit Git léger (locations.json uniquement)| UI
    UI -->|5. Charge images haute vitesse| CF
    CF -->|Cache Miss| S3
```

---

## 3. Infrastructure Terraform (`terraform/main.tf`)

Ressources à ajouter dans Terraform pour créer le bucket privé S3 et la distribution CloudFront avec Origin Access Control (OAC) :

```hcl
# ==========================================
# S3 Bucket pour les scènes d'Abei
# ==========================================
resource "aws_s3_bucket" "scenes_bucket" {
  bucket = "abei-tracker-scenes-${var.aws_region}"
}

resource "aws_s3_bucket_public_access_block" "scenes_pab" {
  bucket = aws_s3_bucket.scenes_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ==========================================
# CloudFront Origin Access Control (OAC)
# ==========================================
resource "aws_cloudfront_origin_access_control" "s3_oac" {
  name                              = "abei-scenes-oac"
  description                       = "OAC pour le bucket S3 des scènes Abei"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ==========================================
# CloudFront CDN Distribution
# ==========================================
resource "aws_cloudfront_distribution" "scenes_cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Abei Tracker Scenes CDN"
  default_root_object = ""
  price_class         = "PriceClass_100" # Couvre US, Canada, Europe (Free Tier le plus économique)

  origin {
    domain_name              = aws_s3_bucket.scenes_bucket.bucket_regional_domain_name
    origin_id                = "S3-abei-tracker-scenes"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-abei-tracker-scenes"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400      # 1 jour
    max_ttl                = 31536000   # 1 an (images immuables)
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Bucket policy autorisant uniquement CloudFront OAC
resource "aws_s3_bucket_policy" "allow_cloudfront" {
  bucket = aws_s3_bucket.scenes_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipalReadOnly"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.scenes_bucket.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.scenes_cdn.arn
          }
        }
      }
    ]
  })
}

# IAM Policy pour permettre aux Lambdas d'écrire dans le bucket S3
resource "aws_iam_policy" "lambda_s3_write_policy" {
  name        = "gemini-lambda-s3-write-policy"
  description = "Autorise les Lambdas à uploader des scènes dans S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = "${aws_s3_bucket.scenes_bucket.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_s3_write_attach" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_s3_write_policy.arn
}
```

---

## 4. Impact & Actions sur les Lambdas

### A. Lambda #1 (`lambda_function.py`)
1. **Upload direct vers S3** :
   - Dès que l'image est générée (en base64), Lambda décode les octets PNG et effectue un `s3.put_object(Bucket=..., Key=f"scenes/{clean_id}.png", Body=img_bytes, ContentType="image/png", CacheControl="public, max-age=31536000, immutable")`.
2. **Construction de l'URL du sighting** :
   - Le champ `image` dans les métadonnées devient `f"https://{CDN_DOMAIN}/scenes/{clean_id}.png"`.
3. **Transmission à Lambda #2** :
   - Transmet le dictionnaire de sighting mis à jour à Lambda #2.

### B. Lambda #2 (`github_committer.py`)
1. **Suppression de l'upload de gros blobs Git** :
   - `github_committer.py` n'a **plus besoin de créer un blob binaire de 700 Ko dans Git** via `POST /git/blobs`.
   - Il ne commite plus que le fichier texte `public/locations.json`.
2. **Bénéfices majeurs** :
   - Dépôt Git ultra léger et propre (fini les gros binaires dans l'historique).
   - Fin des risques de timeout HTTP lors de l'envoi de gros payloads base64 à l'API GitHub.
   - Les builds Vercel deviennent instantanés car Vercel n'a plus à bundler/optimiser 50+ Mo d'images locales.

---

## 5. Script de Migration des Images Existantes

Ce script (`scripts/migrate_scenes_to_s3.py`) permet de :
1. Uploader l'ensemble des images existantes de `public/scenes/*.png` vers le bucket S3 avec les bons en-têtes HTTP de cache.
2. Mettre à jour `public/locations.json` pour remplacer les chemins relatifs `/scenes/<id>.png` par les URLs CloudFront `https://<cdn_domain>/scenes/<id>.png`.
3. Optionnellement archiver/supprimer les PNG locaux de `public/scenes/`.

```python
#!/usr/bin/env python3
"""
Script de migration des scènes Abei existantes vers S3 + CloudFront CDN.
Usage:
    python3 scripts/migrate_scenes_to_s3.py --bucket abei-tracker-scenes-eu-west-2 --cdn d12345abcdef.cloudfront.net
"""

import os
import json
import argparse
import mimetypes
import boto3

def migrate_scenes(bucket_name: str, cdn_domain: str, apply_changes: bool = False):
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    scenes_dir = os.path.join(project_root, 'public', 'scenes')
    locations_path = os.path.join(project_root, 'public', 'locations.json')

    if not os.path.exists(scenes_dir):
        print(f"[Erreur] Le dossier des scènes n'existe pas : {scenes_dir}")
        return

    s3_client = boto3.client('s3')
    cdn_base_url = f"https://{cdn_domain.rstrip('/')}"

    # 1. Upload des images vers S3
    png_files = [f for f in os.listdir(scenes_dir) if f.endswith('.png')]
    print(f"[Info] {len(png_files)} scènes trouvées dans {scenes_dir}")

    for idx, filename in enumerate(png_files, start=1):
        file_path = os.path.join(scenes_dir, filename)
        s3_key = f"scenes/{filename}"
        
        print(f"[{idx}/{len(png_files)}] Uploading {filename} -> s3://{bucket_name}/{s3_key}...")
        if apply_changes:
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
        if current_img.startswith('/scenes/'):
            filename = current_img.replace('/scenes/', '')
            new_url = f"{cdn_base_url}/scenes/{filename}"
            sighting['image'] = new_url
            updated_count += 1

    print(f"\n[Info] {updated_count} URLs de scènes mises à jour vers {cdn_base_url}")

    if apply_changes:
        with open(locations_path, 'w', encoding='utf-8') as f:
            json.dump(locations, f, indent=2, ensure_ascii=False)
            f.write('\n')
        print("[Succès] locations.json a été mis à jour avec succès !")
    else:
        print("[Dry-run] Aucun changement écrit. Passez l'argument --apply pour appliquer la migration.")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Migrer les scènes Abei vers S3 + CloudFront")
    parser.add_argument('--bucket', required=True, help="Nom du bucket S3 cible")
    parser.add_argument('--cdn', required=True, help="Domaine CloudFront (ex: d111111abcdef8.cloudfront.net)")
    parser.add_argument('--apply', action='store_true', help="Appliquer réellement les uploads et modifications")

    args = parser.parse_args()
    migrate_scenes(args.bucket, args.cdn, args.apply)
```

---

## 6. Adaptations Frontend (`EncounterModal.tsx`)

Dans `src/components/EncounterModal.tsx`, l'extraction de l'identifiant du fichier d'image dans la métabarre (`imageFileName`) doit être rendue robuste aux URLs absolues CloudFront :

```diff
- const imageFileName = sighting.image.replace('/scenes/', '')
+ const imageFileName = sighting.image.split('/').pop() || sighting.id
```

---

## 7. Plan d'Exécution Étape par Étape

1. **Déploiement Terraform** :
   - Ajouter le bucket S3, OAC, la distribution CloudFront et les policies IAM dans `terraform/main.tf`.
   - Exécuter `terraform apply` pour provisionner le bucket et le CDN (distribution disponible en ~2-3 min).
2. **Exécution de la migration initiale** :
   - Lancer `python3 scripts/migrate_scenes_to_s3.py --bucket <nom_bucket> --cdn <nom_cdn> --apply`.
3. **Mise à jour des Lambdas** :
   - Mettre à jour `lambda_function.py` pour uploader les nouveaux PNGs directement vers S3 avec `boto3`.
   - Simplifier `github_committer.py` pour ne commiter que `locations.json`.
4. **Nettoyage et validation** :
   - Vérifier que l'affichage des cartes d'observation (`EncounterModal`) charge bien les images depuis CloudFront avec une latence réduite.
   - Les fichiers PNG locaux dans `public/scenes/` peuvent ensuite être retirés de Git pour diviser la taille du dépôt par 10.
