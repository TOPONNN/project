import { Router, Request, Response } from "express";
import { AccessToken } from "livekit-server-sdk";

const router = Router();

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "***REDACTED_LIVEKIT_KEY***";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "***REDACTED_LIVEKIT_SECRET***";

router.post("/token", async (req: Request, res: Response) => {
  try {
    const { roomName, participantName, participantId } = req.body;

    if (!roomName || !participantName) {
      return res.status(400).json({ 
        success: false, 
        message: "roomName and participantName are required" 
      });
    }

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantId || participantName,
      name: participantName,
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    res.json({ success: true, data: { token } });
  } catch (error: any) {
    console.error("LiveKit token error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
