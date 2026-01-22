import OpenAI from 'openai';
import { saveConversationSummary } from '../db/queries.js';
import { getTotalCost, costTracker, addCost } from './tools.js';

// Using Groq (free tier) instead of OpenAI
const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: any[];
}

export async function generateSummary(
  messages: ConversationMessage[],
  contactNumber: string,
  sessionId: string,
  bookedAppointments: any[]
): Promise<string> {
  try {
    
    const conversationText = messages
      .filter(m => m.role !== 'system')
      .map(m => {
        if (m.role === 'tool') {
          return `Tool: ${m.content}`;
        }
        return `${m.role}: ${m.content}`;
      })
      .join('\n');

    const userPreferences = extractPreferences(messages);

    const prompt = `Generate a concise summary of this conversation with a customer service AI agent. 
Include:
1. Main topics discussed
2. Customer requests
3. Actions taken (appointments booked, retrieved, cancelled, etc.)
4. Any important details mentioned by the customer

Conversation:
${conversationText}

Booked Appointments:
${JSON.stringify(bookedAppointments, null, 2)}

Keep the summary under 200 words and be specific about dates, times, and actions taken.`;

    const summaryInputTokens = prompt.length / 4;
    addCost('openai_summary', (summaryInputTokens / 1000) * 0.01, '1k_tokens');
    
    const response = await openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that summarizes customer service conversations.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 300,
      temperature: 0.5,
    });
    
    const summaryOutputTokens = response.usage?.completion_tokens || 0;
    addCost('openai_summary_output', (summaryOutputTokens / 1000) * 0.03, '1k_tokens');

    const summary = response.choices[0]?.message?.content || 'No summary generated.';

    const costBreakdown = {
      total: getTotalCost(),
      breakdown: costTracker.map(item => ({
        service: item.service,
        cost: item.cost,
        unit: item.unit,
      })),
    };

    await saveConversationSummary(
      contactNumber,
      sessionId,
      summary,
      bookedAppointments,
      userPreferences,
      costBreakdown
    );

    return summary;
  } catch (error) {
    console.error('Error generating summary:', error);
    return 'Summary generation failed. Conversation details saved.';
  }
}

function extractPreferences(messages: ConversationMessage[]): any {
  const preferences: any = {};
  
  // Extract preferences from conversation
  const userMessages = messages.filter(m => m.role === 'user');
  const text = userMessages.map(m => m.content).join(' ').toLowerCase();

  // Simple extraction - can be enhanced
  if (text.includes('morning') || text.includes('am')) {
    preferences.time_preference = 'morning';
  }
  if (text.includes('afternoon') || text.includes('pm')) {
    preferences.time_preference = 'afternoon';
  }
  if (text.includes('urgent') || text.includes('asap')) {
    preferences.priority = 'urgent';
  }

  return preferences;
}
