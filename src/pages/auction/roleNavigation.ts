import { useNavigate } from 'react-router-dom';

export type AuctionRole = 'buyer' | 'seller';
export const ROLE_MESSAGE = 'cian-auction:role';
export const auctionAppPath = (role: AuctionRole) =>
  role === 'buyer' ? '/auction/buyer/app' : '/auction/app';
export const auctionPreviewPath = (role: AuctionRole) =>
  role === 'buyer' ? '/auction/buyer' : '/auction';

export function useAuctionRoleNavigation() {
  const navigate = useNavigate();
  return (role: AuctionRole) => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: ROLE_MESSAGE, role }, window.location.origin);
    } else {
      navigate(auctionAppPath(role));
    }
  };
}
