export const metrics = [
  {
    name: 'Публикация аукциона',
    target: '≥ 60%',
    type: 'Главная · продавец',
    formula: 'Продавцы с auction_publish_success / продавцы, открывшие seller_conditions × 100%.',
    detail: 'Уникальные flow_id роли seller. Успех после входа в условия в рамках того же flow_id.',
  },
  {
    name: 'Участие покупателя',
    target: '≥ 15%',
    type: 'Главная · покупатель',
    formula: 'Покупатели с auction_bid_success / покупатели, открывшие buyer_listing × 100%.',
    detail:
      'Уникальные (session_id, auction_id) роли buyer. Засчитываем только принятую ставку после просмотра карточки.',
  },
  {
    name: 'Из проверки в публикацию',
    target: '≥ 80%',
    type: 'Воронка продавца',
    formula: 'flow_id с auction_publish_success / flow_id с auction_review × 100%.',
    detail: 'Одна публикация на черновик; возврат к редактированию не создаёт новый flow_id.',
  },
  {
    name: 'Из подтверждения в ставку',
    target: '≥ 70%',
    type: 'Воронка покупателя',
    formula: 'Покупатели с auction_bid_success / покупатели с auction_bid_start × 100%.',
    detail:
      'Уникальные (session_id, auction_id); успех должен следовать за открытием подтверждения.',
  },
  {
    name: 'Ошибки отправки',
    target: '≤ 2%',
    type: 'Защитная · отдельно по роли',
    formula:
      'Попытки с auction_publish_error или auction_bid_error (result=network) / соответствующие *_submit × 100%.',
    detail:
      'Уникальные attempt_id, отдельно публикации и ставки. Повтор — новая попытка. Дедлайн считаем отдельно.',
  },
  {
    name: 'Ошибки суммы',
    target: '≤ 10%',
    type: 'Защитная · понятность правил',
    formula:
      'auction_validation_error (buyer, result=low) / (эти ошибки + auction_bid_start) × 100%.',
    detail:
      'Считаем действия по event_id. Это доля невалидных нажатий «Сделать ставку», не доля людей.',
  },
  {
    name: 'Время подтверждения',
    target: 'p95 ≤ 2,5 с',
    type: 'Защитная · скорость',
    formula:
      '95-й перцентиль timestamp(*_success) − timestamp(*_submit) для пар с одним attempt_id.',
    detail:
      'Отдельно продавец и покупатель; незавершённые и ошибочные попытки показываем рядом с долей ошибок.',
  },
  {
    name: 'Аукционы с участниками',
    target: '≥ 40%',
    type: 'Результат · ликвидность',
    formula:
      'Опубликованные auction_id с ≥ 1 auction_bid_success / все auction_id с auction_publish_success × 100%.',
    detail:
      'Соединяем роли по auction_id. Берём завершённую когорту публикаций, отводим 8 дней на ставки.',
  },
];
