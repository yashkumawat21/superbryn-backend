# SuperBryn Backend - AI Voice Agent

Backend service for the AI Voice Agent using LiveKit, Deepgram, Cartesia, and OpenAI.

## Tech Stack

- **Node.js + TypeScript**: Runtime and language
- **LiveKit Agents**: Voice pipeline and real-time communication
- **Deepgram**: Speech-to-text transcription
- **Cartesia**: Text-to-speech synthesis
- **OpenAI**: LLM for conversation and tool calling
- **PostgreSQL**: Database (via Supabase)
- **Express**: HTTP server for API endpoints

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables:
- `LIVEKIT_URL`: Your LiveKit server URL (e.g., `wss://your-project.livekit.cloud`)
- `LIVEKIT_API_KEY`: LiveKit API key
- `LIVEKIT_API_SECRET`: LiveKit API secret
- `DEEPGRAM_API_KEY`: Deepgram API key (get from https://deepgram.com)
- `CARTESIA_API_KEY`: Cartesia API key (get from https://cartesia.ai)
- `CARTESIA_VOICE_ID`: Cartesia voice ID (optional)
- `OPENAI_API_KEY`: OpenAI API key
- `DATABASE_URL`: PostgreSQL connection string (Supabase)
- `PORT`: Server port (default: 3001)

### 3. Database Setup

Run the SQL schema to create tables:

```bash
psql $DATABASE_URL -f src/db/schema.sql
```

Or use Supabase dashboard to run the SQL.

### 4. Run the Server

Development mode:
```bash
npm run dev
```

Production build:
```bash
npm run build
npm start
```

## Project Structure

```
backend/
├── src/
│   ├── agent/           # LiveKit agent implementation
│   │   ├── agent.ts     # Core appointment agent logic
│   │   └── livekit-agent.ts  # LiveKit worker entry point
│   ├── db/              # Database operations
│   │   ├── connection.ts
│   │   ├── queries.ts
│   │   └── schema.sql
│   ├── services/        # External service integrations
│   │   ├── speech.ts    # Deepgram & Cartesia
│   │   ├── tools.ts     # Tool definitions & execution
│   │   └── summary.ts   # Call summary generation
│   ├── config/          # Configuration
│   │   └── slots.ts     # Hard-coded appointment slots
│   └── index.ts         # Express server
├── package.json
├── tsconfig.json
└── .env.example
```

## API Endpoints

### `POST /api/token`
Generate LiveKit access token for a room.

**Request:**
```json
{
  "roomName": "room-123",
  "participantName": "user-456"
}
```

**Response:**
```json
{
  "token": "eyJ...",
  "url": "wss://..."
}
```

## Features

- ✅ Voice conversation with LiveKit
- ✅ Speech-to-text with Deepgram
- ✅ Text-to-speech with Cartesia
- ✅ Tool calling (appointments, user identification, etc.)
- ✅ Conversation summaries
- ✅ Cost tracking
- ✅ PostgreSQL database integration

## Tool Functions

1. `identify_user` - Store user contact information
2. `fetch_slots` - Get available appointment slots
3. `book_appointment` - Book an appointment
4. `retrieve_appointments` - Get user's appointments
5. `cancel_appointment` - Cancel an appointment
6. `modify_appointment` - Change appointment date/time
7. `end_conversation` - End the call

## Running the LiveKit Agent

The LiveKit agent runs as a separate process. To start it:

```bash
livekit-agent start
```

Or use the LiveKit Cloud dashboard to deploy and manage agents.

## Notes

- The agent uses OpenAI GPT-4 for conversation and tool calling
- Deepgram is used for real-time transcription
- Cartesia provides voice synthesis
- Appointment slots are currently hard-coded (see `src/config/slots.ts`)
- Cost tracking tracks API usage for each call

## Troubleshooting

- Ensure all API keys are valid and have credits
- Check database connection string format
- Verify LiveKit server is accessible
- Check logs for specific error messages
