import {
  cli,
  defineAgent,
  llm,
  type JobContext,
  type JobProcess,
  voice,
  WorkerOptions,
} from '@livekit/agents';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as openai from '@livekit/agents-plugin-openai';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as silero from '@livekit/agents-plugin-silero';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

import { toolDefinitions, executeTool, type ToolCall, getTotalCost, costTracker } from '../services/tools.js';
import { generateSummary, type ConversationMessage } from '../services/summary.js';

dotenv.config();

// Agent state for tracking conversation per room
interface AgentSessionState {
  sessionId: string;
  contactNumber?: string;
  bookedAppointments: unknown[];
  conversationHistory: ConversationMessage[];
  toolCalls: ToolCall[];
}

const sessions = new Map<string, AgentSessionState>();

function getOrCreateSession(roomName: string): AgentSessionState {
  if (!sessions.has(roomName)) {
    sessions.set(roomName, {
      sessionId: uuidv4(),
      bookedAppointments: [],
      conversationHistory: [],
      toolCalls: [],
    });
  }
  return sessions.get(roomName)!;
}

// Create tools using the llm.tool helper
function createTools(session: AgentSessionState, ctx: JobContext): llm.ToolContext {
  const tools: llm.ToolContext = {};

  for (const toolDef of toolDefinitions) {
    const toolName = toolDef.function.name;

    tools[toolName] = llm.tool({
      description: toolDef.function.description,
      parameters: toolDef.function.parameters,
      execute: async (args: Record<string, unknown>) => {
        console.log(`Tool called: ${toolName}`, args);

        const toolCall: ToolCall = {
          name: toolName,
          arguments: args,
        };

        try {
          toolCall.result = await executeTool(toolCall);
          session.toolCalls.push(toolCall);

          // Track specific tool results
          if (toolName === 'identify_user' && toolCall.result?.success) {
            session.contactNumber = (args as { contact_number: string }).contact_number;
          } else if (toolName === 'book_appointment' && toolCall.result?.success) {
            session.bookedAppointments.push(toolCall.result.appointment);
          } else if (toolName === 'end_conversation') {
            // Generate and send summary
            if (session.contactNumber) {
              try {
                const summary = await generateSummary(
                  session.conversationHistory,
                  session.contactNumber,
                  session.sessionId,
                  session.bookedAppointments
                );

                // Send summary to room via data message with cost breakdown
                const encoder = new TextEncoder();
                const summaryData = encoder.encode(JSON.stringify({
                  type: 'summary',
                  summary,
                  bookedAppointments: session.bookedAppointments,
                  toolCalls: session.toolCalls,
                  costBreakdown: {
                    total: getTotalCost(),
                    breakdown: costTracker.map(item => ({
                      service: item.service,
                      cost: item.cost,
                      unit: item.unit,
                    })),
                  },
                }));

                await ctx.room.localParticipant?.publishData(summaryData, {
                  reliable: true,
                });
              } catch (err) {
                console.error('Error generating summary:', err);
              }
            }
          }

          // Send tool call update to frontend
          const encoder = new TextEncoder();
          const toolData = encoder.encode(JSON.stringify({
            type: 'toolCall',
            toolCall,
          }));
          await ctx.room.localParticipant?.publishData(toolData, {
            reliable: true,
          });

          return JSON.stringify(toolCall.result);
        } catch (error) {
          console.error(`Error executing tool ${toolName}:`, error);
          toolCall.result = { success: false, error: String(error) };
          return JSON.stringify(toolCall.result);
        }
      },
    });
  }

  return tools;
}

