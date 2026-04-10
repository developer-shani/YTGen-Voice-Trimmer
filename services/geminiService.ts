
import { GoogleGenAI, Type } from "@google/genai";

export const analyzeAudioProfile = async (fileName: string, duration: number, sampleRates: number) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `I have an audio file named "${fileName}" that is ${duration.toFixed(2)} seconds long. 
      Help me find the best silence removal parameters. Suggest a threshold (dB), minimum silence duration (ms), 
      and padding (ms) for this type of file. Provide reasoning.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedThreshold: { type: Type.NUMBER },
            suggestedMinDuration: { type: Type.NUMBER },
            suggestedPadding: { type: Type.NUMBER },
            reasoning: { type: Type.STRING }
          },
          required: ["suggestedThreshold", "suggestedMinDuration", "suggestedPadding", "reasoning"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini analysis failed", error);
    return null;
  }
};
