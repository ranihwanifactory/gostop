
import { GoogleGenAI } from "@google/genai";
import { Card, GameState } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function getAiMove(gameState: GameState): Promise<number> {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const hand = currentPlayer.hand;
  const floor = gameState.floor;

  const prompt = `
    You are a professional Go-Stop (Mat-go) player. 
    Current Hand (Month-Type): ${hand.map(c => `${c.month}-${c.type}`).join(', ')}
    Cards on Floor (Month): ${floor.map(c => c.month).join(', ')}
    
    Choose the best card index (0 to ${hand.length - 1}) from the hand to play.
    Priority:
    1. Match a Bright (GWANG) card on the floor.
    2. Match any card to capture.
    3. If no matches, throw a low value Junk (PE).
    
    Respond ONLY with the single integer index.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0.1,
      }
    });

    const index = parseInt(response.text?.trim() || "0");
    if (isNaN(index) || index < 0 || index >= hand.length) return 0;
    return index;
  } catch (error) {
    console.error("AI Move error:", error);
    // Fallback logic: play first card that matches floor, or first card in hand
    for (let i = 0; i < hand.length; i++) {
        if (floor.some(f => f.month === hand[i].month)) return i;
    }
    return 0;
  }
}
