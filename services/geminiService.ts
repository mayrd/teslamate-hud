
import { GoogleGenAI } from "@google/genai";
import { TeslaData } from "../types.ts";

export const getDrivingInsight = async (data: TeslaData): Promise<string> => {
  // Direct usage of process.env.API_KEY as per SDK mandatory guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Context: I am driving a Tesla. 
    Current Vehicle Data:
    - Speed: ${data.speed} km/h
    - Battery: ${data.batteryLevel}%
    - Power Usage: ${data.power} kW
    - State: ${data.state}
    - Range: ${data.range} km
    - Outside Temp: ${data.outsideTemp}°C
    
    Provide a very short (max 10 words) encouraging or helpful driving insight based on this data. 
    Examples: "Smooth driving! Efficiency is looking great.", "Watch the speed for optimal range.", "Getting chilly! Heating will impact range."
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return response.text || "Safe travels!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Eyes on the road!";
  }
};
