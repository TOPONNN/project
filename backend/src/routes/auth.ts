import { Router, Request, Response } from "express";
import { authService } from "../services/AuthService";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password } = req.body;
    const user = await authService.register({ name, email, phone, password });
    res.status(201).json({
      success: true,
      data: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const { user, token } = await authService.login(email, password);
    res.json({
      success: true,
      data: { user: { id: user.id, name: user.name, email: user.email }, token },
    });
  } catch (error: any) {
    res.status(401).json({ success: false, message: error.message });
  }
});

router.put("/profile", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    }

    const { name, profileImage } = req.body;
    const updatedUser = await authService.updateProfile(userId, { name, profileImage });

    res.json({
      success: true,
      data: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        profileImage: updatedUser.profileImage,
        createdAt: updatedUser.createdAt,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
