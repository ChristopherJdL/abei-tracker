# ==========================================
# S3 Bucket for Abei Scenes
# ==========================================
resource "aws_s3_bucket" "scenes_bucket" {
  bucket = "${var.bucket_name_prefix}-${var.aws_region}"
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
# CloudFront CDN Distribution (Free Tier)
# ==========================================
resource "aws_cloudfront_distribution" "scenes_cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Abei Tracker Scenes CDN"
  default_root_object = ""
  price_class         = "PriceClass_100" # Covers US, Canada, Europe (most cost effective)

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
    default_ttl            = 86400    # 1 day
    max_ttl                = 31536000 # 1 year (immutable images)
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

# Bucket policy allowing CloudFront OAC read access
resource "aws_s3_bucket_policy" "allow_cloudfront" {
  bucket = aws_s3_bucket.scenes_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipalReadOnly"
        Effect = "Allow"
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
