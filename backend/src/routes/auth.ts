import { Router, Request, Response } from "express";
import { authService } from "../services/AuthService";

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

export default router;
