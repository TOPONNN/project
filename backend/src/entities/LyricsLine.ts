import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { Song } from "./Song";

@Entity("lyrics_lines")
export class LyricsLine {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column("uuid")
  songId!: string;

  @Column({ type: "float" })
  startTime!: number;

  @Column({ type: "float" })
  endTime!: number;

  @Column({ type: "text" })
  text!: string;

  @Column({ type: "int" })
  lineOrder!: number;

  @Column({ type: "json", nullable: true })
  words?: Array<{ startTime: number; endTime: number; text: string }>;

  @ManyToOne(() => Song, (song) => song.lyrics, { onDelete: "CASCADE" })
  @JoinColumn({ name: "songId" })
  song!: Song;
}