// Define the agent
export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Preload VAD model with adjusted settings for better turn detection
    // Increase minEndingSilence to wait longer before detecting end of speech
    proc.userData.vad = await silero.VAD.load({
      minSpeechDuration: 0.1,      // Minimum speech duration (100ms)
      minSilenceDuration: 0.5,     // Wait 500ms of silence before ending turn
      activationThreshold: 0.5,    // Speech detection threshold
      sampleRate: 16000,
    });
    console.log('Agent prewarm complete - VAD loaded');
  },

  entry: async (ctx: JobContext) => {
    console.log('Agent entry called for room:', ctx.room.name);

    // Connect to the room
    await ctx.connect();
    console.log('Connected to room');

    // Wait for a participant
    const participant = await ctx.waitForParticipant();
    console.log(`Participant connected: ${participant.identity}`);

    const session = getOrCreateSession(ctx.room.name || `room-${uuidv4()}`);

    // Initialize STT
    const stt = new deepgram.STT({
      model: 'nova-2-general',
      language: 'en-US',
    });

    // Initialize LLM (using Groq - free tier available)
    const llmInstance = new openai.LLM({
      model: 'llama-3.3-70b-versatile',
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });

    // Initialize TTS
    const tts = new cartesia.TTS({
      model: 'sonic-english',
      voice: process.env.CARTESIA_VOICE_ID || 'a0e99841-438c-4a64-b679-ae501e7d6091',
    });

    // Get VAD from prewarm
    const vad = ctx.proc.userData.vad as silero.VAD;

    // Create the voice agent with VAD for proper voice detection
    const agent = new voice.Agent({
      instructions: `You are a friendly AI assistant helping users book appointments.
Be conversational, helpful, and concise. Always confirm appointment details before booking.
When booking appointments, extract dates in YYYY-MM-DD format and times in HH:MM format (24-hour).

Available actions:
- Identify users by their phone number (always ask for this first)
- Fetch available appointment slots
- Book new appointments
- Retrieve existing appointments
- Cancel appointments
- Modify appointment times
- End the conversation when the user is done

Always ask for the user's phone number first to identify them before booking.`,
      vad,
      stt,
      llm: llmInstance,
      tts,
      tools: createTools(session, ctx),
    });

    // Create the agent session
    const agentSession = new voice.AgentSession({});

    // Listen for events using the event types enum
    // Only process FINAL transcripts to avoid showing partial results
    agentSession.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev: voice.UserInputTranscribedEvent) => {
      // Skip interim/partial transcripts - only show final ones
      if (!ev.isFinal) {
        console.log('User speaking (interim):', ev.transcript);
        return;
      }

      console.log('User said (final):', ev.transcript);
      session.conversationHistory.push({
        role: 'user',
        content: ev.transcript,
      });

      // Send only final transcript to frontend
      const encoder = new TextEncoder();
      const transcriptData = encoder.encode(JSON.stringify({
        type: 'transcript',
        role: 'user',
        content: ev.transcript,
      }));
      ctx.room.localParticipant?.publishData(transcriptData, { reliable: true });
    });

    agentSession.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev: voice.ConversationItemAddedEvent) => {
      if (ev.item.role === 'assistant' && ev.item.content) {
        const content = typeof ev.item.content === 'string'
          ? ev.item.content
          : JSON.stringify(ev.item.content);

        console.log('Agent said:', content);
        session.conversationHistory.push({
          role: 'assistant',
          content,
        });

        // Send transcript to frontend
        const encoder = new TextEncoder();
        const transcriptData = encoder.encode(JSON.stringify({
          type: 'transcript',
          role: 'assistant',
          content,
        }));
        ctx.room.localParticipant?.publishData(transcriptData, { reliable: true });
      }
    });

    agentSession.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev: voice.AgentStateChangedEvent) => {
      console.log('Agent state changed:', ev.oldState, '->', ev.newState);
    });

    agentSession.on(voice.AgentSessionEventTypes.Error, (ev: voice.ErrorEvent) => {
      console.error('Agent error:', ev.error);
    });

    // Start the session with the agent and room
    await agentSession.start({
      agent,
      room: ctx.room,
    });
    console.log('Agent session started');

    // Send initial greeting
    agentSession.say(
      "Hello! I'm your appointment booking assistant. How can I help you today?"
    );
  },
});

// Run the CLI if this file is executed directly
const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  cli.runApp(
    new WorkerOptions({
      agent: currentFile,
    })
  );
}
