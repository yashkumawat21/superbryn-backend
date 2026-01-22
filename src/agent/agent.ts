
import OpenAI from 'openai';
import { synthesizeSpeech } from '../services/speech.js';
import { toolDefinitions, executeTool, ToolCall, resetCost, addCost } from '../services/tools.js';
import { generateSummary } from '../services/summary.js';
import { ConversationMessage } from '../services/summary.js';
import { EventEmitter } from 'events';
import type {
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface AgentState {
  contactNumber?: string;
  sessionId: string;
  messages: ChatCompletionMessageParam[];
  toolCalls: ToolCall[];
  bookedAppointments: any[];
  conversationEnded: boolean;
}

export class AppointmentAgent {
  private state: AgentState;
  private eventEmitter: EventEmitter;
  
  constructor(sessionId: string) {
    this.state = {
      sessionId,
      messages: [],
      toolCalls: [],
      bookedAppointments: [],
      conversationEnded: false,
    };
    this.eventEmitter = new EventEmitter();
    
    // Add system message
    this.state.messages.push({
      role: 'system',
      content: `You are a friendly AI assistant helping users book appointments. 
Be conversational, helpful, and concise. Always confirm appointment details before booking.
When booking appointments, extract dates in YYYY-MM-DD format and times in HH:MM format (24-hour).
Use the available tools to help users.`,
    });
  }

  getEventEmitter() {
    return this.eventEmitter;
  }

  async processUserMessage(transcript: string): Promise<string> {
    if (this.state.conversationEnded) {
      return 'The conversation has ended. Thank you!';
    }

    // Add user message
    this.state.messages.push({
      role: 'user',
      content: transcript,
    });

    try {
      // Track OpenAI API cost (approximate: $0.01 per 1K input tokens, $0.03 per 1K output tokens)
      const inputTokens = this.state.messages.reduce((sum, m) => sum + (m.content?.length || 0) / 4, 0);
      addCost('openai_chat', (inputTokens / 1000) * 0.01, '1k_tokens');
      
      // Call OpenAI with tools
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: this.state.messages,
        tools: toolDefinitions,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 500,
      });
      
      // Track output tokens
      const outputTokens = response.usage?.completion_tokens || 0;
      addCost('openai_chat_output', (outputTokens / 1000) * 0.03, '1k_tokens');

      const message = response.choices[0]?.message;
      if (!message) {
        return 'I apologize, but I could not generate a response.';
      }

      let assistantResponse = message.content || '';

      // Handle tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          const toolExecution: ToolCall = {
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments || '{}'),
          };

          // Execute tool
          toolExecution.result = await executeTool(toolExecution);
          this.state.toolCalls.push(toolExecution);

          // Emit tool call event for frontend
          this.eventEmitter.emit('toolCall', toolExecution);

          // Handle specific tool results
          if (toolCall.function.name === 'identify_user') {
            if (toolExecution.result.success) {
              this.state.contactNumber = toolExecution.arguments.contact_number;
            }
          } else if (toolCall.function.name === 'book_appointment') {
            if (toolExecution.result.success) {
              this.state.bookedAppointments.push(toolExecution.result.appointment);
            }
          } else if (toolCall.function.name === 'end_conversation') {
            this.state.conversationEnded = true;
            // Generate summary
            this.generateAndEmitSummary();
          }

          // Add tool result to conversation
          this.state.messages.push({
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: toolCall.id,
                type: 'function',
                function: {
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                },
              },
            ],
          });
          

          this.state.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolExecution.result),
          });

          // Get response after tool execution
          const followUpInputTokens = this.state.messages.reduce((sum, m) => sum + (m.content?.length || 0) / 4, 0);
          addCost('openai_chat', (followUpInputTokens / 1000) * 0.01, '1k_tokens');
          
          const followUpResponse = await openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: this.state.messages,
            temperature: 0.7,
            max_tokens: 500,
          });
          
          const followUpOutputTokens = followUpResponse.usage?.completion_tokens || 0;
          addCost('openai_chat_output', (followUpOutputTokens / 1000) * 0.03, '1k_tokens');

          assistantResponse = followUpResponse.choices[0]?.message?.content || assistantResponse;
        }
      }

      // Add assistant response
      this.state.messages.push({
        role: 'assistant',
        content: assistantResponse,
      });

      return assistantResponse;
    } catch (error) {
      console.error('Error processing message:', error);
      return 'I apologize, but I encountered an error. Please try again.';
    }
  }

  async generateAndEmitSummary() {
    if (!this.state.contactNumber) {
      return;
    }

    try {
      const summaryMessages: ConversationMessage[] = this.state.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system' || m.role === 'tool')
        .map((m) => ({
          role: (m.role === 'user' || m.role === 'assistant' || m.role === 'system' || m.role === 'tool')
            ? m.role
            : 'assistant',
          content: typeof m.content === 'string' ? m.content ?? '' : JSON.stringify(m.content ?? ''),
        }));

      const summary = await generateSummary(
        summaryMessages,
        this.state.contactNumber,
        this.state.sessionId,
        this.state.bookedAppointments
      );

      this.eventEmitter.emit('summary', {
        summary,
        bookedAppointments: this.state.bookedAppointments,
        toolCalls: this.state.toolCalls,
      });
    } catch (error) {
      console.error('Error generating summary:', error);
    }
  }

  getState() {
    return { ...this.state };
  }
}
