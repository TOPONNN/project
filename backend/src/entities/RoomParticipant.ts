import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm";
import { Room } from "./Room";
import { User } from "./User";

@Entity("room_participants")
export class RoomParticipant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column("uuid")
  roomId!: string;

  @Column("uuid", { nullable: true })
  userId?: string;

  @Column({ length: 50 })
  nickname!: string;

  @Column({ default: false })
  isHost!: boolean;

  @Column({ default: true })
  isConnected!: boolean;

  @Column({ type: "int", default: 0 })
  score!: number;

  @Column({ nullable: true })
  socketId?: string;

  @CreateDateColumn()
  joinedAt!: Date;

  @ManyToOne(() => Room, (room) => room.participants, { onDelete: "CASCADE" })
  @JoinColumn({ name: "roomId" })
  room!: Room;

  @ManyToOne(() => User, (user) => user.roomParticipants, { nullable: true })
  @JoinColumn({ name: "userId" })
  user?: User;
}
