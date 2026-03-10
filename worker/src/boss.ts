import { PgBoss } from "pg-boss";

let instance: PgBoss;

export function setBoss(boss: PgBoss) {
  instance = boss;
}

export function getBoss(): PgBoss {
  return instance;
}
