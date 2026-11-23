// Isolated preview of the existing buyer prototype, without changing app routes.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuctionPage } from '../../src/pages/auction/AuctionPage';
import '../../src/styles/global.css';

createRoot(document.getElementById('root')!).render(
  <MemoryRouter><AuctionPage /></MemoryRouter>,
);
