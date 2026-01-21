import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { Score } from "./Score";
import { RoomParticipant } from "./RoomParticipant";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ unique: true, length: 255 })
  email!: string;

  @Column({ length: 20 })
  phone!: string;

  @Column()
  password!: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ nullable: true })
  profileImage?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Score, (score) => score.user)
  scores!: Score[];

  @OneToMany(() => RoomParticipant, (participant) => participant.user)
  roomParticipants!: RoomParticipant[];
}
