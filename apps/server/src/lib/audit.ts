import { prisma } from "@raina/db";

export interface AuditRecord {
  projectId?: string | null;
  userId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Records an audit log entry to the database asynchronously without blocking request execution.
 */
export async function recordAudit(entry: AuditRecord): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        projectId: entry.projectId || null,
        userId: entry.userId || null,
        action: entry.action,
        targetType: entry.targetType || null,
        targetId: entry.targetId || null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        createdAt: BigInt(Date.now()),
      },
    });
  } catch (err) {
    console.error("[audit] Failed to record audit log:", err);
  }
}
