export const ACTIVITY_TEMPLATES = {
  PRODUCT_CREATED: {
    en: 'Product "{name}" was created.',
    uz: '“{name}” nomli mahsulot yaratildi.',
    ru: 'Товар «{name}» был создан.',
  },
  PRODUCT_UPDATED: {
    en: 'Product "{name}" was updated.',
    uz: '“{name}” mahsuloti yangilandi.',
    ru: 'Товар «{name}» был обновлён.',
  },
  PRODUCT_DELETED: {
    en: 'Product "{name}" was deleted.',
    uz: '“{name}” nomli mahsulot o‘chirildi.',
    ru: 'Товар «{name}» был удален.',
  },
  PRODUCT_STATUS_CHANGED: {
    en: 'Product "{name}" status changed from {oldStatus} to {newStatus}.',
    uz: '“{name}” mahsulot statusi {oldStatus} dan {newStatus} ga o‘zgartirildi.',
    ru: 'Статус товара «{name}» изменен с {oldStatus} на {newStatus}.',
  },
  ORDER_CREATED: {
    en: 'Order #{orderNumber} was created.',
    uz: 'Buyurtma #{orderNumber} yaratildi.',
    ru: 'Заказ №{orderNumber} был создан.',
  },
  ORDER_STATUS_CHANGED: {
    en: 'Order #{orderNumber} status changed from {oldStatus} to {newStatus}.',
    uz: 'Buyurtma #{orderNumber} holati {oldStatus} dan {newStatus} ga o‘zgartirildi.',
    ru: 'Статус заказа №{orderNumber} изменён с {oldStatus} на {newStatus}.',
  },
  BOT_CREATED: {
    en: 'Bot "{name}" was created.',
    uz: '“{name}” nomli bot yaratildi.',
    ru: 'Бот «{name}» был создан.',
  },
  BOT_DELETED: {
    en: 'Bot "{name}" was deleted.',
    uz: '“{name}” nomli bot o‘chirildi.',
    ru: 'Бот «{name}» был удалён.',
  },
  BOT_STATUS_CHANGED: {
    en: 'Bot "{name}" status changed from {oldStatus} to {newStatus}.',
    uz: '“{name}” bot holati {oldStatus} dan {newStatus} ga o‘zgartirildi.',
    ru: 'Статус бота «{name}» изменён с {oldStatus} на {newStatus}.',
  },
  CHANNEL_CREATED: {
    en: 'Channel "{title}" was created.',
    uz: '“{title}” kanali yaratildi.',
    ru: 'Канал «{title}» был создан.',
  },
  CHANNEL_UPDATED: {
    en: 'Channel "{title}" was updated.',
    uz: '“{title}” kanali yangilandi.',
    ru: 'Канал «{title}» был обновлён.',
  },
  CHANNEL_DELETED: {
    en: 'Channel "{title}" was deleted.',
    uz: '“{title}” kanali o‘chirildi.',
    ru: 'Канал «{title}» был удалён.',
  },
  CHANNEL_STATUS_CHANGED: {
    en: 'Channel "{title}" status changed from {oldStatus} to {newStatus}.',
    uz: '“{title}” kanal holati {oldStatus} dan {newStatus} ga o‘zgartirildi.',
    ru: 'Статус канала «{title}» изменён с {oldStatus} на {newStatus}.',
  },
  POST_PUBLISHED: {
    en: 'Post for product "{name}" was published.',
    uz: '“{name}” mahsuloti uchun post yuborildi.',
    ru: 'Пост для товара «{name}» был опубликован.',
  },
  SCHEMA_CREATED: {
    en: 'Product schema "{name}" was created.',
    uz: '“{name}” mahsulot sxemasi yaratildi.',
    ru: 'Схема товара «{name}» была создана.',
  },
  SCHEMA_UPDATED: {
    en: 'Product schema "{name}" was updated.',
    uz: '“{name}” mahsulot sxemasi yangilandi.',
    ru: 'Схема товара «{name}» была обновлена.',
  },
  SCHEMA_DELETED: {
    en: 'Product schema "{name}" was deleted.',
    uz: '“{name}” mahsulot sxemasi o‘chirildi.',
    ru: 'Схема товара «{name}» была удалена.',
  },
} as const;

export type ActivityTemplateKey =
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'PRODUCT_STATUS_CHANGED'
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'BOT_CREATED'
  | 'BOT_DELETED'
  | 'BOT_STATUS_CHANGED'
  | 'CHANNEL_CREATED'
  | 'CHANNEL_UPDATED'
  | 'CHANNEL_DELETED'
  | 'CHANNEL_STATUS_CHANGED'
  | 'POST_PUBLISHED'
  | 'SCHEMA_CREATED'
  | 'SCHEMA_UPDATED'
  | 'SCHEMA_DELETED';

