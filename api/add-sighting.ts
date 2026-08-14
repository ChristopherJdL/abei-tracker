import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { passphrase, description } = req.body;

  // 1. Verify Passphrase
  if (!process.env.ADMIN_PASSPHRASE || passphrase !== process.env.ADMIN_PASSPHRASE) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!description) {
    return res.status(400).json({ error: 'Description is required' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  
  if (!GEMINI_API_KEY || !GITHUB_TOKEN) {
    return res.status(500).json({ error: 'Server configuration error (missing API keys)' });
  }

  const GITHUB_OWNER = 'ChristopherJdL';
  const GITHUB_REPO = 'abei-tracker';

  try {
    // 2. Gemini Text API: Extract location and details
    console.log("Calling Gemini Text API...");
    const textRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{
            text: `Given this sighting description: "${description}", extract the location name, create a witty subtitle, estimate the latitude and longitude, and create a unique kebab-case id based on the location. Return ONLY a pure JSON object (no markdown, no backticks) with keys: id, title, subtitle, lat, lng.`
          }]
        }]
      })
    });

    if (!textRes.ok) throw new Error('Failed to parse text with Gemini');
    
    const textData = await textRes.json();
    let rawJsonStr = textData.candidates[0].content.parts[0].text;
    rawJsonStr = rawJsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
    const aiData = JSON.parse(rawJsonStr);
    
    // 3. Gemini Image API: Generate pixel art
    console.log("Calling Gemini Image API...");
    const imagePrompt = `Pixel art 16-bit scene, 4:3 aspect ratio. Abei the white polar bear (red scarf, mint green shirt). Location: ${aiData.title}. Action: ${aiData.subtitle}. Face: expressionless simple black square dot eyes, tiny pouting mouth. Solid white ears, solid white paws. No text, no speech bubbles.`;
    
    const imgRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: imagePrompt }],
        parameters: { sampleCount: 1, aspectRatio: "4:3" }
      })
    });

    if (!imgRes.ok) throw new Error('Failed to generate image');
    
    const imgData = await imgRes.json();
    if (!imgData.predictions || imgData.predictions.length === 0) {
      throw new Error("L'image n'a pas pu être générée.");
    }
    const base64Image = imgData.predictions[0].bytesBase64Encoded;

    // 4. Upload Image to GitHub
    console.log("Uploading image to GitHub...");
    const imagePath = `public/scenes/${aiData.id}.png`;
    const gitImgRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${imagePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Abei-Tracker-Vercel-API'
      },
      body: JSON.stringify({
        message: `feat: add scene image for ${aiData.id}`,
        content: base64Image,
        branch: 'main'
      })
    });
    if (!gitImgRes.ok) throw new Error('Failed to upload image to GitHub');

    // 5. Update locations.json on GitHub
    console.log("Updating locations.json...");
    const getJsonRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/locations.json`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'Abei-Tracker-Vercel-API'
      }
    });
    if (!getJsonRes.ok) throw new Error('Failed to fetch locations.json');
    
    const getJsonData = await getJsonRes.json();
    const currentJsonBase64 = getJsonData.content;
    const currentSha = getJsonData.sha;
    
    // Decode base64 and parse JSON
    const jsonString = Buffer.from(currentJsonBase64, 'base64').toString('utf8');
    const locationsData = JSON.parse(jsonString);
    
    // Append new sighting
    locationsData.push({
      id: aiData.id,
      title: aiData.title,
      subtitle: aiData.subtitle,
      lat: parseFloat(aiData.lat),
      lng: parseFloat(aiData.lng),
      image: `/scenes/${aiData.id}.png`,
      status: "CONFIRMED",
      createdOn: new Date().toISOString()
    });
    
    // Re-encode and commit
    const updatedJsonString = JSON.stringify(locationsData, null, 2);
    const updatedBase64 = Buffer.from(updatedJsonString).toString('base64');
    
    const putJsonRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/locations.json`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Abei-Tracker-Vercel-API'
      },
      body: JSON.stringify({
        message: `feat: add new sighting ${aiData.title} via Vercel Admin API`,
        content: updatedBase64,
        sha: currentSha,
        branch: 'main'
      })
    });
    if (!putJsonRes.ok) throw new Error('Failed to update locations.json on GitHub');

    res.status(200).json({ success: true, message: `Sighting ${aiData.title} added successfully! Deploying...`, sighting: aiData });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
