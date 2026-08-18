import { prisma } from "./prisma.js";
import { orchestrationQueue } from "./queue.js";

export async function applyBackupSchedule(serverId: string, intervalHours: number, retentionCount: number) {
  const nextRunAt = new Date(Date.now() + intervalHours * 60 * 60 * 1000);
  const schedule = await prisma.backupSchedule.upsert({
    where: { serverId },
    create: { serverId, intervalHours, retentionCount, enabled: true, nextRunAt },
    update: { intervalHours, retentionCount, enabled: true, nextRunAt }
  });
  await orchestrationQueue.upsertJobScheduler(`backup:${serverId}`, { every: intervalHours * 60 * 60 * 1000 }, {
    name: "backup",
    data: { kind: "backup", serverId },
    opts: { removeOnComplete: 100, removeOnFail: 100 }
  });
  return schedule;
}

export async function disableBackupSchedule(serverId: string) {
  await orchestrationQueue.removeJobScheduler(`backup:${serverId}`);
  return prisma.backupSchedule.update({ where: { serverId }, data: { enabled: false, nextRunAt: null } });
}
