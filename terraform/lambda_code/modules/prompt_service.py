"""Prompt enrichment service using Gemini generative text models."""

from google import genai

TEXT_MODELS = ["gemini-3.5-flash", "gemini-1.5-flash"]

def build_enrichment_instructions(raw_prompt: str) -> str:
    """Build the system instructions given to Gemini text models."""
    return (
        f"You are an expert 16-bit pixel art director for a classic retro video game (Game Boy Advance / SNES / arcade style).\n"
        f"The user wants to see Abei (the white polar bear with red scarf and mint green shirt) in this scene: '{raw_prompt}'.\n\n"
        f"Write a rich, highly descriptive prompt for image generation following these STRICT DIRECTIVES:\n\n"
        f"1. UNIFIED 16-BIT PIXEL ART (CRITICAL):\n"
        f"- The ENTIRE image (characters, background, sky, buildings, props) MUST be rendered in the EXACT same chunky 16-bit pixel art style.\n"
        f"- No digital airbrushing, no smooth painterly gradients, no realistic lighting. Use retro pixel clustering, limited vibrant palette, and authentic pixel shading.\n\n"
        f"2. COHERENT ACTION & INTERACTION (NO STIFF STICKERS):\n"
        f"- Characters must NOT stand stiffly side-by-side staring forward like pasted stickers.\n"
        f"- Put them in an active, dynamic, comedic, or adventurous interaction: moving with momentum, sharing props, physical comedy, or expressive interaction.\n"
        f"- Characters must share the ground plane with cast pixel shadows connecting them naturally to the environment.\n\n"
        f"3. CHARACTER INTEGRITY (ABEI):\n"
        f"- White polar bear, recognizable mint-green shirt, red scarf.\n"
        f"- Clean cute facial features: small black dot eyes, black nose, cute mouth/pout. Strictly NO eyebrows, no human facial deformation.\n\n"
        f"4. LOCAL DETAILS & ATMOSPHERE:\n"
        f"- Include unmistakable landmarks, architectural style, authentic cultural food or props specific to the location.\n\n"
        f"Output ONLY the final image generation prompt (around 80-120 words), starting with: 'Pixel art 16-bit scene, 4:3 aspect ratio.'"
    )

def build_fallback_prompt(raw_prompt: str) -> str:
    """Deterministic fallback prompt when AI text models are unreachable."""
    clean_prompt = raw_prompt.strip()
    return (
        f"Pixel art 16-bit scene, 4:3 aspect ratio. "
        f"Abei the white polar bear (red scarf, mint green shirt) and companions actively engaged in {clean_prompt}. "
        f"Chunky pixels across the entire scene including background, thick black outlines, vibrant 16-bit retro arcade color palette, "
        f"dynamic character interaction and shared pixel shadows on the ground. "
        f"No smooth digital gradients, no realistic backgrounds, strictly no character deformation, and Abei does not have eyebrows."
    )

def enrich_prompt(api_key: str, raw_prompt: str) -> str:
    """Expand the raw prompt into a cinematic, coherent pixel-art scene prompt."""
    client = genai.Client(api_key=api_key)
    instructions = build_enrichment_instructions(raw_prompt)

    print("[PromptService] 🎨 Enriching prompt with generative AI...")
    for model_name in TEXT_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=instructions,
            )
            if response and hasattr(response, 'text') and response.text:
                enhanced = f"Pixel art 16-bit scene, 4:3 aspect ratio. Abei the white polar bear (red scarf, mint green shirt). {response.text.strip()}"
                print(f"[PromptService] ✅ AI Enhanced Prompt ({model_name}): '{enhanced[:120]}...'")
                return enhanced
        except Exception as err:
            print(f"[PromptService] ⚠️ Prompt enrichment with '{model_name}' failed: {err}")

    print("[PromptService] ℹ️ Using deterministic fallback prompt enhancement.")
    return build_fallback_prompt(raw_prompt)
