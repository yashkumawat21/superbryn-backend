import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AccessToken, RoomServiceClient, AgentDispatchClient } from 'livekit-server-sdk';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const {
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
} = process.env;

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  throw new Error('Missing LiveKit environment variables');
}

// Initialize LiveKit clients
const roomService = new RoomServiceClient(
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

const agentDispatch = new AgentDispatchClient(
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

// Track dispatched rooms to prevent double dispatch
const dispatchedRooms = new Set<string>();

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Generate access token for LiveKit room
app.post('/api/token', async (req, res) => {
  try {
    const { roomName, participantName } = req.body;

    if (!roomName || !participantName) {
      return res
        .status(400)
        .json({ error: 'roomName and participantName are required' });
    }

    // Create the room first (if it doesn't exist)
    try {
      await roomService.createRoom({
        name: roomName,
        emptyTimeout: 60 * 10, // 10 minutes
        maxParticipants: 10,
      });
      console.log(`Room created: ${roomName}`);
    } catch (err: any) {
      // Room might already exist, that's OK
      if (!err.message?.includes('already exists')) {
        console.log('Room creation note:', err.message);
      }
    }

    // Dispatch an agent to the room (only once per room)
    if (!dispatchedRooms.has(roomName)) {
      try {
        await agentDispatch.createDispatch(roomName, 'superbryn-agent');
        dispatchedRooms.add(roomName);
        console.log(`Agent dispatched to room: ${roomName}`);

        // Clean up after 10 minutes
        setTimeout(() => dispatchedRooms.delete(roomName), 10 * 60 * 1000);
      } catch (err: any) {
        console.error('Agent dispatch error:', err.message);
      }
    } else {
      console.log(`Agent already dispatched to room: ${roomName}`);
    }

    // Create access token
    const token = new AccessToken(
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
      {
        identity: participantName,
        name: participantName,
      }
    );

    // Grant permissions
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();

    res.json({
      token: jwt,
      url: LIVEKIT_URL,
    });
  } catch (error: any) {
    console.error('Error generating token:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
