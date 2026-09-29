import { classifyTelegramOpportunity, scoreOpportunity } from '../lib/scoring.js';

const cases = [
  {
    name: 'self promotion',
    text: 'Привет! Я Мария. Создаю AI-визуал для вашего товара. Открыта к заказам и сотрудничеству. Портфолио: example',
    ok: false
  },
  {
    name: 'commercial AI service ad',
    text: 'Создавайте рекламные AI-видеоролики в одном сервисе. Оплата картами МИР и СБП. Попробуйте бесплатно. Реклама ИП Example erid: 123',
    ok: false
  },
  {
    name: 'AI platform ad',
    text: 'Seedance и другие AI-инструменты в одном месте. Цены сразу в рублях. При регистрации получаете подарок. Бесплатное обучение.',
    ok: false
  },
  {
    name: 'real vacancy',
    text: 'Ищем AI-креатора для ролика бренда. Нужен специалист по AI-видео. Присылайте портфолио и стоимость.',
    ok: true
  },
  {
    name: 'informal project lead',
    text: 'Ищу AI Video-креатора. Есть проект на 15–20 секунд. Пишите в личку.',
    ok: true
  },
  {
    name: 'vacancy mentioning training benefit',
    text: 'Вакансия AI Creator. Что нужно делать: создавать AI-видео. Требования: портфолио. Условия: компенсация обучения и курсов.',
    ok: true
  }
];

let failed = 0;

for (const item of cases) {
  const result = classifyTelegramOpportunity(item.text);
  if (result.ok !== item.ok) {
    failed++;
    console.error(`FAIL ${item.name}: expected ok=${item.ok}, got ok=${result.ok}; ${result.reason}`);
  } else {
    console.log(`PASS ${item.name}: ${result.reason}`);
  }
}

const selfPromoScore = scoreOpportunity(cases[0].text);
if (selfPromoScore.score !== 0) {
  failed++;
  console.error(`FAIL self promotion score: expected 0, got ${selfPromoScore.score}`);
} else {
  console.log('PASS self promotion score = 0');
}

if (failed) process.exit(1);
