import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { Song } from "./Song";

@Entity("lyrics_quiz_questions")
export class LyricsQuizQuestion {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column("uuid")
  songId!: string;

  @Column({ type: "text" })
  questionText!: string;

  @Column({ type: "text" })
  correctAnswer!: string;

  @Column({ type: "simple-array" })
  wrongAnswers!: string[];

  @Column({ type: "float" })
  startTime!: number;

  @Column({ type: "float" })
  endTime!: number;

  @Column({ type: "int", default: 10 })
  timeLimit!: number;

  @Column({ type: "int", default: 1000 })
  points!: number;

  @ManyToOne(() => Song, { onDelete: "CASCADE" })
  @JoinColumn({ name: "songId" })
  song!: Song;
}
