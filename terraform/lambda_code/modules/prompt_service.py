"""Prompt enrichment service using Gemini generative text models."""

from google import genai

TEXT_MODELS = ["gemini-3.5-flash", "gemini-1.5-flash"]

def build_enrichment_instructions(raw_prompt: str) -> str:
    """Build the system instructions given to Gemini text models."""
    return (
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

def build_fallback_prompt(raw_prompt: str) -> str:
    """Deterministic fallback prompt when AI text models are unreachable."""
    clean_prompt = raw_prompt.strip()
    return (
        f"Pixel art 16-bit scene, 4:3 aspect ratio. "
        f"Abei the white polar bear (red scarf, mint green shirt) {clean_prompt}. "
        f"Chunky pixels, thick black outlines, vibrant 16-bit color palette, cinematic lighting, "
        f"strictly no character deformation, and Abei does not have eyebrows."
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
