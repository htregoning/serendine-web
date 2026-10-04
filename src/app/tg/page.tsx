import TelegramEntry from './telegram-entry';

export const metadata = { title: 'Serendine' };

// Where the Telegram mini app opens: https://t.me/<bot>?startapp=<table code>
export default async function TelegramPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const { to } = await searchParams;
  const safeTo = to && to.startsWith('/') && !to.startsWith('//') ? to : null;
  return <TelegramEntry to={safeTo} />;
}
