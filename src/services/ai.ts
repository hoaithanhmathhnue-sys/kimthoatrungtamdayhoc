import { GoogleGenAI } from '@google/genai';

const MODELS = ['gemini-3.1-flash', 'gemini-3.1-pro', 'gemini-2.5-flash'];

export async function askGemini(prompt: string, apiKey: string, preferredModelName?: string): Promise<string> {
  // @ts-ignore
  const envViteKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_GEMINI_API_KEY : undefined;
  // @ts-ignore
  const envKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.GEMINI_API_KEY : undefined;
  // @ts-ignore
  const procKey = typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : undefined;
  
  const finalApiKey = apiKey || envViteKey || envKey || procKey || '';
  
  if (!finalApiKey) {
    throw new Error('Vui lòng thiết lập API Key trong phần Cài đặt.');
  }

  const ai = new GoogleGenAI({ apiKey: finalApiKey });
  
  // Attempt with preferred model first, then fallback
  const modelsToTry = [preferredModelName || MODELS[0], ...MODELS.filter(m => m !== (preferredModelName || MODELS[0]))];

  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          temperature: 0.7,
        }
      });
      return response.text || '';
    } catch (error: any) {
      console.warn(`Lỗi khi gọi model ${modelName}:`, error);
      // If error is 429 quota, we try next. If it's auth error, we throw immediately.
      if (error?.message?.includes('API key not valid') || error?.status === 401) {
        throw new Error('API Key không hợp lệ hoặc đã hết hạn.');
      }
      // Continue to next model on other errors
      continue;
    }
  }
  
  throw new Error('Đã thử tất cả các model nhưng đều thất bại. Vui lòng kiểm tra lại mạng hoặc giới hạn API.');
}
