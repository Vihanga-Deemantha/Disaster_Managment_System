import type { AlertNotificationRepository } from '../application/ports';
import type { AlertNotification } from '../domain/AlertNotification';
import { docToNotification, notificationToDoc } from './mappers';
import { AlertNotificationModel, type AlertNotificationDoc } from './models';

export class MongoAlertNotificationRepository implements AlertNotificationRepository {
  async insertMany(notifications: readonly AlertNotification[]): Promise<void> {
    if (notifications.length === 0) return;
    await AlertNotificationModel.insertMany(notifications.map(notificationToDoc));
  }

  /** Replaces each notification with its current state, in one round trip, creating any that are missing. */
  async saveMany(notifications: readonly AlertNotification[]): Promise<void> {
    if (notifications.length === 0) return;
    await AlertNotificationModel.bulkWrite(
      notifications.map((notification) => {
        const doc = notificationToDoc(notification);
        return { replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } };
      }),
    );
  }

  async findByWarning(warningId: string): Promise<AlertNotification[]> {
    const docs = await AlertNotificationModel.find({ warningId })
      .sort({ createdAt: 1, _id: 1 })
      .lean<AlertNotificationDoc[]>();
    return docs.map(docToNotification);
  }

  async findDeliveredByCitizen(citizenId: string, limit: number): Promise<AlertNotification[]> {
    const docs = await AlertNotificationModel.find({ citizenId, overallStatus: 'DELIVERED' })
      .sort({ createdAt: -1, _id: 1 })
      .limit(limit)
      .lean<AlertNotificationDoc[]>();
    return docs.map(docToNotification);
  }
}
