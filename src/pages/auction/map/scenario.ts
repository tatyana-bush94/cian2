import type { AuctionRole } from '@/analytics/auction';

export interface ScenarioScreen {
  id: string;
  role: AuctionRole;
  step: number;
  title: string;
  note: string;
  col: number;
  row: number;
  kind?: 'error' | 'waiting' | 'success' | 'extra';
}
const seller = (
  id: string,
  step: number,
  title: string,
  note: string,
  col: number,
  row: number,
  kind?: ScenarioScreen['kind'],
): ScenarioScreen => ({ id: `seller_${id}`, role: 'seller', step, title, note, col, row, kind });
const buyer = (
  id: string,
  step: number,
  title: string,
  note: string,
  col: number,
  row: number,
  kind?: ScenarioScreen['kind'],
): ScenarioScreen => ({ id: `buyer_${id}`, role: 'buyer', step, title, note, col, row, kind });

export const screens: ScenarioScreen[] = [
  seller('conditions', 1, 'Условия аукциона', 'Цена, шаг ставки и длительность', 0, 0),
  seller('review', 2, 'Проверка условий', 'Подтверждение перед публикацией', 1, 0),
  seller('pending', 3, 'Публикация', 'Ожидание ответа · 1,2 секунды', 2, 0, 'waiting'),
  seller('published', 3, 'Аукцион запущен', 'Публикация подтверждена', 3, 0, 'success'),
  seller('listing', 4, 'Своё объявление', 'Условия опубликованной квартиры', 4, 0),
  seller('invalid', 1, 'Ошибка цены', 'Проверка до отправки', 0, 1, 'error'),
  seller('help', 1, 'Как работает аукцион', 'Общая справка для обеих ролей', 1, 1, 'extra'),
  seller('error', 3, 'Ошибка публикации', 'Условия сохранены. Можно повторить', 2, 1, 'error'),
  seller('ended', 3, 'Аукцион завершён', 'Срок истёк, ставки закрыты', 3, 1),
  seller('listing_ended', 4, 'Завершённое объявление', 'Просмотр сохранённых условий', 4, 1),
  seller('reset', 1, 'Новый черновик', 'Подтверждение сброса в режиме практики', 0, 2, 'extra'),
  buyer('listing', 1, 'Карточка квартиры', 'Цена, таймер и ввод ставки', 0, 0),
  buyer('terms', 2, 'Условия аукциона', 'Правила, шаг и срок завершения', 1, 0),
  buyer('confirm', 3, 'Подтверждение ставки', 'Сумма и условия участия', 2, 0),
  buyer('pending', 4, 'Ставка отправляется', 'Ожидание ответа · 1,6 секунды', 3, 0, 'waiting'),
  buyer('leading', 5, 'Ваша ставка лидирует', 'Участие подтверждено', 4, 0, 'success'),
  buyer('low', 3, 'Сумма ниже минимума', 'Подсказка рядом с полем', 0, 1, 'error'),
  buyer('history', 2, 'История ставок', 'Принятые ставки, от новых к старым', 1, 1),
  buyer(
    'closed',
    4,
    'Аукцион закрылся при отправке',
    'Ставка не принята до дедлайна',
    2,
    1,
    'error',
  ),
  buyer('error', 4, 'Ошибка отправки', 'Ставка не учтена. Доступен повтор', 3, 1, 'error'),
  buyer('outbid', 5, 'Вашу ставку перебили', 'Можно предложить новую сумму', 4, 1),
  buyer('not_started', 1, 'Скоро на аукционе', 'Ставки недоступны до публикации', 0, 2),
  buyer('gallery', 1, 'Фотографии', 'Просмотр трёх фото квартиры', 1, 2, 'extra'),
  buyer('ended', 6, 'Итог без участия', 'Победила ставка другого участника', 2, 2),
  buyer('lost', 6, 'Другая ставка победила', 'Ваша ставка не стала лучшей', 3, 2),
  buyer('won', 6, 'Ваша ставка победила', 'Итог аукциона для победителя', 4, 2, 'success'),
  buyer('empty', 6, 'Завершён без ставок', 'Никто не принял участие', 0, 3),
  buyer('help', 1, 'Как работает аукцион', 'Общая справка для обеих ролей', 1, 3, 'extra'),
  buyer('reset', 1, 'Готовый пример', 'Подтверждение замены демоданных', 2, 3, 'extra'),
  buyer(
    'reset_draft',
    1,
    'Аукцион до старта',
    'Подтверждение открытия неопубликованного аукциона',
    3,
    3,
    'extra',
  ),
];

