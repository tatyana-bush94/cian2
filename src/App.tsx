import { Routes, Route } from 'react-router-dom';
import { UIKitPage } from './pages/UIKitPage';
import { SellerAuctionPage } from './pages/auction/SellerAuctionPage';
import { AuctionMapPage } from './pages/auction/map/AuctionMapPage';
import { MapPreview } from './pages/auction/map/MapPreview';
import { AuctionPage } from './pages/auction/AuctionPage';
import { IPhonePreview } from './pages/auction/IPhonePreview';
export default function App() {
  return (
    <Routes>
      <Route path="/map" element={<AuctionMapPage />} />
      <Route path="/map/preview/:screen" element={<MapPreview />} />
      <Route path="/auction/buyer" element={<IPhonePreview role="buyer" />} />
      <Route path="/auction/buyer/app" element={<AuctionPage initialRole="buyer" />} />
      <Route path="/ui-kit" element={<UIKitPage />} />
      <Route path="/auction/app" element={<SellerAuctionPage />} />
      <Route path="*" element={<IPhonePreview />} />
    </Routes>
  );
}
