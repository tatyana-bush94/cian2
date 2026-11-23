import { Routes, Route } from 'react-router-dom';
import { UIKitPage } from './pages/UIKitPage';
import { SellerAuctionPage } from './pages/auction/SellerAuctionPage';
import { IPhonePreview } from './pages/auction/IPhonePreview';
export default function App() {
  return (
    <Routes>
      <Route path="/ui-kit" element={<UIKitPage />} />
      <Route path="/auction/app" element={<SellerAuctionPage />} />
      <Route path="*" element={<IPhonePreview />} />
    </Routes>
  );
}
