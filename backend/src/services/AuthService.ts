import { AppDataSource } from "../config/database";
import { User } from "../entities";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const userRepository = AppDataSource.getRepository(User);

export class AuthService {
  async register(data: { name: string; email: string; phone: string; password: string }): Promise<User> {
    const existingUser = await userRepository.findOne({ where: { email: data.email } });
    if (existingUser) {
      throw new Error("이미 존재하는 이메일입니다.");
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = userRepository.create({
      ...data,
      password: hashedPassword,
    });

    return userRepository.save(user);
  }

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const user = await userRepository.findOne({ where: { email } });
    if (!user) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new Error("비밀번호가 일치하지 않습니다.");
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "7d" }
    );

    return { user, token };
  }

  async getUserById(id: string): Promise<User | null> {
    return userRepository.findOne({ where: { id } });
  }
}

export const authService = new AuthService();
