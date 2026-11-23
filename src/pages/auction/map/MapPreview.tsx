import { useParams } from 'react-router-dom';
import { AuctionPage } from '../AuctionPage';
import { SellerAuctionPage } from '../SellerAuctionPage';
import { getScreen } from './scenario';

export function MapPreview() {
  const { screen: id = '' } = useParams();
  const screen = getScreen(id);
  if (!screen) return <p>Экран не найден</p>;
  const state = id.slice(screen.role.length + 1);
  return screen.role === 'seller' ? (
    <SellerAuctionPage key={id} previewScreen={state} />
  ) : (
    <AuctionPage key={id} initialRole="buyer" previewScreen={state} />
  );
}