export interface Transition {
  from: string;
  to: string;
  goal: string;
  label: string;
  main?: boolean;
}
const edge = (from: string, to: string, goal: string, label: string, main = false): Transition => ({
  from,
  to,
  goal,
  label,
  main,
});
export const transitions: Transition[] = [
  edge('seller_conditions', 'seller_review', 'auction_review', 'Проверить условия', true),
  edge('seller_review', 'seller_pending', 'auction_publish_submit', 'Опубликовать', true),
  edge('seller_pending', 'seller_published', 'auction_publish_success', 'Успешный ответ', true),
  edge('seller_published', 'seller_listing', 'auction_listing_open', 'Посмотреть объявление', true),
  edge('seller_conditions', 'seller_invalid', 'auction_validation_error', 'Некорректная цена'),
  edge('seller_invalid', 'seller_review', 'auction_review', 'Исправить и проверить'),
  edge('seller_review', 'seller_conditions', 'auction_edit', 'Изменить условия'),
  edge('seller_review', 'seller_review', 'auction_agree', 'Подтвердить условия'),
  edge('seller_pending', 'seller_error', 'auction_publish_error', 'Ошибка ответа'),
  edge('seller_error', 'seller_pending', 'auction_publish_submit', 'Повторить · source=retry'),
  edge('seller_error', 'seller_conditions', 'auction_edit', 'Изменить условия'),
  edge('seller_listing', 'seller_published', 'auction_listing_close', 'К результату'),
  edge('seller_published', 'seller_ended', 'auction_expired', 'Время истекло'),
  edge('seller_listing', 'seller_listing_ended', 'auction_expired', 'Время истекло'),
  edge('seller_ended', 'seller_listing_ended', 'auction_listing_open', 'Посмотреть объявление'),
  edge('seller_listing_ended', 'seller_ended', 'auction_listing_close', 'К результату'),
  edge('seller_conditions', 'seller_help', 'auction_help_open', 'Как это работает'),
  edge('seller_help', 'seller_conditions', 'auction_help_close', 'Понятно / закрыть'),
  edge('seller_conditions', 'seller_reset', 'auction_reset_open', 'Начать заново'),
  edge('seller_reset', 'seller_conditions', 'auction_reset', 'Создать черновик'),
  edge('seller_reset', 'seller_conditions', 'auction_reset_cancel', 'Оставить текущий'),
  edge('buyer_listing', 'buyer_terms', 'auction_terms_open', 'Изучить условия', true),
  edge('buyer_terms', 'buyer_confirm', 'auction_bid_start', 'Сделать ставку', true),
  edge('buyer_confirm', 'buyer_pending', 'auction_bid_submit', 'Подтвердить ставку', true),
  edge('buyer_pending', 'buyer_leading', 'auction_bid_success', 'Ставка принята', true),
  edge('buyer_listing', 'buyer_confirm', 'auction_bid_start', 'Сделать ставку'),
  edge('buyer_confirm', 'buyer_listing', 'auction_bid_cancel', 'Закрыть подтверждение'),
  edge('buyer_listing', 'buyer_low', 'auction_validation_error', 'Сумма ниже минимума'),
  edge('buyer_low', 'buyer_confirm', 'auction_bid_start', 'Исправить и продолжить'),
  edge('buyer_pending', 'buyer_error', 'auction_bid_error', 'Ошибка · result=network'),
  edge('buyer_error', 'buyer_pending', 'auction_bid_submit', 'Повторить · source=retry'),
  edge('buyer_pending', 'buyer_closed', 'auction_bid_error', 'Дедлайн · result=closed'),
  edge('buyer_leading', 'buyer_outbid', 'auction_outbid', 'Принята чужая ставка'),
  edge('buyer_outbid', 'buyer_confirm', 'auction_bid_start', 'Повысить ставку'),
  edge('buyer_leading', 'buyer_won', 'auction_result_view', 'Итог · result=won'),
  edge('buyer_outbid', 'buyer_lost', 'auction_result_view', 'Итог · result=lost'),
  edge('buyer_listing', 'buyer_ended', 'auction_result_view', 'Итог · result=not_participated'),
  edge('buyer_listing', 'buyer_empty', 'auction_result_view', 'Итог · result=no_bids'),
  edge('buyer_listing', 'buyer_history', 'auction_history_open', 'История ставок'),
  edge('buyer_history', 'buyer_listing', 'auction_about_open', 'О квартире'),
  edge('buyer_terms', 'buyer_listing', 'auction_about_open', 'О квартире'),
  edge('buyer_listing', 'buyer_gallery', 'auction_gallery_open', 'Все фото'),
  edge('buyer_gallery', 'buyer_listing', 'auction_gallery_close', 'Закрыть'),
  edge('buyer_listing', 'buyer_help', 'auction_help_open', 'Как это работает'),
  edge('buyer_help', 'buyer_listing', 'auction_help_close', 'Понятно / закрыть'),
  edge('buyer_listing', 'buyer_reset', 'auction_reset_open', 'Готовый пример'),
  edge('buyer_reset', 'buyer_listing', 'auction_reset', 'Открыть пример'),
  edge('buyer_reset', 'buyer_listing', 'auction_reset_cancel', 'Оставить текущий'),
  edge('buyer_listing', 'buyer_reset_draft', 'auction_reset_open', 'Начать заново · source=draft'),
  edge('buyer_reset_draft', 'buyer_not_started', 'auction_reset', 'Открыть аукцион до старта'),
  edge('buyer_reset_draft', 'buyer_listing', 'auction_reset_cancel', 'Оставить текущий'),
];

export function getScreen(id: string) {
  return screens.find((screen) => screen.id === id);
}
