import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm";
import { User } from "./User";
import { Song } from "./Song";
import { GameMode } from "./Room";

@Entity("scores")
export class Score {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column("uuid")
  userId!: string;

  @Column("uuid")
  songId!: string;

  @Column({ type: "enum", enum: GameMode })
  gameMode!: GameMode;

  @Column({ type: "int" })
  score!: number;

  @Column({ type: "float", nullable: true })
  pitchAccuracy?: number;

  @Column({ type: "float", nullable: true })
  rhythmAccuracy?: number;

  @Column({ type: "int", nullable: true })
  correctAnswers?: number;

  @Column({ type: "int", nullable: true })
  totalQuestions?: number;

  @CreateDateColumn()
  playedAt!: Date;

  @ManyToOne(() => User, (user) => user.scores)
  @JoinColumn({ name: "userId" })
  user!: User;

  @ManyToOne(() => Song, (song) => song.scores)
  @JoinColumn({ name: "songId" })
  song!: Song;
}
